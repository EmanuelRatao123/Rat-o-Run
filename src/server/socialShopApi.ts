import { Response } from 'express';
import { SKATES_CATALOG, SkateId, isValidSkateId } from '../shared/constants.ts';
import { AuthedRequest } from './auth.ts';
import { SlidingRateLimiter } from './crypto.ts';
import {
  repoBuySkate,
  repoConsumeMatchSkateUse,
  repoEquipSkate,
  repoGetFriendMessages,
  repoGetFriendsOverview,
  repoGetPlayerCapeConfig,
  repoGetPlayerLiveModeConfig,
  repoGetShopState,
  repoRemoveFriend,
  repoRespondFriendRequest,
  repoSearchPlayersForFriends,
  repoSendFriendMessage,
  repoSendFriendRequest,
  repoUpdatePlayerCapeConfig,
  repoUpdatePlayerLiveModeConfig,
} from './socialShopRepository.ts';

const friendRequestLimiter = new SlidingRateLimiter(15, 5 * 60 * 1000, 60 * 1000);
const chatMessageLimiter = new SlidingRateLimiter(35, 60 * 1000, 15 * 1000);

// --- FRIENDS & PRIVATE CHAT HANDLERS ---

export async function searchFriendsPlayersHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const user = req.authUser!;
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 30) : '';
  const players = await repoSearchPlayersForFriends(user.id, q);
  res.json({ players });
}

export async function getFriendsOverviewHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const overview = await repoGetFriendsOverview(user.id);
  res.json(overview);
}

export async function sendFriendRequestHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rate = friendRequestLimiter.check(`fr:${user.id}`);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Muitas solicitações enviadas. Aguarde ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const { targetUserId, targetNickname } = req.body ?? {};
  const cleanId = typeof targetUserId === 'string' ? targetUserId.trim() : undefined;
  const cleanNick = typeof targetNickname === 'string' ? targetNickname.trim() : undefined;
  if (!cleanId && !cleanNick) {
    res.status(400).json({ error: 'Informe o jogador para adicionar.' });
    return;
  }

  const result = await repoSendFriendRequest({
    requesterId: user.id,
    requesterNickname: user.nickname,
    targetUserId: cleanId,
    targetNickname: cleanNick,
  });

  if (result.status === 'ok' || result.status === 'auto_accepted') {
    res.status(201).json({
      ok: true,
      status: result.status,
      friendshipId: result.friendshipId,
      targetNickname: result.targetNickname,
    });
    return;
  }
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Jogador não encontrado.' });
    return;
  }
  if (result.status === 'self_request') {
    res.status(400).json({ error: 'Você não pode adicionar a si mesmo.' });
    return;
  }
  if (result.status === 'already_friends') {
    res.status(409).json({ error: 'Vocês já são amigos.' });
    return;
  }
  res.status(409).json({ error: 'Já existe uma solicitação pendente para este jogador.' });
}

export async function respondFriendRequestHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const user = req.authUser!;
  const friendshipId = String(req.params.friendshipId || '').trim();
  const action = req.body?.action;
  if (!friendshipId || (action !== 'accept' && action !== 'decline' && action !== 'cancel')) {
    res.status(400).json({ error: 'Ação de solicitação inválida.' });
    return;
  }

  const result = await repoRespondFriendRequest({
    userId: user.id,
    friendshipId,
    action,
  });

  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Solicitação não encontrada.' });
    return;
  }
  if (result.status === 'forbidden') {
    res.status(403).json({ error: 'Você não tem permissão para alterar esta solicitação.' });
    return;
  }
  if (result.status === 'invalid_state') {
    res.status(409).json({ error: 'Esta solicitação já foi respondida.' });
    return;
  }

  res.json({ ok: true });
}

export async function removeFriendHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const friendshipId = String(req.params.friendshipId || '').trim();
  if (!friendshipId) {
    res.status(400).json({ error: 'Amizade inválida.' });
    return;
  }
  const result = await repoRemoveFriend({ userId: user.id, friendshipId });
  if (!result.ok) {
    res.status(404).json({ error: 'Amizade não encontrada.' });
    return;
  }
  res.json({ ok: true });
}

export async function getFriendMessagesHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const friendUserId = String(req.params.friendUserId || '').trim();
  if (!friendUserId) {
    res.status(400).json({ error: 'Amigo inválido.' });
    return;
  }
  const rawLimit = Number(req.query.limit ?? 60);
  const result = await repoGetFriendMessages({
    userId: user.id,
    friendUserId,
    limit: Number.isFinite(rawLimit) ? rawLimit : 60,
  });
  if (result.status === 'not_friends') {
    res.status(403).json({ error: 'Somente amigos aceitos podem trocar mensagens.' });
    return;
  }
  res.json({ friendshipId: result.friendshipId, messages: result.messages });
}

