import { Request, Response } from 'express';
import {
  PromoRewardType,
  SkinId,
  SuggestionStatus,
  SuggestionType,
  isCommonSkinId,
  isGiftableSkinId,
  isValidAnySkinId,
} from '../shared/constants.ts';
import { AuthedRequest, getClientIp } from './auth.ts';
import { SlidingRateLimiter } from './crypto.ts';
import { recordSecurityEvent } from './securityAudit.ts';
import {
  normalizePromoCode,
  repoCreatePromoCode,
  repoCreateSuggestion,
  repoDeletePromoCode,
  repoDeleteSuggestion,
  repoGetCustomCharacterConfig,
  repoGetCustomTextureBinary,
  repoGetPromoRedemptions,
  repoListAdminSuggestions,
  repoListPromoCodes,
  repoListUserSuggestions,
  repoMarkNotificationsSeen,
  repoRedeemPromoCode,
  repoSaveCustomCharacterConfig,
  repoUpdatePromoCode,
  repoUpdateSuggestionStatus,
} from './featureRepository.ts';
import {
  repoCanUserEquipSkin,
  repoFindUserById,
  repoGetAllowedExclusiveSkinsForUser,
  repoGetWalletStatsForUser,
  repoUnlockAdminKingSkin,
} from './repository.ts';

const VALID_SUGGESTION_TYPES: SuggestionType[] = ['map', 'skin'];
const VALID_SUGGESTION_STATUSES: SuggestionStatus[] = [
  'received',
  'in_review',
  'approved',
  'rejected',
];
const VALID_REWARD_TYPES: PromoRewardType[] = ['skin', 'coins', 'special', 'future_item'];
const promoRedeemLimiter = new SlidingRateLimiter(10, 5 * 60 * 1000, 3 * 60 * 1000);
const suggestionLimiter = new SlidingRateLimiter(8, 15 * 60 * 1000, 2 * 60 * 1000);

function sanitizePromoMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  try {
    const serialized = JSON.stringify(raw);
    if (serialized.length > 2048) return {};
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// --- Admin Ratão Rei Explicit Unlock ---

export async function adminUnlockKingSkinHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser;
  if (!admin || admin.role !== 'admin') {
    res.status(403).json({ error: 'Apenas administradores podem desbloquear a skin Ratão Rei.' });
    return;
  }
  const result = await repoUnlockAdminKingSkin(admin);
  res.json(result);
}

// --- Notifications ---

export async function markNotificationsSeenHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  await repoMarkNotificationsSeen(req.authUser!.id);
  res.json({ ok: true });
}

// --- Suggestions (Player & Admin) ---

export async function createSuggestionHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rate = suggestionLimiter.check(`sug:${user.id}`);
  if (!rate.allowed) {
    res.status(429).json({ error: `Muitas sugestões enviadas. Aguarde ${rate.retryAfterSec}s.` });
    return;
  }
  const { type, title, description } = req.body ?? {};

  if (!VALID_SUGGESTION_TYPES.includes(type)) {
    res.status(400).json({ error: 'Selecione um tipo válido (Mapa ou Skin).' });
    return;
  }
  if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 80) {
    res.status(400).json({ error: 'O título deve ter entre 3 e 80 caracteres.' });
    return;
  }
  if (
    typeof description !== 'string' ||
    description.trim().length < 10 ||
    description.trim().length > 1000
  ) {
    res.status(400).json({ error: 'A descrição deve ter entre 10 e 1000 caracteres.' });
    return;
  }

  const suggestion = await repoCreateSuggestion({
    user,
    type,
    title,
    description,
  });

  res.status(201).json({ suggestion });
}

export async function listMySuggestionsHandler(req: AuthedRequest, res: Response): Promise<void> {
  const suggestions = await repoListUserSuggestions(req.authUser!.id);
  res.json({ suggestions });
}

export async function adminListSuggestionsHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 60) : '';
  const rawType = typeof req.query.type === 'string' ? req.query.type : 'all';
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : 'all';

  const typeFilter = VALID_SUGGESTION_TYPES.includes(rawType as SuggestionType)
    ? (rawType as SuggestionType)
    : 'all';
  const statusFilter = VALID_SUGGESTION_STATUSES.includes(rawStatus as SuggestionStatus)
    ? (rawStatus as SuggestionStatus)
    : 'all';

  const suggestions = await repoListAdminSuggestions({
    search,
    type: typeFilter,
    status: statusFilter,
  });
  res.json({ suggestions });
}

export async function adminUpdateSuggestionHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const id = String(req.params.id || '');
  const { status, adminNote } = req.body ?? {};

  if (!VALID_SUGGESTION_STATUSES.includes(status)) {
    res.status(400).json({ error: 'Status de sugestão inválido.' });
    return;
  }

  const updated = await repoUpdateSuggestionStatus({
    id,
    status,
    adminNote: typeof adminNote === 'string' ? adminNote : null,
    adminNickname: admin.nickname,
  });

  if (!updated) {
    res.status(404).json({ error: 'Sugestão não encontrada.' });
    return;
  }
  res.json({ suggestion: updated });
}

