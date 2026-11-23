import { Response } from 'express';
import { MapId, MultiplayerMode } from '../shared/constants.ts';
import { AuthedRequest } from './auth.ts';
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

const VALID_MAPS: MapId[] = ['brasil', 'tokyo', 'futebol', 'capivara'];
const VALID_MODES: MultiplayerMode[] = ['coop', 'x1'];

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
  const roomId = String(req.params.roomId || '');
  const body = req.body ?? {};
  const normalizedEvents = Array.isArray(body.events)
    ? body.events
    : body.event
      ? [body.event]
      : undefined;

  const result = await mpSyncParticipantState({
    roomId,
    user,
    input: {
      ...body,
      events: normalizedEvents,
    },
  });

  if (result.status !== 'ok') {
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Sala não encontrada.' });
      return;
    }
    res.status(422).json({ error: 'Evento de moeda inválido para a semente desta partida.' });
    return;
  }

  res.json({ ...result.bundle, serverNow: Date.now() });
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