export async function sendFriendMessageHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rate = chatMessageLimiter.check(`chat:${user.id}`);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Muitas mensagens em sequência. Aguarde ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const friendUserId = String(req.params.friendUserId || '').trim();
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!friendUserId) {
    res.status(400).json({ error: 'Destinatário inválido.' });
    return;
  }

  const result = await repoSendFriendMessage({
    senderUserId: user.id,
    receiverUserId: friendUserId,
    content,
  });

  if (result.status === 'ok') {
    res.status(201).json({ message: result.message });
    return;
  }
  if (result.status === 'self_message') {
    res.status(400).json({ error: 'Não é possível enviar mensagem para si mesmo.' });
    return;
  }
  if (result.status === 'not_friends') {
    res.status(403).json({ error: 'Você só pode enviar mensagens para amigos aceitos.' });
    return;
  }
  res.status(400).json({ error: 'Digite uma mensagem válida (1 a 500 caracteres).' });
}

// --- CAPES HANDLERS ---

export async function getCapeConfigHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const config = await repoGetPlayerCapeConfig(user.id);
  res.json({ config });
}

export async function updateCapeConfigHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const config = await repoUpdatePlayerCapeConfig(user.id, req.body?.config ?? req.body);
  res.json({ config });
}

// --- LIVE MODE HANDLERS ---

export async function getLiveModeConfigHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const config = await repoGetPlayerLiveModeConfig(user.id);
  res.json({ config });
}

export async function updateLiveModeConfigHandler(
  req: AuthedRequest,
  res: Response
): Promise<void> {
  const user = req.authUser!;
  const config = await repoUpdatePlayerLiveModeConfig(user.id, req.body?.config ?? req.body);
  res.json({ config });
}

// --- SHOP & SKATES HANDLERS ---

export async function getShopStateHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const state = await repoGetShopState(user.id);
  res.json({
    catalog: SKATES_CATALOG,
    ...state,
  });
}

export async function buySkateHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const { skateId, quantity } = req.body ?? {};
  if (!isValidSkateId(skateId)) {
    res.status(400).json({ error: 'Skate selecionado inválido.' });
    return;
  }
  const result = await repoBuySkate({
    userId: user.id,
    skateId: skateId as SkateId,
    quantity: quantity ?? 1,
  });

  if (result.status === 'invalid_quantity') {
    res.status(400).json({ error: 'Quantidade inválida (1 a 20).' });
    return;
  }
  if (result.status === 'user_not_found') {
    res.status(404).json({ error: 'Conta não encontrada.' });
    return;
  }
  if (result.status === 'insufficient_coins') {
    res.status(409).json({
      error: `Saldo insuficiente. Você tem ${result.availableCoins} moedas e precisa de ${result.requiredCoins}.`,
      availableCoins: result.availableCoins,
      requiredCoins: result.requiredCoins,
    });
    return;
  }

  res.status(201).json(result);
}

export async function equipSkateHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rawId = req.body?.skateId ?? null;
  const skateId = rawId === null ? null : isValidSkateId(rawId) ? rawId : undefined;
  if (skateId === undefined) {
    res.status(400).json({ error: 'Skate inválido.' });
    return;
  }
  const result = await repoEquipSkate(user.id, skateId);
  if (!result.ok) {
    res.status(403).json({ error: result.error || 'Não foi possível equipar este skate.' });
    return;
  }
  res.json({ equippedSkateId: result.equippedSkateId });
}

export async function consumeMatchSkateHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const { matchId, skateId, mode, eventKey } = req.body ?? {};
  const chosenSkate: SkateId | null = isValidSkateId(skateId)
    ? skateId
    : user.equippedSkateId && isValidSkateId(user.equippedSkateId)
    ? user.equippedSkateId
    : null;

  if (!chosenSkate) {
    res.status(400).json({ error: 'Nenhum skate válido informado.' });
    return;
  }
  if (typeof matchId !== 'string' || !matchId.trim() || typeof eventKey !== 'string' || !eventKey.trim()) {
    res.status(400).json({ error: 'Dados da partida inválidos para consumo do skate.' });
    return;
  }

  const outcome = await repoConsumeMatchSkateUse({
    userId: user.id,
    matchId: matchId.trim().slice(0, 64),
    skateId: chosenSkate,
    mode: typeof mode === 'string' ? mode.slice(0, 24) : 'normal',
    eventKey: `${user.id}:${eventKey.trim().slice(0, 80)}`,
  });

  if (!outcome.consumed) {
    res.status(409).json({
      error: 'Você não possui usos restantes para este skate.',
      reason: outcome.reason,
    });
    return;
  }

  res.json(outcome);
}