export async function adminDeleteSuggestionHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const id = String(req.params.id || '');
  const removed = await repoDeleteSuggestion(id, admin.nickname);
  if (!removed) {
    res.status(404).json({ error: 'Sugestão não encontrada.' });
    return;
  }
  res.json({ ok: true });
}

// --- Promo Codes (Player Redemption & Admin CRUD) ---

export async function redeemPromoCodeHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const ip = getClientIp(req);
  const userRate = promoRedeemLimiter.check(`promo_u:${user.id}`);
  const ipRate = promoRedeemLimiter.check(`promo_ip:${ip}`);
  if (!userRate.allowed || !ipRate.allowed) {
    const retryAfterSec = Math.max(userRate.retryAfterSec, ipRate.retryAfterSec);
    void recordSecurityEvent({
      eventType: 'PROMO_BRUTE_FORCE_BLOCKED',
      category: 'rate_limit',
      severity: 'high',
      ip,
      userId: user.id,
      nickname: user.nickname,
      route: 'POST /api/promo-codes/redeem',
      details: `Promo code redemption rate limit exceeded (retryAfter=${retryAfterSec}s)`,
    });
    res.status(429).json({ error: `Muitas tentativas de código promocional. Aguarde ${retryAfterSec}s.` });
    return;
  }

  const { code } = req.body ?? {};
  if (typeof code !== 'string' || !code.trim()) {
    res.status(400).json({ error: 'Digite um código promocional para resgatar.' });
    return;
  }

  const result = await repoRedeemPromoCode({ user, rawCode: code });
  if (result.status !== 'ok') {
    if (result.status === 'invalid') {
      void recordSecurityEvent({
        eventType: 'PROMO_INVALID_CODE_ATTEMPT',
        category: 'economy_skate',
        severity: 'low',
        ip,
        userId: user.id,
        nickname: user.nickname,
        route: 'POST /api/promo-codes/redeem',
        details: `Invalid promo code attempt by ${user.nickname}`,
      });
    }
    const httpCode =
      result.status === 'already_redeemed'
        ? 409
        : result.status === 'expired' || result.status === 'exhausted'
          ? 410
          : result.status === 'inactive'
            ? 403
            : 404;
    res.status(httpCode).json({ error: result.error });
    return;
  }

  const freshUser = (await repoFindUserById(user.id)) || user;
  const [walletStats, allowedExclusiveSkins] = await Promise.all([
    repoGetWalletStatsForUser(user.id),
    repoGetAllowedExclusiveSkinsForUser(freshUser),
  ]);

  const unlockedSkins = Array.from(
    new Set([
      ...freshUser.unlockedSkins.filter(
        (s: SkinId) => isCommonSkinId(s) || allowedExclusiveSkins.includes(s)
      ),
      ...allowedExclusiveSkins,
    ])
  );

  res.json({
    code: result.code,
    rewardType: result.rewardType,
    rewardSkinId: result.rewardSkinId,
    rewardAmount: result.rewardAmount,
    rewardSummary: result.rewardSummary,
    walletStats,
    totalCoins: walletStats.totalCoinsCollected,
    unlockedSkins,
    allowedExclusiveSkins,
  });
}

export async function adminListPromoCodesHandler(
  _req: AuthedRequest,
  res: Response
): Promise<void> {
  const promoCodes = await repoListPromoCodes();
  res.json({ promoCodes });
}

export async function adminListPromoRedemptionsHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const id = String(req.params.id || '');
  const redemptions = await repoGetPromoRedemptions(id);
  res.json({ redemptions });
}

export async function adminCreatePromoCodeHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const {
    code: rawCode,
    description,
    rewardType,
    rewardSkinId,
    rewardAmount,
    rewardMetadata,
    maxUses,
    isInfinite,
    active,
    expiresAt,
  } = req.body ?? {};

  const code = normalizePromoCode(rawCode);
  if (!code) {
    res.status(400).json({
      error: 'Código inválido. Use 3 a 32 caracteres (letras, números, _ ou -).',
    });
    return;
  }
  if (!VALID_REWARD_TYPES.includes(rewardType)) {
    res.status(400).json({ error: 'Tipo de recompensa inválido.' });
    return;
  }
  if (rewardType === 'coins' && (!Number.isFinite(Number(rewardAmount)) || Number(rewardAmount) < 1)) {
    res.status(400).json({ error: 'Informe uma quantidade válida de moedas (mínimo 1).' });
    return;
  }
  if (rewardType === 'skin') {
    if (!isValidAnySkinId(rewardSkinId)) {
      res.status(400).json({ error: 'Selecione uma skin válida.' });
      return;
    }
    if (!isGiftableSkinId(rewardSkinId)) {
      res.status(403).json({
        error: 'Skins exclusivas de Admin e Top 1/2/3 não podem ser distribuídas por código.',
      });
      return;
    }
  }

  let parsedExpiresAt: string | null = null;
  if (typeof expiresAt === 'string' && expiresAt.trim()) {
    const dt = new Date(expiresAt);
    if (Number.isNaN(dt.getTime())) {
      res.status(400).json({ error: 'Data de expiração inválida.' });
      return;
    }
    parsedExpiresAt = dt.toISOString();
  }

  const created = await repoCreatePromoCode({
    adminNickname: admin.nickname,
    code,
    description: typeof description === 'string' ? description.slice(0, 200) : '',
    rewardType,
    rewardSkinId: rewardType === 'skin' ? (rewardSkinId as SkinId) : null,
    rewardAmount: rewardType === 'coins' ? Math.round(Number(rewardAmount)) : 0,
    rewardMetadata: sanitizePromoMetadata(rewardMetadata),
    maxUses: isInfinite ? null : Math.max(1, Math.round(Number(maxUses) || 1)),
    isInfinite: Boolean(isInfinite),
    active: active !== undefined ? Boolean(active) : true,
    expiresAt: parsedExpiresAt,
  });

  if (created.status !== 'ok') {
    if (created.status === 'duplicate') {
      res.status(409).json({ error: `Já existe um código promocional "${code}".` });
      return;
    }
    res.status(400).json({ error: 'Skin selecionada inválida para código promocional.' });
    return;
  }

  res.status(201).json({ promo: created.promo });
}

export async function adminUpdatePromoCodeHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const id = String(req.params.id || '');
  const {
    description,
    rewardType,
    rewardSkinId,
    rewardAmount,
    rewardMetadata,
    maxUses,
    isInfinite,
    active,
    expiresAt,
  } = req.body ?? {};

  if (rewardType !== undefined && !VALID_REWARD_TYPES.includes(rewardType)) {
    res.status(400).json({ error: 'Tipo de recompensa inválido.' });
    return;
  }

  let parsedExpiresAt: string | null | undefined = undefined;
  if (expiresAt === null || expiresAt === '') {
    parsedExpiresAt = null;
  } else if (typeof expiresAt === 'string') {
    const dt = new Date(expiresAt);
    if (Number.isNaN(dt.getTime())) {
      res.status(400).json({ error: 'Data de expiração inválida.' });
      return;
    }
    parsedExpiresAt = dt.toISOString();
  }

  const updated = await repoUpdatePromoCode({
    id,
    adminNickname: admin.nickname,
    description: typeof description === 'string' ? description.slice(0, 200) : undefined,
    rewardType,
    rewardSkinId: rewardSkinId as SkinId | null | undefined,
    rewardAmount: rewardAmount !== undefined ? Number(rewardAmount) : undefined,
    rewardMetadata:
      rewardMetadata !== undefined ? sanitizePromoMetadata(rewardMetadata) : undefined,
    maxUses: maxUses !== undefined ? (maxUses === null ? null : Number(maxUses)) : undefined,
    isInfinite: isInfinite !== undefined ? Boolean(isInfinite) : undefined,
    active: active !== undefined ? Boolean(active) : undefined,
    expiresAt: parsedExpiresAt,
  });

  if (updated.status !== 'ok') {
    if (updated.status === 'not_found') {
      res.status(404).json({ error: 'Código promocional não encontrado.' });
      return;
    }
    if (updated.status === 'locked_reward') {
      res.status(409).json({
        error: 'Não é possível mudar o tipo de recompensa de um código que já possui resgates.',
      });
      return;
    }
    res.status(400).json({ error: 'Skin inválida para este código promocional.' });
    return;
  }

  res.json({ promo: updated.promo });
}

export async function adminDeletePromoCodeHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const id = String(req.params.id || '');
  const removed = await repoDeletePromoCode(id, admin.nickname);
  if (!removed) {
    res.status(404).json({ error: 'Código promocional não encontrado.' });
    return;
  }
  res.json({ ok: true });
}

// --- Custom Character ("Meu Ratão") Config & Texture Serving ---

export async function getMyCustomCharacterHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const user = req.authUser!;
  const [config, unlocked] = await Promise.all([
    repoGetCustomCharacterConfig(user.id),
    repoCanUserEquipSkin(user, 'meu_ratao'),
  ]);
  res.json({ config, unlocked });
}

export async function saveMyCustomCharacterHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const user = req.authUser!;
  const result = await repoSaveCustomCharacterConfig({
    user,
    rawConfig: req.body?.config ?? req.body,
  });

  if (result.status !== 'ok') {
    res.status(result.status === 'locked' ? 403 : 400).json({ error: result.error });
    return;
  }
  res.json({ config: result.config });
}

export async function getUserCustomCharacterPublicHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'Usuário inválido.' });
    return;
  }
  const config = await repoGetCustomCharacterConfig(userId);
  res.json({ config });
}

export async function getCustomTextureHandler(req: Request, res: Response): Promise<void> {
  const textureId = String(req.params.textureId || '').trim();
  const data = await repoGetCustomTextureBinary(textureId);
  if (!data) {
    res.status(404).send('Not found');
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(data.buffer);
}
