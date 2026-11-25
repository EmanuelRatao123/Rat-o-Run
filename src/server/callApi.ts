import { Response } from 'express';
import { VoiceCallSignalType } from '../shared/constants.ts';
import { AuthedRequest, getClientIp } from './auth.ts';
import {
  getVoiceCallIceConfig,
  repoEndVoiceCall,
  repoGetVoiceCallState,
  repoHeartbeatVoiceCall,
  repoInviteFriendToCall,
  repoPostVoiceCallSignal,
  repoRespondToVoiceCall,
} from './callRepository.ts';
import { SlidingRateLimiter } from './crypto.ts';
import { recordSecurityEvent } from './securityAudit.ts';

const callInviteLimiter = new SlidingRateLimiter(20, 5 * 60 * 1000, 60 * 1000);
const callSignalLimiter = new SlidingRateLimiter(180, 60 * 1000, 10 * 1000);

const VALID_SIGNAL_TYPES = new Set<VoiceCallSignalType>([
  'offer',
  'answer',
  'ice',
  'renegotiate',
]);

export async function getCallIceConfigHandler(_req: AuthedRequest, res: Response): Promise<void> {
  res.json(getVoiceCallIceConfig());
}

export async function getCallStateHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const callId = typeof req.query.callId === 'string' ? req.query.callId.trim() : undefined;
  const rawSeq = Number(req.query.sinceSeq ?? 0);
  const sinceSeq = Number.isFinite(rawSeq) && rawSeq > 0 ? Math.floor(rawSeq) : 0;

  const state = await repoGetVoiceCallState({
    userId: user.id,
    callId: callId || undefined,
    sinceSeq,
  });
  res.json(state);
}

export async function inviteCallHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rate = callInviteLimiter.check(`call_inv:${user.id}`);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Muitas tentativas de chamada. Aguarde ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
  if (!targetUserId) {
    res.status(400).json({ error: 'Informe o amigo para iniciar a chamada.' });
    return;
  }

  const result = await repoInviteFriendToCall({
    callerUserId: user.id,
    callerNickname: user.nickname,
    targetUserId,
  });

  if (result.status === 'ok') {
    res.status(201).json({ call: result.call });
    return;
  }
  if (result.status === 'self_call') {
    res.status(400).json({ error: 'Você não pode ligar para si mesmo.' });
    return;
  }
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Jogador não encontrado.' });
    return;
  }
  if (result.status === 'not_friends') {
    void recordSecurityEvent({
      eventType: 'CALL_NON_FRIEND_DENIED',
      category: 'social_idor',
      severity: 'medium',
      ip: getClientIp(req),
      userId: user.id,
      nickname: user.nickname,
      route: 'POST /api/calls/invite',
      details: `Attempted voice call invite to non-friend targetUserId=${targetUserId}`,
    });
    res.status(403).json({ error: 'Somente amigos aceitos podem iniciar chamadas de voz.' });
    return;
  }
  if (result.status === 'target_offline') {
    res.status(409).json({
      error: `${result.targetNickname || 'Este amigo'} está offline no momento.`,
    });
    return;
  }
  if (result.status === 'caller_busy') {
    res.status(409).json({ error: 'Você já está em uma chamada ou aguardando resposta.' });
    return;
  }
  res.status(409).json({
    error: `${result.targetNickname || 'Este amigo'} já está em outra chamada.`,
  });
}

