import { Request, Response } from 'express';
import {
  MapId,
  SkinId,
  isCommonSkinId,
  isValidAnySkinId,
} from '../shared/constants.ts';
import { AuthedRequest } from './auth.ts';
import { generateToken, signHmac, verifyHmac } from './crypto.ts';
import {
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
  repoGetCompetitiveStatsForUser,
  repoGetLeaderboard,
  repoGetRecentX1ResultsForUser,
  repoGetSocialFeed,
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
  const { mapId, skinId } = req.body ?? {};
  if (!isValidMapId(mapId)) {
    res.status(400).json({ error: 'Mapa inválido.' });
    return;
  }
  const chosenSkin: SkinId = isValidSkinId(skinId) ? skinId : user.equippedSkin;
  if (!(await repoCanUserEquipSkin(user, chosenSkin))) {
    res.status(403).json({ error: 'Skin exclusiva não autorizada para esta conta.' });
    return;
  }
  const matchId = `m_${generateToken(10)}`;
  const startedAt = Date.now();
  const payload = `${matchId}:${user.id}:${startedAt}:${mapId}:${chosenSkin}`;
  const signature = signHmac(payload);

  await repoCreateActiveMatch({
    matchId,
    userId: user.id,
    mapId,
    skinId: chosenSkin,
    startedAt,
    signature,
    completed: false,
  });

  res.json({ matchId, startedAt, signature });
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

  const expectedPayload = `${active.matchId}:${user.id}:${active.startedAt}:${active.mapId}:${active.skinId}`;
  if (active.signature !== signature || !verifyHmac(expectedPayload, signature)) {
    res.status(403).json({ error: 'Assinatura de partida inválida.' });
    return;
  }

  const now = Date.now();
  const wallElapsedMs = Math.max(0, now - active.startedAt);

  const safeDuration = Number(durationMs);
  const safeNoCoin = Number(noCoinTimeMs);
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
  if (safeNoCoin > safeDuration + 150) {
    res.status(422).json({ error: 'Tempo sem moedas não pode superar a duração da partida.' });
    return;
  }
  if (!safeCollectedCoin && safeCoins > 0) {
    res.status(422).json({ error: 'Inconsistência de coleta de moedas.' });
    return;
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

  const roundedNoCoin = Math.round(safeNoCoin);
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

  res.json({
    summary: {
      matchId,
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
    },
  });
}

export async function leaderboardHandler(req: AuthedRequest, res: Response): Promise<void> {
  const rawLimit = Number(req.query.limit || 100);
  const limit = [10, 50, 100].includes(rawLimit) ? rawLimit : 100;
  const data = await repoGetLeaderboard(limit, req.authUser?.id);
  res.json(data);
}

export async function publicProfileHandler(req: Request, res: Response): Promise<void> {
  const nickParam = decodeURIComponent(String(req.params.nickname || ''));
  const user = await repoFindUserByNickname(nickParam);
  if (!user) {
    res.status(404).json({ error: 'Jogador não encontrado.' });
    return;
  }

  const [rank, competitiveStats, recentX1] = await Promise.all([
    repoComputePlayerRank(user.id),
    repoGetCompetitiveStatsForUser(user.id),
    repoGetRecentX1ResultsForUser(user.id, 8),
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
      totalCoins: user.totalCoins,
      favoriteSkin: user.favoriteSkin,
      rank,
      competitiveStats,
      recentX1,
    },
  });
}

export async function socialFeedHandler(req: AuthedRequest, res: Response): Promise<void> {
  const feed = await repoGetSocialFeed(req.authUser?.id);
  res.json(feed);
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
  if (!isCommonSkinId(skinId)) {
    res.status(403).json({ error: 'Skins exclusivas não podem ser enviadas como presente.' });
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
