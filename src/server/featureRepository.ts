import { and, desc, eq, ilike, or } from 'drizzle-orm';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureNeonSchema, getNeonDb, getNeonPool, isNeonConfigured } from '../db/neon.ts';
import {
  customCharacterConfigs,
  customCharacterTextures,
  notificationHistory,
  playerSuggestions,
  promoCodeRedemptions,
  promoCodes,
} from '../db/schema.ts';
import {
  ALL_SKINS,
  AccessoryTypeId,
  BottomClothingId,
  CustomBodyPartKey,
  CustomCharacterConfig,
  DEFAULT_CUSTOM_CHARACTER_CONFIG,
  GlassesTypeId,
  HairStyleId,
  HatTypeId,
  PaintRegion,
  PlayerNotificationItem,
  PlayerSuggestion,
  PromoCodeRecord,
  PromoCodeRedemptionRecord,
  PromoRewardType,
  ShoesTypeId,
  SkinId,
  SuggestionStatus,
  SuggestionType,
  TopClothingId,
  isGiftableSkinId,
  isLockedExclusiveSkinId,
  isSpecialUnlockableSkinId,
  isValidAnySkinId,
} from '../shared/constants.ts';
import { generateToken } from './crypto.ts';
import {
  repoCanUserEquipSkin,
  repoCreditWalletCoins,
  repoRecordAdminLog,
} from './repository.ts';
import { StoredUser, getDb as getLocalDb, saveDb as saveLocalDb } from './store.ts';

// Wait - verify whether PAINT_REGIONS_LIST exists in constants.ts; define safely locally too.
const VALID_PAINT_REGIONS: PaintRegion[] = ['head', 'torsoFront', 'torsoBack', 'arms', 'legs'];
const VALID_BODY_PARTS: CustomBodyPartKey[] = [
  'head',
  'torso',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
  'ears',
  'snout',
  'tail',
  'hands',
  'feet',
];
const VALID_HAIR_STYLES: HairStyleId[] = [
  'short',
  'spiky',
  'long',
  'mohawk',
  'curly',
  'pompadour',
  'bald',
];
const VALID_TOP_TYPES: TopClothingId[] = ['none', 'tshirt', 'jacket'];
const VALID_BOTTOM_TYPES: BottomClothingId[] = ['none', 'pants', 'shorts'];
const VALID_SHOES_TYPES: ShoesTypeId[] = ['none', 'sneakers', 'boots'];
const VALID_HAT_TYPES: HatTypeId[] = ['none', 'cap', 'hat'];
const VALID_GLASSES_TYPES: GlassesTypeId[] = ['none', 'sunglasses', 'visor', 'round'];
const VALID_ACCESSORY_TYPES: AccessoryTypeId[] = ['none', 'backpack', 'scarf', 'chain'];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_TEXTURE_BYTES = 64 * 1024; // 64 KB decoded PNG per region

const TEXTURE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ratao-run-textures')
  : path.resolve(process.cwd(), 'data', 'textures');

function sanitizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

function pickEnum<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  return typeof val === 'string' && (allowed as readonly string[]).includes(val)
    ? (val as T)
    : fallback;
}

function generateSuggestionCode(): string {
  return `SUG-${generateToken(3).toUpperCase()}`;
}

export function normalizePromoCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,32}$/.test(clean)) return null;
  return clean;
}

function buildRewardSummary(params: {
  rewardType: PromoRewardType;
  rewardSkinId: SkinId | null;
  rewardAmount: number;
  rewardMetadata: Record<string, unknown>;
}): string {
  if (params.rewardType === 'skin' && params.rewardSkinId) {
    const def = ALL_SKINS.find((s) => s.id === params.rewardSkinId);
    return `Skin ${def?.name || params.rewardSkinId}`;
  }
  if (params.rewardType === 'coins') {
    return `${params.rewardAmount} moedas`;
  }
  if (params.rewardType === 'future_item') {
    const label =
      typeof params.rewardMetadata?.itemLabel === 'string' && params.rewardMetadata.itemLabel.trim()
        ? params.rewardMetadata.itemLabel.trim()
        : 'Item futuro reservado';
    return label;
  }
  const specialLabel =
    typeof params.rewardMetadata?.label === 'string' && params.rewardMetadata.label.trim()
      ? params.rewardMetadata.label.trim()
      : 'Recompensa especial';
  return specialLabel;
}

// --- Notifications Repository ---

export async function repoCreateNotification(params: {
  userId: string;
  kind: PlayerNotificationItem['kind'];
  title: string;
  message: string;
}): Promise<PlayerNotificationItem> {
  const item: PlayerNotificationItem = {
    id: `ntf_${generateToken(8)}`,
    userId: params.userId,
    kind: params.kind,
    title: params.title,
    message: params.message,
    seen: false,
    createdAt: new Date().toISOString(),
  };

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.notificationHistory.unshift(item);
    if (db.notificationHistory.length > 1000) {
      db.notificationHistory.length = 1000;
    }
    saveLocalDb();
    return item;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(notificationHistory).values(item);
  return item;
}

