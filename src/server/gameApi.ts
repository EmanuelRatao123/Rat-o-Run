import { Request, Response } from 'express';
import {
  LeaderboardCategory,
  MapId,
  SkinId,
  SoloGameMode,
  isGiftableSkinId,
  isValidAnySkinId,
} from '../shared/constants.ts';
import { AuthedRequest } from './auth.ts';
import { generateToken, signHmac, verifyHmac } from './crypto.ts';
import {
  repoGetCustomCharacterConfig,
  repoGetUnreadNotificationsForUser,
} from './featureRepository.ts';
import {
  repoAdminGrantLockedSkin,
  repoAdminListExclusiveSkinOwners,
  repoAdminRevokeLockedSkin,
  repoCanUserEquipSkin,
  repoCloseGlobalPoll,
  repoCompleteMatchAndRecord,
  repoComputePlayerRank,
  repoCreateActiveMatch,
  repoCreateGlobalMessage,
  repoCreateGlobalPoll,
  repoDeleteGlobalMessage,
  repoFindUserByNickname,
  repoGetActiveMatch,
  repoGetAdminDashboardData,
  repoGetCoinsLeaderboard,
  repoGetCompetitiveStatsForUser,
  repoGetLeaderboard,
  repoGetRecentX1ResultsForUser,
  repoGetSocialFeed,
  repoGetWalletStatsForUser,
  repoGiftSkinToPlayer,
  repoMarkGiftsSeen,
  repoSearchPlayersForAdmin,
  repoUpdateUserEquippedSkin,
  repoVoteOnPoll,
} from './repository.ts';

const VALID_MAPS: MapId[] = ['brasil', 'tokyo', 'futebol', 'capivara'];

const isValidSkinId = isValidAnySkinId;

function isValidMapId(val: unknown): val is MapId {
  return typeof val === 'string' && (VALID_MAPS as string[]).includes(val);
}

export async function equipSkinHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const { skinId } = req.body ?? {};
  if (!isValidSkinId(skinId)) {
    res.status(400).json({ error: 'Skin inválida.' });
    return;
  }
  const allowed = await repoCanUserEquipSkin(user, skinId);
  if (!allowed) {
    res.status(403).json({ error: 'Você não possui permissão para equipar esta skin exclusiva.' });
    return;
  }
  await repoUpdateUserEquippedSkin(user.id, skinId);
  res.json({ equippedSkin: skinId });
}

export async function startMatchHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const { mapId, skinId, mode } = req.body ?? {};
  if (!isValidMapId(mapId)) {
    res.status(400).json({ error: 'Mapa inválido.' });
    return;
  }
  if (mode !== undefined && mode !== 'normal' && mode !== 'no_coin') {
    res.status(400).json({ error: 'Modo de jogo inválido.' });
    return;
  }
  const chosenMode: SoloGameMode = mode === 'normal' ? 'normal' : 'no_coin';
  const chosenSkin: SkinId = isValidSkinId(skinId) ? skinId : user.equippedSkin;
  if (!(await repoCanUserEquipSkin(user, chosenSkin))) {
    res.status(403).json({ error: 'Skin exclusiva não autorizada para esta conta.' });
    return;
  }
  const matchId = `m_${generateToken(10)}`;
  const startedAt = Date.now();
  const payload = `${matchId}:${user.id}:${startedAt}:${mapId}:${chosenSkin}:${chosenMode}`;
  const signature = signHmac(payload);

  await repoCreateActiveMatch({
    matchId,
    userId: user.id,
    mode: chosenMode,
    mapId,
    skinId: chosenSkin,
    startedAt,
    signature,
    completed: false,
  });

  res.json({ matchId, startedAt, signature, mode: chosenMode });
}

