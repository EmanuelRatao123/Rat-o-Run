import { Response } from 'express';
import { MapId, MultiplayerMode } from '../shared/constants.ts';
import { AuthedRequest, getClientIp } from './auth.ts';
import { SlidingRateLimiter } from './crypto.ts';
import {
  mpCreateInviteAndRoom,
  mpGetOverviewForUser,
  mpGetRoomBundle,
  mpLeaveRoom,
  mpRespondToInvite,
  mpSearchPlayersByNickname,
  mpSetReadyState,
  mpStartRoomMatch,
  mpSyncParticipantState,
} from './multiplayerRepository.ts';
import { recordSecurityEvent } from './securityAudit.ts';

const VALID_MAPS: MapId[] = ['brasil', 'tokyo', 'futebol', 'capivara'];
const VALID_MODES: MultiplayerMode[] = ['coop', 'x1'];
const mpInviteLimiter = new SlidingRateLimiter(20, 5 * 60 * 1000, 60 * 1000);
const mpSyncLimiter = new SlidingRateLimiter(2400, 60 * 1000, 10 * 1000);

export async function mpSearchPlayersHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const q = typeof req.query.nickname === 'string' ? req.query.nickname.slice(0, 24) : '';
  if (q.trim().length < 1) {
    res.json({ players: [] });
    return;
  }
  const players = await mpSearchPlayersByNickname(q, user.id);
  res.json({ players });
}

export async function mpOverviewHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const overview = await mpGetOverviewForUser(user.id);
  res.json(overview);
}

export async function mpCreateInviteHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rate = mpInviteLimiter.check(`mp_inv:${user.id}`);
  if (!rate.allowed) {
    res.status(429).json({ error: `Muitos convites enviados. Aguarde ${rate.retryAfterSec}s.` });
    return;
  }
  const { targetNickname, mode, mapId } = req.body ?? {};

  if (typeof targetNickname !== 'string' || !targetNickname.trim()) {
    res.status(400).json({ error: 'Informe o nickname do jogador para convidar.' });
    return;
  }
  if (!VALID_MODES.includes(mode)) {
    res.status(400).json({ error: 'Modo multiplayer inválido.' });
    return;
  }
  const chosenMap: MapId = VALID_MAPS.includes(mapId) ? mapId : 'brasil';

  const result = await mpCreateInviteAndRoom({
    host: user,
    targetNickname: targetNickname.trim(),
    mode,
    mapId: chosenMap,
  });

  if (result.status !== 'ok') {
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Jogador não encontrado.' });
      return;
    }
    if (result.status === 'self_invite') {
      res.status(400).json({ error: 'Você não pode convidar a si mesmo.' });
      return;
    }
    res.status(409).json({ error: 'Já existe um convite pendente para este jogador neste modo.' });
    return;
  }

  res.status(201).json({
    invite: result.invite,
    room: result.room,
    participants: result.participants,
  });
}

export async function mpRespondInviteHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const inviteId = String(req.params.inviteId || '');
  const { action } = req.body ?? {};

  if (action !== 'accept' && action !== 'decline' && action !== 'cancel') {
    res.status(400).json({ error: 'Ação inválida.' });
    return;
  }

  const result = await mpRespondToInvite({ inviteId, user, action });
  if (result.status !== 'ok') {
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Convite não encontrado.' });
      return;
    }
    if (result.status === 'forbidden') {
      res.status(403).json({ error: 'Você não tem permissão para responder a este convite.' });
      return;
    }
    if (result.status === 'expired') {
      res.status(410).json({ error: 'Este convite expirou.' });
      return;
    }
    res.status(409).json({ error: 'Este convite já foi respondido ou encerrado.' });
    return;
  }

  res.json({
    ok: true,
    status: result.invite.status,
    invite: result.invite,
    room: result.bundle?.room,
    participants: result.bundle?.participants,
  });
}

export async function mpGetRoomHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const roomId = String(req.params.roomId || '');
  const bundle = await mpGetRoomBundle(roomId, user.id);
  if (!bundle) {
    res.status(404).json({ error: 'Sala não encontrada ou acesso negado.' });
    return;
  }
  res.json({ ...bundle, serverNow: Date.now() });
}