export async function repoGetUnreadNotificationsForUser(
  userId: string
): Promise<PlayerNotificationItem[]> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.notificationHistory
      .filter((n) => n.userId === userId && !n.seen)
      .slice(0, 15);
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  return db
    .select()
    .from(notificationHistory)
    .where(and(eq(notificationHistory.userId, userId), eq(notificationHistory.seen, false)))
    .orderBy(desc(notificationHistory.createdAt))
    .limit(15);
}

export async function repoMarkNotificationsSeen(userId: string): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    let changed = false;
    for (const n of db.notificationHistory) {
      if (n.userId === userId && !n.seen) {
        n.seen = true;
        changed = true;
      }
    }
    if (changed) saveLocalDb();
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db
    .update(notificationHistory)
    .set({ seen: true })
    .where(and(eq(notificationHistory.userId, userId), eq(notificationHistory.seen, false)));
}

// --- Suggestions Repository ---

const STATUS_LABELS_PT: Record<SuggestionStatus, string> = {
  received: 'Recebida',
  in_review: 'Em análise',
  approved: 'Aprovada',
  rejected: 'Recusada',
};

export async function repoCreateSuggestion(params: {
  user: StoredUser;
  type: SuggestionType;
  title: string;
  description: string;
}): Promise<PlayerSuggestion> {
  const nowIso = new Date().toISOString();
  const suggestion: PlayerSuggestion = {
    id: `sug_${generateToken(8)}`,
    code: generateSuggestionCode(),
    userId: params.user.id,
    authorNickname: params.user.nickname,
    type: params.type,
    title: params.title.trim(),
    description: params.description.trim(),
    status: 'received',
    adminNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.playerSuggestions.unshift(suggestion);
    saveLocalDb();
    return suggestion;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(playerSuggestions).values(suggestion);
  return suggestion;
}

export async function repoListUserSuggestions(userId: string): Promise<PlayerSuggestion[]> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.playerSuggestions
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  return db
    .select()
    .from(playerSuggestions)
    .where(eq(playerSuggestions.userId, userId))
    .orderBy(desc(playerSuggestions.createdAt))
    .limit(50);
}

export async function repoListAdminSuggestions(filters: {
  search?: string;
  type?: SuggestionType | 'all';
  status?: SuggestionStatus | 'all';
}): Promise<PlayerSuggestion[]> {
  const q = filters.search?.trim().toLowerCase() || '';
  const filterType = filters.type && filters.type !== 'all' ? filters.type : null;
  const filterStatus = filters.status && filters.status !== 'all' ? filters.status : null;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.playerSuggestions
      .filter((s) => {
        if (filterType && s.type !== filterType) return false;
        if (filterStatus && s.status !== filterStatus) return false;
        if (
          q &&
          !s.authorNickname.toLowerCase().includes(q) &&
          !s.title.toLowerCase().includes(q) &&
          !s.code.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 200);
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const conds = [];
  if (filterType) conds.push(eq(playerSuggestions.type, filterType));
  if (filterStatus) conds.push(eq(playerSuggestions.status, filterStatus));
  if (q) {
    const escaped = q.replace(/[\\%_]/g, '\\$&');
    conds.push(
      or(
        ilike(playerSuggestions.authorNickname, `%${escaped}%`),
        ilike(playerSuggestions.title, `%${escaped}%`),
        ilike(playerSuggestions.code, `%${escaped}%`)
      )!
    );
  }

  return db
    .select()
    .from(playerSuggestions)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(playerSuggestions.createdAt))
    .limit(200);
}

export async function repoUpdateSuggestionStatus(params: {
  id: string;
  status: SuggestionStatus;
  adminNote?: string | null;
  adminNickname: string;
}): Promise<PlayerSuggestion | null> {
  const nowIso = new Date().toISOString();
  const cleanNote =
    typeof params.adminNote === 'string' && params.adminNote.trim().length > 0
      ? params.adminNote.trim().slice(0, 500)
      : null;

  let updated: PlayerSuggestion | null = null;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const s = db.playerSuggestions.find((x) => x.id === params.id);
    if (!s) return null;
    s.status = params.status;
    s.adminNote = cleanNote;
    s.reviewedBy = params.adminNickname;
    s.reviewedAt = nowIso;
    s.updatedAt = nowIso;
    updated = s;
    saveLocalDb();
  } else {
    await ensureNeonSchema();
    const db = getNeonDb();
    const rows = await db
      .update(playerSuggestions)
      .set({
        status: params.status,
        adminNote: cleanNote,
        reviewedBy: params.adminNickname,
        reviewedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(playerSuggestions.id, params.id))
      .returning();
    updated = rows[0] || null;
  }

  if (!updated) return null;

  await repoRecordAdminLog(
    params.adminNickname,
    'SUGESTAO_ATUALIZADA',
    `${updated.code} ("${updated.title}" de ${updated.authorNickname}) -> ${STATUS_LABELS_PT[params.status]}`
  );

  if (params.status === 'approved' || params.status === 'rejected') {
    const tipoLabel = updated.type === 'map' ? 'mapa' : 'skin';
    const noteSuffix = cleanNote ? ` Nota: ${cleanNote}` : '';
    await repoCreateNotification({
      userId: updated.userId,
      kind: 'suggestion_status',
      title:
        params.status === 'approved'
          ? `Sugestão ${updated.code} APROVADA!`
          : `Atualização na sugestão ${updated.code}`,
      message:
        params.status === 'approved'
          ? `Sua sugestão de ${tipoLabel} "${updated.title}" foi aprovada pela equipe.${noteSuffix}`
          : `Sua sugestão de ${tipoLabel} "${updated.title}" foi recusada pela equipe.${noteSuffix}`,
    });
  }

  return updated;
}

export async function repoDeleteSuggestion(
  id: string,
  adminNickname: string
): Promise<boolean> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const idx = db.playerSuggestions.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    const [removed] = db.playerSuggestions.splice(idx, 1);
    saveLocalDb();
    await repoRecordAdminLog(
      adminNickname,
      'EXCLUIR_SUGESTAO',
      `Removeu ${removed.code} ("${removed.title}")`
    );
    return true;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const deleted = await db
    .delete(playerSuggestions)
    .where(eq(playerSuggestions.id, id))
    .returning();
  if (deleted.length === 0) return false;

  await repoRecordAdminLog(
    adminNickname,
    'EXCLUIR_SUGESTAO',
    `Removeu ${deleted[0].code} ("${deleted[0].title}")`
  );
  return true;
}