export async function finishMatchHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const {
    matchId,
    signature,
    noCoinTimeMs,
    collectedCoin,
    coins,
    distance,
    score,
    durationMs,
    endReason,
  } = req.body ?? {};

  if (typeof matchId !== 'string' || typeof signature !== 'string') {
    res.status(400).json({ error: 'Identificador de partida inválido.' });
    return;
  }

  const active = await repoGetActiveMatch(matchId);
  if (!active || active.userId !== user.id || active.completed) {
    res.status(400).json({ error: 'Partida inválida ou já finalizada.' });
    return;
  }

  const activeMode: SoloGameMode = active.mode === 'normal' ? 'normal' : 'no_coin';
  const expectedPayload = `${active.matchId}:${user.id}:${active.startedAt}:${active.mapId}:${active.skinId}:${activeMode}`;
  const legacyPayload = `${active.matchId}:${user.id}:${active.startedAt}:${active.mapId}:${active.skinId}`;
  const sigMatches =
    active.signature === signature &&
    (verifyHmac(expectedPayload, signature) || verifyHmac(legacyPayload, signature));

  if (!sigMatches) {
    res.status(403).json({ error: 'Assinatura de partida inválida.' });
    return;
  }

  const now = Date.now();
  const wallElapsedMs = Math.max(0, now - active.startedAt);

  const safeDuration = Number(durationMs);
  const safeNoCoin = activeMode === 'no_coin' ? Number(noCoinTimeMs) : 0;
  const safeCoins = Number(coins);
  const safeDistance = Number(distance);
  const safeScore = Number(score);
  const safeCollectedCoin = Boolean(collectedCoin);

  if (
    !Number.isFinite(safeDuration) ||
    !Number.isFinite(safeNoCoin) ||
    !Number.isFinite(safeCoins) ||
    !Number.isFinite(safeDistance) ||
    !Number.isFinite(safeScore) ||
    safeDuration < 0 ||
    safeNoCoin < 0 ||
    safeCoins < 0 ||
    safeDistance < 0 ||
    safeScore < 0
  ) {
    res.status(400).json({ error: 'Dados da partida inválidos.' });
    return;
  }

  // Server-side anti-cheat plausibility checks
  if (safeDuration > wallElapsedMs + 5000) {
    res.status(422).json({ error: 'Duração incompatível com o tempo real da partida.' });
    return;
  }
  if (activeMode === 'no_coin') {
    if (safeNoCoin > safeDuration + 150) {
      res.status(422).json({ error: 'Tempo sem moedas não pode superar a duração da partida.' });
      return;
    }
    if (!safeCollectedCoin && safeCoins > 0) {
      res.status(422).json({ error: 'Inconsistência de coleta de moedas.' });
      return;
    }
    if (safeCollectedCoin && safeCoins > 5) {
      res.status(422).json({ error: 'Tentativa No Coin inválida detectada.' });
      return;
    }
  } else {
    const maxPlausibleCoins = Math.floor((safeDuration / 1000) * 40 + 50);
    if (safeCoins > maxPlausibleCoins) {
      res.status(422).json({ error: 'Quantidade de moedas incompatível com a duração da partida.' });
      return;
    }
  }

  const maxPlausibleDistance = (safeDuration / 1000) * 75 + 40;
  if (safeDistance > maxPlausibleDistance) {
    res.status(422).json({ error: 'Distância incompatível com os limites físicos do jogo.' });
    return;
  }
  const maxPlausibleScore = (safeDuration / 1000) * 3000 + safeCoins * 600 + 1000;
  if (safeScore > maxPlausibleScore) {
    res.status(422).json({ error: 'Pontuação incompatível com os limites do jogo.' });
    return;
  }

  const roundedNoCoin = activeMode === 'no_coin' ? Math.round(safeNoCoin) : 0;
  const roundedDistance = Math.round(safeDistance);
  const roundedScore = Math.round(safeScore);
  const roundedCoins = Math.round(safeCoins);
  const roundedDuration = Math.round(safeDuration);

  const outcome = await repoCompleteMatchAndRecord({
    user,
    match: {
      id: matchId,
      userId: user.id,
      nickname: user.nickname,
      mode: activeMode,
      skinId: active.skinId,
      mapId: active.mapId,
      noCoinTimeMs: roundedNoCoin,
      collectedCoin: safeCollectedCoin,
      coins: roundedCoins,
      distance: roundedDistance,
      score: roundedScore,
      durationMs: roundedDuration,
      createdAt: new Date().toISOString(),
    },
  });

  if (!outcome.ok) {
    res.status(400).json({ error: 'Partida inválida ou já finalizada.' });
    return;
  }

  const normalizedEndReason: 'police' | 'coin' =
    activeMode === 'no_coin' && (endReason === 'coin' || safeCollectedCoin) ? 'coin' : 'police';

  res.json({
    summary: {
      matchId,
      mode: activeMode,
      mapId: active.mapId,
      skinId: active.skinId,
      noCoinTimeMs: roundedNoCoin,
      collectedCoin: safeCollectedCoin,
      coins: roundedCoins,
      distance: roundedDistance,
      score: roundedScore,
      durationMs: roundedDuration,
      isNewPersonalRecord: outcome.isNewPersonalRecord,
      globalRank: outcome.globalRank,
      endReason: normalizedEndReason,
    },
  });
}

export async function leaderboardHandler(req: AuthedRequest, res: Response): Promise<void> {
  const rawCategory = String(req.query.category || 'no_coin');
  const category: LeaderboardCategory = rawCategory === 'coins' ? 'coins' : 'no_coin';
  const rawPage = Number(req.query.page || 1);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawPageSize = Number(req.query.pageSize ?? req.query.limit ?? 20);
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize >= 1
      ? Math.min(100, Math.floor(rawPageSize))
      : 20;

  if (category === 'coins') {
    const data = await repoGetCoinsLeaderboard({
      page,
      pageSize,
      currentUserId: req.authUser?.id,
    });
    res.json(data);
    return;
  }

  const data = await repoGetLeaderboard({
    page,
    pageSize,
    currentUserId: req.authUser?.id,
  });
  res.json(data);
}