export async function mpReadyRoomHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const roomId = String(req.params.roomId || '');
  const { ready, mapId } = req.body ?? {};
  const chosenMap = VALID_MAPS.includes(mapId) ? (mapId as MapId) : undefined;

  const result = await mpSetReadyState({
    roomId,
    user,
    ready: Boolean(ready),
    mapId: chosenMap,
  });

  if (result.status !== 'ok') {
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Sala não encontrada.' });
      return;
    }
    res.status(409).json({ error: 'A sala não está em preparação.' });
    return;
  }
  res.json({ ...result.bundle, serverNow: Date.now() });
}

export async function mpStartRoomHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const roomId = String(req.params.roomId || '');
  const result = await mpStartRoomMatch({ roomId, userId: user.id });

  if (result.status !== 'ok') {
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Sala não encontrada.' });
      return;
    }
    if (result.status === 'not_ready') {
      res.status(400).json({ error: 'Os dois jogadores precisam estar prontos para iniciar.' });
      return;
    }
    res.status(409).json({ error: 'Estado da sala não permite início agora.' });
    return;
  }
  res.json({ ...result.bundle, serverNow: Date.now() });
}

export async function mpSyncRoomHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rate = mpSyncLimiter.check(`mp_sync:${user.id}`);
  if (!rate.allowed) {
    res.status(429).json({ error: `Muitas sincronizações em sequência. Aguarde ${rate.retryAfterSec}s.` });
    return;
  }

  const roomId = String(req.params.roomId || '').trim();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const rawEvents = Array.isArray(body.events)
    ? body.events.slice(0, 16)
    : body.event
      ? [body.event]
      : undefined;

  // Strict field whitelist — prevent mass-assignment/injection of unexpected fields
  const result = await mpSyncParticipantState({
    roomId,
    user,
    ip: getClientIp(req),
    input: {
      lane: Number(body.lane ?? 0),
      posX: Number(body.posX ?? 0),
      posY: Number(body.posY ?? 0),
      posZ: Number(body.posZ ?? 0),
      vx: body.vx === undefined ? undefined : Number(body.vx),
      vy: body.vy === undefined ? undefined : Number(body.vy),
      vz: body.vz === undefined ? undefined : Number(body.vz),
      speed: body.speed === undefined ? undefined : Number(body.speed),
      yaw: body.yaw === undefined ? undefined : Number(body.yaw),
      seq: body.seq === undefined ? undefined : Number(body.seq),
      clientTs: body.clientTs === undefined ? undefined : Number(body.clientTs),
      pingMs: body.pingMs === undefined ? undefined : Number(body.pingMs),
      animState: body.animState as any,
      distance: Number(body.distance ?? 0),
      coins: Number(body.coins ?? 0),
      score: Number(body.score ?? 0),
      noCoinTimeMs: Number(body.noCoinTimeMs ?? 0),
      durationMs: Number(body.durationMs ?? 0),
      collisionCount: Number(body.collisionCount ?? 0),
      alive: body.alive === undefined ? true : Boolean(body.alive),
      hoverboard: Boolean(body.hoverboard),
      jetpack: Boolean(body.jetpack),
      events: rawEvents as any,
    },
  });

  if (result.status !== 'ok') {
    if (result.status === 'not_found') {
      void recordSecurityEvent({
        eventType: 'MP_ROOM_ACCESS_DENIED',
        category: 'social_idor',
        severity: 'medium',
        ip: getClientIp(req),
        userId: user.id,
        nickname: user.nickname,
        route: 'POST /api/multiplayer/rooms/:roomId/sync',
        details: `Sync attempted on unauthorized or missing roomId=${roomId}`,
      });
      res.status(404).json({ error: 'Sala não encontrada.' });
      return;
    }
    if (result.status === 'tampered_telemetry') {
      res.status(422).json({ error: 'Telemetria incompatível com os limites físicos da partida.' });
      return;
    }
    res.status(422).json({ error: 'Evento de moeda inválido para a semente desta partida.' });
    return;
  }

  res.json({
    ...result.bundle,
    serverNow: Date.now(),
    echoClientTs: Number(body.clientTs) || 0,
  });
}

export async function mpLeaveRoomHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const roomId = String(req.params.roomId || '');
  const resLeave = await mpLeaveRoom({ roomId, userId: user.id });
  if (!resLeave.ok) {
    res.status(404).json({ error: 'Sala não encontrada.' });
    return;
  }
  res.json({ ok: true });
}