// --- Promo Codes Repository ---

export async function repoListPromoCodes(): Promise<PromoCodeRecord[]> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return [...db.promoCodes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
}

export async function repoGetPromoRedemptions(
  promoCodeId: string
): Promise<PromoCodeRedemptionRecord[]> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.promoCodeRedemptions
      .filter((r) => r.promoCodeId === promoCodeId)
      .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  return db
    .select()
    .from(promoCodeRedemptions)
    .where(eq(promoCodeRedemptions.promoCodeId, promoCodeId))
    .orderBy(desc(promoCodeRedemptions.redeemedAt))
    .limit(200);
}

export async function repoCreatePromoCode(params: {
  adminNickname: string;
  code: string;
  description: string;
  rewardType: PromoRewardType;
  rewardSkinId: SkinId | null;
  rewardAmount: number;
  rewardMetadata: Record<string, unknown>;
  maxUses: number | null;
  isInfinite: boolean;
  active: boolean;
  expiresAt: string | null;
}): Promise<{ status: 'ok'; promo: PromoCodeRecord } | { status: 'duplicate' | 'invalid_skin' }> {
  if (params.rewardType === 'skin') {
    if (
      !params.rewardSkinId ||
      !isValidAnySkinId(params.rewardSkinId) ||
      !isGiftableSkinId(params.rewardSkinId)
    ) {
      return { status: 'invalid_skin' };
    }
  }

  const nowIso = new Date().toISOString();
  const record: PromoCodeRecord = {
    id: `prc_${generateToken(8)}`,
    code: params.code,
    description: params.description.trim(),
    rewardType: params.rewardType,
    rewardSkinId: params.rewardType === 'skin' ? params.rewardSkinId : null,
    rewardAmount: params.rewardType === 'coins' ? Math.max(1, Math.round(params.rewardAmount)) : 0,
    rewardMetadata: params.rewardMetadata || {},
    maxUses: params.isInfinite ? null : Math.max(1, Math.round(params.maxUses || 1)),
    isInfinite: Boolean(params.isInfinite),
    usedCount: 0,
    active: Boolean(params.active),
    expiresAt: params.expiresAt || null,
    createdBy: params.adminNickname,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    if (db.promoCodes.some((p) => p.code === record.code)) {
      return { status: 'duplicate' };
    }
    db.promoCodes.unshift(record);
    saveLocalDb();
    await repoRecordAdminLog(
      params.adminNickname,
      'CRIAR_CODIGO_PROMO',
      `Criou código ${record.code} (${record.rewardType})`
    );
    return { status: 'ok', promo: record };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const dup = await db
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(eq(promoCodes.code, record.code))
    .limit(1);
  if (dup.length > 0) return { status: 'duplicate' };

  await db.insert(promoCodes).values({
    ...record,
    rewardSkinId: record.rewardSkinId ?? null,
  });
  await repoRecordAdminLog(
    params.adminNickname,
    'CRIAR_CODIGO_PROMO',
    `Criou código ${record.code} (${record.rewardType})`
  );
  return { status: 'ok', promo: record };
}

export async function repoUpdatePromoCode(params: {
  id: string;
  adminNickname: string;
  description?: string;
  rewardType?: PromoRewardType;
  rewardSkinId?: SkinId | null;
  rewardAmount?: number;
  rewardMetadata?: Record<string, unknown>;
  maxUses?: number | null;
  isInfinite?: boolean;
  active?: boolean;
  expiresAt?: string | null;
}): Promise<
  { status: 'ok'; promo: PromoCodeRecord } | { status: 'not_found' | 'locked_reward' | 'invalid_skin' }
> {
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const p = db.promoCodes.find((x) => x.id === params.id);
    if (!p) return { status: 'not_found' };

    if (
      p.usedCount > 0 &&
      params.rewardType &&
      params.rewardType !== p.rewardType
    ) {
      return { status: 'locked_reward' };
    }

    const nextType = params.rewardType ?? p.rewardType;
    const nextSkin =
      nextType === 'skin'
        ? params.rewardSkinId !== undefined
          ? params.rewardSkinId
          : p.rewardSkinId
        : null;
    if (
      nextType === 'skin' &&
      (!nextSkin || !isValidAnySkinId(nextSkin) || !isGiftableSkinId(nextSkin))
    ) {
      return { status: 'invalid_skin' };
    }

    p.description = params.description !== undefined ? params.description.trim() : p.description;
    p.rewardType = nextType;
    p.rewardSkinId = nextSkin;
    p.rewardAmount =
      nextType === 'coins'
        ? Math.max(1, Math.round(params.rewardAmount ?? (p.rewardAmount || 100)))
        : 0;
    if (params.rewardMetadata !== undefined) p.rewardMetadata = params.rewardMetadata;
    if (params.isInfinite !== undefined) p.isInfinite = params.isInfinite;
    p.maxUses = p.isInfinite
      ? null
      : Math.max(p.usedCount || 1, Math.round((params.maxUses ?? p.maxUses) || 1));
    if (params.active !== undefined) p.active = params.active;
    if (params.expiresAt !== undefined) p.expiresAt = params.expiresAt;
    p.updatedAt = nowIso;
    saveLocalDb();
    await repoRecordAdminLog(params.adminNickname, 'EDITAR_CODIGO_PROMO', `Editou ${p.code}`);
    return { status: 'ok', promo: p };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db.select().from(promoCodes).where(eq(promoCodes.id, params.id)).limit(1);
  const p = rows[0];
  if (!p) return { status: 'not_found' };

  if (p.usedCount > 0 && params.rewardType && params.rewardType !== p.rewardType) {
    return { status: 'locked_reward' };
  }

  const nextType = params.rewardType ?? p.rewardType;
  const nextSkin =
    nextType === 'skin'
      ? params.rewardSkinId !== undefined
        ? params.rewardSkinId
        : p.rewardSkinId
      : null;
  if (
    nextType === 'skin' &&
    (!nextSkin || !isValidAnySkinId(nextSkin) || !isGiftableSkinId(nextSkin))
  ) {
    return { status: 'invalid_skin' };
  }

  const nextInfinite = params.isInfinite ?? p.isInfinite;
  const nextMaxUses = nextInfinite
    ? null
    : Math.max(p.usedCount || 1, Math.round((params.maxUses ?? p.maxUses) || 1));
  const nextAmount =
    nextType === 'coins'
      ? Math.max(1, Math.round(params.rewardAmount ?? (p.rewardAmount || 100)))
      : 0;

  const updatedRows = await db
    .update(promoCodes)
    .set({
      description: params.description !== undefined ? params.description.trim() : p.description,
      rewardType: nextType,
      rewardSkinId: nextSkin,
      rewardAmount: nextAmount,
      rewardMetadata: params.rewardMetadata ?? p.rewardMetadata,
      isInfinite: nextInfinite,
      maxUses: nextMaxUses,
      active: params.active ?? p.active,
      expiresAt: params.expiresAt !== undefined ? params.expiresAt : p.expiresAt,
      updatedAt: nowIso,
    })
    .where(eq(promoCodes.id, params.id))
    .returning();

  await repoRecordAdminLog(params.adminNickname, 'EDITAR_CODIGO_PROMO', `Editou ${p.code}`);
  return { status: 'ok', promo: updatedRows[0] };
}

export async function repoDeletePromoCode(id: string, adminNickname: string): Promise<boolean> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const idx = db.promoCodes.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    const [removed] = db.promoCodes.splice(idx, 1);
    db.promoCodeRedemptions = db.promoCodeRedemptions.filter((r) => r.promoCodeId !== id);
    saveLocalDb();
    await repoRecordAdminLog(adminNickname, 'EXCLUIR_CODIGO_PROMO', `Removeu código ${removed.code}`);
    return true;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const deleted = await db.delete(promoCodes).where(eq(promoCodes.id, id)).returning();
  if (deleted.length === 0) return false;
  await repoRecordAdminLog(
    adminNickname,
    'EXCLUIR_CODIGO_PROMO',
    `Removeu código ${deleted[0].code}`
  );
  return true;
}