export async function respondCallHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const callId = String(req.params.callId || '').trim();
  const action = req.body?.action;
  if (!callId || (action !== 'accept' && action !== 'decline' && action !== 'cancel')) {
    res.status(400).json({ error: 'Ação de chamada inválida.' });
    return;
  }

  const result = await repoRespondToVoiceCall({
    userId: user.id,
    callId,
    action,
  });

  if (result.status === 'ok') {
    res.json({ call: result.call });
    return;
  }
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Chamada não encontrada.' });
    return;
  }
  if (result.status === 'forbidden') {
    void recordSecurityEvent({
      eventType: 'CALL_RESPOND_IDOR',
      category: 'social_idor',
      severity: 'high',
      ip: getClientIp(req),
      userId: user.id,
      nickname: user.nickname,
      route: 'POST /api/calls/:callId/respond',
      details: `Unauthorized call respond attempt on callId=${callId}`,
    });
    res.status(403).json({ error: 'Você não tem permissão para responder esta chamada.' });
    return;
  }
  if (result.status === 'expired') {
    res.status(409).json({ error: 'O convite da chamada expirou.' });
    return;
  }
  if (result.status === 'busy') {
    res.status(409).json({ error: 'Um dos participantes já está em outra chamada ativa.' });
    return;
  }
  res.status(409).json({ error: 'Esta chamada já foi respondida ou encerrada.' });
}

export async function postCallSignalHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const rate = callSignalLimiter.check(`call_sig:${user.id}`);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Muitos sinais enviados em sequência. Aguarde ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const callId = String(req.params.callId || '').trim();
  const type = req.body?.type;
  const payload = req.body?.payload;

  if (
    !callId ||
    typeof type !== 'string' ||
    !VALID_SIGNAL_TYPES.has(type as VoiceCallSignalType) ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    res.status(400).json({ error: 'Sinal WebRTC inválido.' });
    return;
  }

  const result = await repoPostVoiceCallSignal({
    userId: user.id,
    callId,
    type: type as VoiceCallSignalType,
    payload: payload as Record<string, unknown>,
  });

  if (result.status === 'ok') {
    res.status(201).json({ signal: result.signal });
    return;
  }
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Chamada não encontrada.' });
    return;
  }
  if (result.status === 'forbidden') {
    void recordSecurityEvent({
      eventType: 'CALL_SIGNAL_HIJACK_DENIED',
      category: 'social_idor',
      severity: 'high',
      ip: getClientIp(req),
      userId: user.id,
      nickname: user.nickname,
      route: 'POST /api/calls/:callId/signal',
      details: `Unauthorized WebRTC signaling attempt on callId=${callId}`,
    });
    res.status(403).json({ error: 'Acesso negado à sinalização desta chamada.' });
    return;
  }
  if (result.status === 'payload_too_large') {
    res.status(413).json({ error: 'Payload SDP/ICE excedeu o limite permitido.' });
    return;
  }
  res.status(409).json({ error: 'A chamada já foi encerrada.' });
}

export async function heartbeatCallHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const callId = String(req.params.callId || '').trim();
  if (!callId) {
    res.status(400).json({ error: 'Chamada inválida.' });
    return;
  }

  const result = await repoHeartbeatVoiceCall({ userId: user.id, callId });
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Chamada não encontrada.' });
    return;
  }
  if (result.status === 'forbidden') {
    void recordSecurityEvent({
      eventType: 'CALL_HEARTBEAT_IDOR',
      category: 'social_idor',
      severity: 'medium',
      ip: getClientIp(req),
      userId: user.id,
      nickname: user.nickname,
      route: 'POST /api/calls/:callId/heartbeat',
      details: `Unauthorized call heartbeat on callId=${callId}`,
    });
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }
  res.json({ call: result.call });
}

export async function endCallHandler(req: AuthedRequest, res: Response): Promise<void> {
  const user = req.authUser!;
  const callId = String(req.params.callId || '').trim();
  if (!callId) {
    res.status(400).json({ error: 'Chamada inválida.' });
    return;
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'hangup';
  const result = await repoEndVoiceCall({ userId: user.id, callId, reason });
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'Chamada não encontrada.' });
    return;
  }
  if (result.status === 'forbidden') {
    void recordSecurityEvent({
      eventType: 'CALL_END_IDOR',
      category: 'social_idor',
      severity: 'high',
      ip: getClientIp(req),
      userId: user.id,
      nickname: user.nickname,
      route: 'POST /api/calls/:callId/end',
      details: `Unauthorized attempt to hang up callId=${callId}`,
    });
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }
  res.json({ ok: true, call: result.call });
}