export async function publicProfileHandler(req: Request, res: Response): Promise<void> {
  const nickParam = decodeURIComponent(String(req.params.nickname || ''));
  const user = await repoFindUserByNickname(nickParam);
  if (!user) {
    res.status(404).json({ error: 'Jogador não encontrado.' });
    return;
  }

  const [rank, competitiveStats, recentX1, walletStats, customCfg] = await Promise.all([
    repoComputePlayerRank(user.id),
    repoGetCompetitiveStatsForUser(user.id),
    repoGetRecentX1ResultsForUser(user.id, 8),
    repoGetWalletStatsForUser(user.id),
    user.equippedSkin === 'meu_ratao' ? repoGetCustomCharacterConfig(user.id) : Promise.resolve(undefined),
  ]);
  res.json({
    profile: {
      id: user.id,
      nickname: user.nickname,
      equippedSkin: user.equippedSkin,
      createdAt: user.createdAt,
      bestNoCoinTimeMs: user.bestNoCoinTimeMs,
      bestDistance: user.bestDistance,
      bestScore: user.bestScore,
      totalMatches: user.totalMatches,
      totalCoins: walletStats.totalCoinsCollected,
      favoriteSkin: user.favoriteSkin,
      rank,
      competitiveStats,
      walletStats,
      customCharacterConfig: customCfg,
      recentX1,
    },
  });
}

export async function socialFeedHandler(req: AuthedRequest, res: Response): Promise<void> {
  const [feed, notifications] = await Promise.all([
    repoGetSocialFeed(req.authUser?.id),
    req.authUser ? repoGetUnreadNotificationsForUser(req.authUser.id) : Promise.resolve([]),
  ]);
  res.json({ ...feed, notifications });
}

export async function markGiftsSeenHandler(req: AuthedRequest, res: Response): Promise<void> {
  await repoMarkGiftsSeen(req.authUser!.id);
  res.json({ ok: true });
}

export async function votePollHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const pollId = String(req.params.pollId || '');
  const optionIndex = Number(req.body?.optionIndex);

  const result = await repoVoteOnPoll(pollId, user.id, optionIndex);
  if (result.status === 'ok') {
    res.json({ poll: result.poll });
    return;
  }
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Votação não encontrada.' });
    return;
  }
  if (result.status === 'closed') {
    res.status(400).json({ error: 'Esta votação já foi encerrada.' });
    return;
  }
  if (result.status === 'invalid_option') {
    res.status(400).json({ error: 'Alternativa inválida.' });
    return;
  }
  res.status(409).json({ error: 'Você já votou nesta votação.' });
}

// --- ADMIN HANDLERS ---

export async function adminStatsHandler(_req: AuthedRequest, res: Response): Promise<void> {
  const data = await repoGetAdminDashboardData();
  res.json(data);
}

export async function adminSearchPlayersHandler(req: AuthedRequest, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 40) : '';
  const players = await repoSearchPlayersForAdmin(q);
  res.json({ players });
}

export async function adminCreateMessageHandler(req: AuthedRequest, res: Response): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const { title, content, durationMinutes } = req.body ?? {};

  if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) {
    res.status(400).json({ error: 'Título inválido (1 a 80 caracteres).' });
    return;
  }
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 400) {
    res.status(400).json({ error: 'Mensagem inválida (1 a 400 caracteres).' });
    return;
  }

  const dur = Math.min(10080, Math.max(1, Number(durationMinutes) || 60));
  const now = new Date();
  const expires = new Date(now.getTime() + dur * 60 * 1000);

  const msg = {
    id: `msg_${generateToken(8)}`,
    title: title.trim(),
    content: content.trim(),
    durationMinutes: dur,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    active: true,
  };

  await repoCreateGlobalMessage(admin.nickname, msg);
  res.status(201).json({ message: msg });
}

export async function adminDeleteMessageHandler(req: AuthedRequest, res: Response): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const id = String(req.params.id || '');
  const removed = await repoDeleteGlobalMessage(admin.nickname, id);
  if (!removed) {
    res.status(404).json({ error: 'Mensagem não encontrada.' });
    return;
  }
  res.json({ ok: true });
}