export type RedeemPromoResult =
  | {
      status: 'ok';
      code: string;
      rewardType: PromoRewardType;
      rewardSkinId: SkinId | null;
      rewardAmount: number;
      rewardSummary: string;
    }
  | {
      status:
        | 'invalid'
        | 'inactive'
        | 'expired'
        | 'exhausted'
        | 'already_redeemed';
      error: string;
    };

export async function repoRedeemPromoCode(params: {
  user: StoredUser;
  rawCode: string;
}): Promise<RedeemPromoResult> {
  const cleanCode = normalizePromoCode(params.rawCode);
  if (!cleanCode) {
    return { status: 'invalid', error: 'Código promocional inválido.' };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const promo = db.promoCodes.find((p) => p.code === cleanCode);
    if (!promo) {
      return { status: 'invalid', error: 'Código inválido ou não encontrado.' };
    }
    if (!promo.active) {
      return { status: 'inactive', error: 'Este código promocional está desativado.' };
    }
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() <= nowMs) {
      return { status: 'expired', error: 'Este código promocional expirou.' };
    }
    if (!promo.isInfinite && promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return { status: 'exhausted', error: 'Este código promocional atingiu o limite máximo de resgates.' };
    }
    const alreadyRedeemed = db.promoCodeRedemptions.some(
      (r) => r.promoCodeId === promo.id && r.userId === params.user.id
    );
    if (alreadyRedeemed) {
      return { status: 'already_redeemed', error: 'Você já resgatou este código anteriormente.' };
    }

    const rewardSummary = buildRewardSummary({
      rewardType: promo.rewardType,
      rewardSkinId: promo.rewardSkinId,
      rewardAmount: promo.rewardAmount,
      rewardMetadata: promo.rewardMetadata,
    });

    promo.usedCount += 1;
    promo.updatedAt = nowIso;

    db.promoCodeRedemptions.unshift({
      id: `pcr_${generateToken(8)}`,
      promoCodeId: promo.id,
      code: promo.code,
      userId: params.user.id,
      nickname: params.user.nickname,
      rewardType: promo.rewardType,
      rewardSummary,
      redeemedAt: nowIso,
    });

    if (promo.rewardType === 'skin' && promo.rewardSkinId) {
      const targetUser = db.users[params.user.id];
      if (targetUser && !targetUser.unlockedSkins.includes(promo.rewardSkinId)) {
        targetUser.unlockedSkins.push(promo.rewardSkinId);
      }
      if (
        isSpecialUnlockableSkinId(promo.rewardSkinId) ||
        isLockedExclusiveSkinId(promo.rewardSkinId)
      ) {
        const hasPerm = db.exclusiveSkinPermissions.some(
          (p) => p.userId === params.user.id && p.skinId === promo.rewardSkinId && p.active
        );
        if (!hasPerm) {
          db.exclusiveSkinPermissions.push({
            id: `eperm_${generateToken(8)}`,
            userId: params.user.id,
            skinId: promo.rewardSkinId,
            reason: 'promo_code',
            rankPosition: null,
            active: true,
            grantedAt: nowIso,
            revokedAt: null,
            updatedAt: nowIso,
          });
        }
      }
    }

    saveLocalDb();

    if (promo.rewardType === 'coins' && promo.rewardAmount > 0) {
      await repoCreditWalletCoins({
        userId: params.user.id,
        amount: promo.rewardAmount,
        sourceType: 'promo',
        eventKey: `promo:${promo.id}:${params.user.id}`,
      });
    }

    return {
      status: 'ok',
      code: promo.code,
      rewardType: promo.rewardType,
      rewardSkinId: promo.rewardSkinId,
      rewardAmount: promo.rewardAmount,
      rewardSummary,
    };
  }

  // Neon Atomic Transaction with row-level lock (`SELECT ... FOR UPDATE`)
  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();

  let committedPromo: PromoCodeRecord | null = null;
  let committedSummary = '';

  try {
    await client.query('BEGIN');

    const promoRes = await client.query<{
      id: string;
      code: string;
      description: string;
      reward_type: PromoRewardType;
      reward_skin_id: SkinId | null;
      reward_amount: number;
      reward_metadata: Record<string, unknown>;
      max_uses: number | null;
      is_infinite: boolean;
      used_count: number;
      active: boolean;
      expires_at: string | null;
      created_by: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, code, description, reward_type, reward_skin_id, reward_amount, reward_metadata,
              max_uses, is_infinite, used_count, active, expires_at, created_by, created_at, updated_at
       FROM promo_codes
       WHERE code = $1
       FOR UPDATE`,
      [cleanCode]
    );

    const row = promoRes.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { status: 'invalid', error: 'Código inválido ou não encontrado.' };
    }
    if (!row.active) {
      await client.query('ROLLBACK');
      return { status: 'inactive', error: 'Este código promocional está desativado.' };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) {
      await client.query('ROLLBACK');
      return { status: 'expired', error: 'Este código promocional expirou.' };
    }
    if (!row.is_infinite && row.max_uses !== null && row.used_count >= row.max_uses) {
      await client.query('ROLLBACK');
      return {
        status: 'exhausted',
        error: 'Este código promocional atingiu o limite máximo de resgates.',
      };
    }

    const dupRes = await client.query(
      `SELECT id FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2 LIMIT 1`,
      [row.id, params.user.id]
    );
    if (dupRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return { status: 'already_redeemed', error: 'Você já resgatou este código anteriormente.' };
    }

    const rewardSummary = buildRewardSummary({
      rewardType: row.reward_type,
      rewardSkinId: row.reward_skin_id,
      rewardAmount: row.reward_amount,
      rewardMetadata: row.reward_metadata || {},
    });

    await client.query(
      `INSERT INTO promo_code_redemptions (id, promo_code_id, code, user_id, nickname, reward_type, reward_summary, redeemed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `pcr_${generateToken(8)}`,
        row.id,
        row.code,
        params.user.id,
        params.user.nickname,
        row.reward_type,
        rewardSummary,
        nowIso,
      ]
    );

    await client.query(
      `UPDATE promo_codes SET used_count = used_count + 1, updated_at = $1 WHERE id = $2`,
      [nowIso, row.id]
    );

    if (row.reward_type === 'skin' && row.reward_skin_id) {
      const uRes = await client.query<{ unlocked_skins: SkinId[] }>(
        `SELECT unlocked_skins FROM users WHERE id = $1 FOR UPDATE`,
        [params.user.id]
      );
      const currentUnlocked = Array.isArray(uRes.rows[0]?.unlocked_skins)
        ? uRes.rows[0].unlocked_skins
        : [];
      if (!currentUnlocked.includes(row.reward_skin_id)) {
        const nextUnlocked = [...currentUnlocked, row.reward_skin_id];
        await client.query(`UPDATE users SET unlocked_skins = $1::jsonb WHERE id = $2`, [
          JSON.stringify(nextUnlocked),
          params.user.id,
        ]);
      }

      if (
        isSpecialUnlockableSkinId(row.reward_skin_id) ||
        isLockedExclusiveSkinId(row.reward_skin_id)
      ) {
        const permRes = await client.query(
          `SELECT id FROM exclusive_skin_permissions WHERE user_id = $1 AND skin_id = $2 AND active = TRUE LIMIT 1`,
          [params.user.id, row.reward_skin_id]
        );
        if (permRes.rows.length === 0) {
          await client.query(
            `INSERT INTO exclusive_skin_permissions (id, user_id, skin_id, reason, rank_position, active, granted_at, revoked_at, updated_at)
             VALUES ($1, $2, $3, 'promo_code', NULL, TRUE, $4, NULL, $4)`,
            [`eperm_${generateToken(8)}`, params.user.id, row.reward_skin_id, nowIso]
          );
        }
      }
    }

    await client.query('COMMIT');

    committedPromo = {
      id: row.id,
      code: row.code,
      description: row.description,
      rewardType: row.reward_type,
      rewardSkinId: row.reward_skin_id,
      rewardAmount: row.reward_amount,
      rewardMetadata: row.reward_metadata || {},
      maxUses: row.max_uses,
      isInfinite: row.is_infinite,
      usedCount: row.used_count + 1,
      active: row.active,
      expiresAt: row.expires_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: nowIso,
    };
    committedSummary = rewardSummary;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const pgCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (pgCode === '23505') {
      return { status: 'already_redeemed', error: 'Você já resgatou este código anteriormente.' };
    }
    throw err;
  } finally {
    client.release();
  }

  if (committedPromo.rewardType === 'coins' && committedPromo.rewardAmount > 0) {
    await repoCreditWalletCoins({
      userId: params.user.id,
      amount: committedPromo.rewardAmount,
      sourceType: 'promo',
      eventKey: `promo:${committedPromo.id}:${params.user.id}`,
    });
  }

  return {
    status: 'ok',
    code: committedPromo.code,
    rewardType: committedPromo.rewardType,
    rewardSkinId: committedPromo.rewardSkinId,
    rewardAmount: committedPromo.rewardAmount,
    rewardSummary: committedSummary,
  };
}

// --- Custom Character ("Meu Ratão") Config + Safe PNG Texture Storage ---

export function validateAndSanitizePngDataUrl(raw: unknown):
  | { ok: true; buffer: Buffer; dataUrl: string }
  | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Textura inválida.' };
  }
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('<svg') ||
    lower.includes('<script') ||
    lower.includes('javascript:') ||
    lower.includes('<html')
  ) {
    return { ok: false, error: 'Formato de textura não permitido.' };
  }

  const prefix = 'data:image/png;base64,';
  if (!trimmed.startsWith(prefix)) {
    return { ok: false, error: 'Apenas imagens PNG válidas são aceitas.' };
  }

  const b64 = trimmed.slice(prefix.length);
  if (b64.length > 100000) {
    return { ok: false, error: 'Textura PNG excede o tamanho máximo permitido.' };
  }

  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 24 || buf.length > MAX_TEXTURE_BYTES) {
    return { ok: false, error: 'Tamanho de textura PNG fora dos limites (máx. 64KB).' };
  }
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    return { ok: false, error: 'Assinatura PNG inválida.' };
  }

  return { ok: true, buffer: buf, dataUrl: `${prefix}${buf.toString('base64')}` };
}

export function sanitizeCustomCharacterConfigInput(
  raw: unknown
): { config: CustomCharacterConfig; uploadedPngs: Partial<Record<PaintRegion, Buffer>> } | { error: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<CustomCharacterConfig>;
  const def = DEFAULT_CUSTOM_CHARACTER_CONFIG;

  const bodyColors = { ...def.bodyColors };
  if (input.bodyColors && typeof input.bodyColors === 'object') {
    for (const part of VALID_BODY_PARTS) {
      bodyColors[part] = sanitizeHexColor(
        (input.bodyColors as Record<string, unknown>)[part],
        def.bodyColors[part]
      );
    }
  }

  const rawCloth = (input.clothing && typeof input.clothing === 'object'
    ? input.clothing
    : {}) as Record<string, unknown>;

  const clothing: CustomCharacterConfig['clothing'] = {
    topType: pickEnum(rawCloth.topType, VALID_TOP_TYPES, def.clothing.topType),
    topColor: sanitizeHexColor(rawCloth.topColor, def.clothing.topColor),
    bottomType: pickEnum(rawCloth.bottomType, VALID_BOTTOM_TYPES, def.clothing.bottomType),
    bottomColor: sanitizeHexColor(rawCloth.bottomColor, def.clothing.bottomColor),
    shoesType: pickEnum(rawCloth.shoesType, VALID_SHOES_TYPES, def.clothing.shoesType),
    shoesColor: sanitizeHexColor(rawCloth.shoesColor, def.clothing.shoesColor),
    hatType: pickEnum(rawCloth.hatType, VALID_HAT_TYPES, def.clothing.hatType),
    hatColor: sanitizeHexColor(rawCloth.hatColor, def.clothing.hatColor),
    glassesType: pickEnum(rawCloth.glassesType, VALID_GLASSES_TYPES, def.clothing.glassesType),
    glassesColor: sanitizeHexColor(rawCloth.glassesColor, def.clothing.glassesColor),
    accessoryType: pickEnum(rawCloth.accessoryType, VALID_ACCESSORY_TYPES, def.clothing.accessoryType),
    accessoryColor: sanitizeHexColor(rawCloth.accessoryColor, def.clothing.accessoryColor),
  };

  const favoriteColorsRaw = Array.isArray(input.favoriteColors) ? input.favoriteColors : def.favoriteColors;
  const favoriteColors: string[] = [];
  for (const c of favoriteColorsRaw) {
    const clean = sanitizeHexColor(c, '');
    if (clean && !favoriteColors.includes(clean)) {
      favoriteColors.push(clean);
      if (favoriteColors.length >= 16) break;
    }
  }

  const uploadedPngs: Partial<Record<PaintRegion, Buffer>> = {};
  const preservedUrls: Partial<Record<PaintRegion, string>> = {};

  if (input.paintTextures && typeof input.paintTextures === 'object') {
    for (const region of VALID_PAINT_REGIONS) {
      const val = (input.paintTextures as Record<string, unknown>)[region];
      if (!val || typeof val !== 'string' || !val.trim()) continue;
      const trimmed = val.trim();
      if (trimmed.startsWith('/api/custom-character/textures/')) {
        preservedUrls[region] = trimmed;
      } else {
        const checked = validateAndSanitizePngDataUrl(trimmed);
        if (!checked.ok) {
          return { error: `Região ${region}: ${checked.error}` };
        }
        uploadedPngs[region] = checked.buffer;
      }
    }
  }

  return {
    config: {
      version: Math.max(1, Number(input.version) || 1),
      bodyColors,
      hairStyle: pickEnum(input.hairStyle, VALID_HAIR_STYLES, def.hairStyle),
      hairColor: sanitizeHexColor(input.hairColor, def.hairColor),
      clothing,
      favoriteColors: favoriteColors.length > 0 ? favoriteColors : [...def.favoriteColors],
      paintTextures: preservedUrls,
      updatedAt: new Date().toISOString(),
    },
    uploadedPngs,
  };
}