export async function adminCreatePollHandler(req: AuthedRequest, res: Response): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const { title, options, durationMinutes } = req.body ?? {};

  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
    res.status(400).json({ error: 'Título inválido (1 a 120 caracteres).' });
    return;
  }
  if (!Array.isArray(options)) {
    res.status(400).json({ error: 'Alternativas inválidas.' });
    return;
  }
  const cleanOptions = options
    .map((o) => (typeof o === 'string' ? o.trim() : ''))
    .filter((o) => o.length > 0 && o.length <= 60);

  if (cleanOptions.length < 2 || cleanOptions.length > 6) {
    res.status(400).json({ error: 'Informe de 2 a 6 alternativas válidas.' });
    return;
  }

  const dur = Math.min(10080, Math.max(1, Number(durationMinutes) || 120));
  const now = new Date();
  const expires = new Date(now.getTime() + dur * 60 * 1000);
  const pollId = `poll_${generateToken(8)}`;

  const poll = await repoCreateGlobalPoll(admin.nickname, {
    id: pollId,
    title: title.trim(),
    options: cleanOptions,
    active: true,
    durationMinutes: dur,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    authorId: admin.id,
  });

  res.status(201).json({ poll });
}

export async function adminClosePollHandler(req: AuthedRequest, res: Response): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const id = String(req.params.id || '');
  const poll = await repoCloseGlobalPoll(admin.nickname, id);
  if (!poll) {
    res.status(404).json({ error: 'Votação não encontrada.' });
    return;
  }
  res.json({ poll });
}

export async function adminGiftSkinHandler(req: AuthedRequest, res: Response): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const { nickname, skinId } = req.body ?? {};

  if (typeof nickname !== 'string' || !nickname.trim()) {
    res.status(400).json({ error: 'Informe o nickname do jogador.' });
    return;
  }
  if (!isValidSkinId(skinId)) {
    res.status(400).json({ error: 'Skin selecionada inválida.' });
    return;
  }
  if (!isGiftableSkinId(skinId)) {
    res.status(403).json({
      error: 'Skins exclusivas de Administrador e Top 1/2/3 não podem ser enviadas como presente.',
    });
    return;
  }

  const result = await repoGiftSkinToPlayer({
    adminNickname: admin.nickname,
    targetNickname: nickname,
    skinId,
  });

  if (result.status === 'not_found') {
    res.status(404).json({ error: `Jogador "${nickname.trim()}" não encontrado.` });
    return;
  }
  if (result.status === 'duplicate') {
    res.status(409).json({
      error: `${result.targetNickname} já recebeu a skin "${result.skinName}" como presente.`,
    });
    return;
  }

  res.status(201).json({ gift: result.gift });
}

export async function adminListExclusiveSkinOwnersHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const rawSkin = typeof req.query.skinId === 'string' ? req.query.skinId : undefined;
  if (rawSkin && !isValidSkinId(rawSkin)) {
    res.status(400).json({ error: 'Skin selecionada inválida.' });
    return;
  }
  const owners = await repoAdminListExclusiveSkinOwners(rawSkin as SkinId | undefined);
  res.json({ owners });
}

export async function adminGrantExclusiveSkinHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const { nickname, skinId } = req.body ?? {};
  if (typeof nickname !== 'string' || !nickname.trim()) {
    res.status(400).json({ error: 'Informe o nickname do jogador.' });
    return;
  }
  if (!isValidSkinId(skinId)) {
    res.status(400).json({ error: 'Skin selecionada inválida.' });
    return;
  }
  const result = await repoAdminGrantLockedSkin({
    adminNickname: admin.nickname,
    targetNickname: nickname,
    skinId,
  });
  switch (result.status) {
    case 'invalid_skin':
      res.status(403).json({
        error: 'Esta seção gerencia apenas as skins exclusivas bloqueadas e Meu Ratão.',
      });
      return;
    case 'not_found':
      res.status(404).json({ error: `Jogador "${nickname.trim()}" não encontrado.` });
      return;
    case 'already_unlocked':
      res.status(409).json({
        error: `${result.targetNickname} já possui permissão ativa para "${result.skinName}".`,
      });
      return;
    case 'ok':
      res.status(201).json({ owner: result.owner });
      return;
  }
}

export async function adminRevokeExclusiveSkinHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const admin = req.adminUser || req.authUser!;
  const { userId, skinId } = req.body ?? {};
  if (typeof userId !== 'string' || !userId.trim()) {
    res.status(400).json({ error: 'Jogador inválido.' });
    return;
  }
  if (!isValidSkinId(skinId)) {
    res.status(400).json({ error: 'Skin inválida.' });
    return;
  }
  const result = await repoAdminRevokeLockedSkin({
    adminNickname: admin.nickname,
    userId: userId.trim(),
    skinId,
  });
  if (result.status !== 'ok') {
    if (result.status === 'invalid_skin') {
      res.status(403).json({ error: 'Apenas skins exclusivas desbloqueáveis podem ser revogadas aqui.' });
      return;
    }
    res.status(404).json({ error: 'Permissão ou jogador não encontrado.' });
    return;
  }
  res.json({
    ok: true,
    targetNickname: result.targetNickname,
    resetEquipped: result.resetEquipped,
  });
}