function writeTextureFileBestEffort(id: string, buf: Buffer): void {
  try {
    if (!fs.existsSync(TEXTURE_DIR)) {
      fs.mkdirSync(TEXTURE_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(path.join(TEXTURE_DIR, `${id}.png`), buf, { mode: 0o600 });
  } catch {
    // Non-fatal in ephemeral environments; DB holds full dataBase64 fallback
  }
}

export async function repoGetCustomCharacterConfig(
  userId: string
): Promise<CustomCharacterConfig> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.customCharacterConfigs[userId] || { ...DEFAULT_CUSTOM_CHARACTER_CONFIG };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(customCharacterConfigs)
    .where(eq(customCharacterConfigs.userId, userId))
    .limit(1);

  if (!rows[0]) {
    return { ...DEFAULT_CUSTOM_CHARACTER_CONFIG };
  }
  return rows[0].configJson;
}

export async function repoSaveCustomCharacterConfig(params: {
  user: StoredUser;
  rawConfig: unknown;
}): Promise<
  | { status: 'ok'; config: CustomCharacterConfig }
  | { status: 'locked' | 'invalid'; error: string }
> {
  const canUse = await repoCanUserEquipSkin(params.user, 'meu_ratao');
  if (!canUse) {
    return {
      status: 'locked',
      error:
        'A skin Meu Ratão ainda está bloqueada. Desbloqueie por código promocional ou presente do administrador.',
    };
  }

  const parsed = sanitizeCustomCharacterConfigInput(params.rawConfig);
  if ('error' in parsed) {
    return { status: 'invalid', error: parsed.error };
  }

  const { config, uploadedPngs } = parsed;
  const nowIso = new Date().toISOString();
  const nowTs = Date.now();
  const finalPaintTextures: Partial<Record<PaintRegion, string>> = { ...config.paintTextures };

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const existing = db.customCharacterConfigs[params.user.id];
    const nextVersion = (existing?.version || 0) + 1;

    for (const region of VALID_PAINT_REGIONS) {
      const buf = uploadedPngs[region];
      if (buf) {
        const texId = `tex_${params.user.id}_${region}`;
        const url = `/api/custom-character/textures/${texId}?v=${nowTs}`;
        writeTextureFileBestEffort(texId, buf);
        const existingIdx = db.customCharacterTextures.findIndex(
          (t) => t.userId === params.user.id && t.region === region
        );
        const texRow = {
          id: texId,
          userId: params.user.id,
          region,
          storageUrl: url,
          dataBase64: buf.toString('base64'),
          contentType: 'image/png',
          byteSize: buf.length,
          updatedAt: nowIso,
        };
        if (existingIdx >= 0) db.customCharacterTextures[existingIdx] = texRow;
        else db.customCharacterTextures.push(texRow);
        finalPaintTextures[region] = url;
      } else if (!finalPaintTextures[region]) {
        db.customCharacterTextures = db.customCharacterTextures.filter(
          (t) => !(t.userId === params.user.id && t.region === region)
        );
      }
    }

    const nextConfig: CustomCharacterConfig = {
      ...config,
      version: nextVersion,
      paintTextures: finalPaintTextures,
      updatedAt: nowIso,
    };
    db.customCharacterConfigs[params.user.id] = nextConfig;
    saveLocalDb();
    return { status: 'ok', config: nextConfig };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const existingRows = await db
    .select()
    .from(customCharacterConfigs)
    .where(eq(customCharacterConfigs.userId, params.user.id))
    .limit(1);
  const nextVersion = (existingRows[0]?.version || 0) + 1;

  for (const region of VALID_PAINT_REGIONS) {
    const buf = uploadedPngs[region];
    if (buf) {
      const texId = `tex_${params.user.id}_${region}`;
      const url = `/api/custom-character/textures/${texId}?v=${nowTs}`;
      writeTextureFileBestEffort(texId, buf);

      await db
        .insert(customCharacterTextures)
        .values({
          id: texId,
          userId: params.user.id,
          region,
          storageUrl: url,
          dataBase64: buf.toString('base64'),
          contentType: 'image/png',
          byteSize: buf.length,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: [customCharacterTextures.userId, customCharacterTextures.region],
          set: {
            id: texId,
            storageUrl: url,
            dataBase64: buf.toString('base64'),
            contentType: 'image/png',
            byteSize: buf.length,
            updatedAt: nowIso,
          },
        });
      finalPaintTextures[region] = url;
    } else if (!finalPaintTextures[region]) {
      await db
        .delete(customCharacterTextures)
        .where(
          and(
            eq(customCharacterTextures.userId, params.user.id),
            eq(customCharacterTextures.region, region)
          )
        );
    }
  }

  const nextConfig: CustomCharacterConfig = {
    ...config,
    version: nextVersion,
    paintTextures: finalPaintTextures,
    updatedAt: nowIso,
  };

  await db
    .insert(customCharacterConfigs)
    .values({
      userId: params.user.id,
      configJson: nextConfig,
      version: nextVersion,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: customCharacterConfigs.userId,
      set: {
        configJson: nextConfig,
        version: nextVersion,
        updatedAt: nowIso,
      },
    });

  return { status: 'ok', config: nextConfig };
}

export async function repoGetCustomTextureBinary(
  textureId: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!/^tex_[a-zA-Z0-9_]+$/.test(textureId)) return null;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const row = db.customCharacterTextures.find((t) => t.id === textureId);
    if (row?.dataBase64) {
      return { buffer: Buffer.from(row.dataBase64, 'base64'), contentType: 'image/png' };
    }
    const filePath = path.join(TEXTURE_DIR, `${textureId}.png`);
    if (fs.existsSync(filePath)) {
      return { buffer: fs.readFileSync(filePath), contentType: 'image/png' };
    }
    return null;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(customCharacterTextures)
    .where(eq(customCharacterTextures.id, textureId))
    .limit(1);
  if (!rows[0]?.dataBase64) return null;
  return {
    buffer: Buffer.from(rows[0].dataBase64, 'base64'),
    contentType: 'image/png',
  };
}
