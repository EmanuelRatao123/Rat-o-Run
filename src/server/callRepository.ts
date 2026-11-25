import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { ensureNeonSchema, getNeonDb, getNeonPool, isNeonConfigured } from '../db/neon.ts';
import { friendships, users, voiceCallSignals, voiceCalls } from '../db/schema.ts';
import {
  VoiceCallIceConfig,
  VoiceCallIceServerConfig,
  VoiceCallRecord,
  VoiceCallSignal,
  VoiceCallSignalType,
  VoiceCallStatePayload,
} from '../shared/constants.ts';
import { generateToken } from './crypto.ts';
import { getDb as getLocalDb, saveDb as saveLocalDb } from './store.ts';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const HEARTBEAT_STALE_MS = 45 * 1000;
const TERMINAL_RETENTION_MS = 10 * 60 * 1000;
const RECENT_TERMINAL_WINDOW_MS = 12 * 1000;
const MAX_SIGNAL_PAYLOAD_BYTES = 16384;

function makePairIds(userA: string, userB: string): [string, string] {
  return userA < userB ? [userA, userB] : [userB, userA];
}

export function getInviteTimeoutSec(): number {
  const raw = Number(process.env.CALL_INVITE_TIMEOUT_SEC ?? 30);
  if (!Number.isFinite(raw)) return 30;
  return Math.max(10, Math.min(120, Math.round(raw)));
}

export function getVoiceCallIceConfig(): VoiceCallIceConfig {
  const rawStun = process.env.STUN_URLS?.trim();
  const stunUrls = rawStun
    ? rawStun
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^stuns?:/i.test(s))
    : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

  const iceServers: VoiceCallIceServerConfig[] = [];
  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls });
  }

  const rawTurn = process.env.TURN_URLS?.trim();
  const turnUrls = rawTurn
    ? rawTurn
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^turns?:/i.test(s))
    : [];
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();

  let hasTurn = false;
  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
    hasTurn = true;
  }

  return {
    iceServers,
    inviteTimeoutSec: getInviteTimeoutSec(),
    hasTurn,
  };
}

function mapRowToCallRecord(row: typeof voiceCalls.$inferSelect): VoiceCallRecord {
  return {
    id: row.id,
    callerUserId: row.callerUserId,
    callerNickname: row.callerNickname,
    calleeUserId: row.calleeUserId,
    calleeNickname: row.calleeNickname,
    status: row.status,
    endReason: row.endReason,
    createdAt: row.createdAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
    expiresAt: row.expiresAt,
    callerHeartbeatAt: row.callerHeartbeatAt,
    calleeHeartbeatAt: row.calleeHeartbeatAt,
  };
}

function isCallHeartbeatStale(call: VoiceCallRecord, nowMs: number): boolean {
  if (call.status !== 'accepted') return false;
  const callerHb = new Date(call.callerHeartbeatAt).getTime();
  const calleeHbRaw = call.calleeHeartbeatAt || call.answeredAt || call.callerHeartbeatAt;
  const calleeHb = new Date(calleeHbRaw).getTime();
  if (!Number.isFinite(callerHb) || !Number.isFinite(calleeHb)) return false;
  return nowMs - callerHb > HEARTBEAT_STALE_MS || nowMs - calleeHb > HEARTBEAT_STALE_MS;
}

export async function cleanupExpiredVoiceCalls(nowMs = Date.now()): Promise<void> {
  const nowIso = new Date(nowMs).toISOString();
  const pruneBeforeMs = nowMs - TERMINAL_RETENTION_MS;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    let changed = false;
    const removedCallIds = new Set<string>();

    for (const c of db.voiceCalls) {
      if (c.status === 'ringing' && new Date(c.expiresAt).getTime() <= nowMs) {
        c.status = 'missed';
        c.endReason = 'timeout';
        c.endedAt = nowIso;
        changed = true;
      } else if (c.status === 'accepted' && isCallHeartbeatStale(c, nowMs)) {
        c.status = 'ended';
        c.endReason = 'timeout';
        c.endedAt = nowIso;
        changed = true;
      }
    }

    const keptCalls = db.voiceCalls.filter((c) => {
      if (c.status === 'ringing' || c.status === 'accepted') return true;
      const endedMs = new Date(c.endedAt || c.createdAt).getTime();
      if (Number.isFinite(endedMs) && endedMs < pruneBeforeMs) {
        removedCallIds.add(c.id);
        changed = true;
        return false;
      }
      return true;
    });

    if (removedCallIds.size > 0) {
      db.voiceCalls = keptCalls;
      db.voiceCallSignals = db.voiceCallSignals.filter((s) => !removedCallIds.has(s.callId));
    }

    if (changed) saveLocalDb();
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const liveRows = await db
    .select()
    .from(voiceCalls)
    .where(or(eq(voiceCalls.status, 'ringing'), eq(voiceCalls.status, 'accepted')));

  for (const row of liveRows) {
    const rec = mapRowToCallRecord(row);
    if (rec.status === 'ringing' && new Date(rec.expiresAt).getTime() <= nowMs) {
      await db
        .update(voiceCalls)
        .set({ status: 'missed', endReason: 'timeout', endedAt: nowIso })
        .where(and(eq(voiceCalls.id, rec.id), eq(voiceCalls.status, 'ringing')));
    } else if (rec.status === 'accepted' && isCallHeartbeatStale(rec, nowMs)) {
      await db
        .update(voiceCalls)
        .set({ status: 'ended', endReason: 'timeout', endedAt: nowIso })
        .where(and(eq(voiceCalls.id, rec.id), eq(voiceCalls.status, 'accepted')));
    }
  }
}

export async function repoGetActiveVoiceCallUserIds(userIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (userIds.length === 0) return result;
  const nowMs = Date.now();
  await cleanupExpiredVoiceCalls(nowMs);
  const idSet = new Set(userIds);

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    for (const c of db.voiceCalls) {
      if (c.status === 'ringing' || c.status === 'accepted') {
        if (idSet.has(c.callerUserId)) result.add(c.callerUserId);
        if (idSet.has(c.calleeUserId)) result.add(c.calleeUserId);
      }
    }
    return result;
  }

  const db = getNeonDb();
  const liveRows = await db
    .select({
      callerUserId: voiceCalls.callerUserId,
      calleeUserId: voiceCalls.calleeUserId,
    })
    .from(voiceCalls)
    .where(
      and(
        or(eq(voiceCalls.status, 'ringing'), eq(voiceCalls.status, 'accepted')),
        or(inArray(voiceCalls.callerUserId, userIds), inArray(voiceCalls.calleeUserId, userIds))
      )
    );

  for (const row of liveRows) {
    if (idSet.has(row.callerUserId)) result.add(row.callerUserId);
    if (idSet.has(row.calleeUserId)) result.add(row.calleeUserId);
  }
  return result;
}

export async function repoInviteFriendToCall(params: {
  callerUserId: string;
  callerNickname: string;
  targetUserId: string;
}): Promise<
  | { status: 'ok'; call: VoiceCallRecord }
  | {
      status:
        | 'self_call'
        | 'not_found'
        | 'not_friends'
        | 'target_offline'
        | 'caller_busy'
        | 'target_busy';
      targetNickname?: string;
    }
> {
  const { callerUserId, callerNickname, targetUserId } = params;
  if (!targetUserId || callerUserId === targetUserId) {
    return { status: 'self_call' };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const timeoutSec = getInviteTimeoutSec();
  const expiresAt = new Date(nowMs + timeoutSec * 1000).toISOString();
  await cleanupExpiredVoiceCalls(nowMs);

  const [low, high] = makePairIds(callerUserId, targetUserId);

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const target = db.users[targetUserId];
    if (!target) return { status: 'not_found' };

    const ship = db.friendships.find(
      (f) => f.userLowId === low && f.userHighId === high && f.status === 'accepted'
    );
    if (!ship) return { status: 'not_friends' };

    const targetSeenMs = new Date(target.lastSeenAt).getTime();
    if (!Number.isFinite(targetSeenMs) || nowMs - targetSeenMs > ONLINE_WINDOW_MS) {
      return { status: 'target_offline', targetNickname: target.nickname };
    }

    const callerBusy = db.voiceCalls.some(
      (c) =>
        (c.status === 'ringing' || c.status === 'accepted') &&
        (c.callerUserId === callerUserId || c.calleeUserId === callerUserId)
    );
    if (callerBusy) return { status: 'caller_busy' };

    const targetBusy = db.voiceCalls.some(
      (c) =>
        (c.status === 'ringing' || c.status === 'accepted') &&
        (c.callerUserId === targetUserId || c.calleeUserId === targetUserId)
    );
    if (targetBusy) return { status: 'target_busy', targetNickname: target.nickname };

    const call: VoiceCallRecord = {
      id: `call_${generateToken(10)}`,
      callerUserId,
      callerNickname,
      calleeUserId: target.id,
      calleeNickname: target.nickname,
      status: 'ringing',
      endReason: null,
      createdAt: nowIso,
      answeredAt: null,
      endedAt: null,
      expiresAt,
      callerHeartbeatAt: nowIso,
      calleeHeartbeatAt: null,
    };
    db.voiceCalls.push(call);
    saveLocalDb();
    return { status: 'ok', call };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const targetRes = await client.query<{
      id: string;
      nickname: string;
      last_seen_at: string;
    }>(`SELECT id, nickname, last_seen_at FROM users WHERE id = $1`, [targetUserId]);
    const target = targetRes.rows[0];
    if (!target) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }

    const shipRes = await client.query<{ id: string }>(
      `SELECT id FROM friendships WHERE user_low_id = $1 AND user_high_id = $2 AND status = 'accepted' LIMIT 1`,
      [low, high]
    );
    if (shipRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { status: 'not_friends' };
    }

    const targetSeenMs = new Date(target.last_seen_at).getTime();
    if (!Number.isFinite(targetSeenMs) || nowMs - targetSeenMs > ONLINE_WINDOW_MS) {
      await client.query('ROLLBACK');
      return { status: 'target_offline', targetNickname: target.nickname };
    }

    const busyRes = await client.query<{
      caller_user_id: string;
      callee_user_id: string;
    }>(
      `SELECT caller_user_id, callee_user_id FROM voice_calls
       WHERE status IN ('ringing', 'accepted')
         AND (caller_user_id = $1 OR callee_user_id = $1 OR caller_user_id = $2 OR callee_user_id = $2)
       FOR UPDATE`,
      [callerUserId, targetUserId]
    );

    for (const r of busyRes.rows) {
      if (r.caller_user_id === callerUserId || r.callee_user_id === callerUserId) {
        await client.query('ROLLBACK');
        return { status: 'caller_busy' };
      }
      if (r.caller_user_id === targetUserId || r.callee_user_id === targetUserId) {
        await client.query('ROLLBACK');
        return { status: 'target_busy', targetNickname: target.nickname };
      }
    }

    const callId = `call_${generateToken(10)}`;
    await client.query(
      `INSERT INTO voice_calls (
        id, caller_user_id, caller_nickname, callee_user_id, callee_nickname,
        status, end_reason, created_at, answered_at, ended_at, expires_at,
        caller_heartbeat_at, callee_heartbeat_at
      ) VALUES ($1, $2, $3, $4, $5, 'ringing', NULL, $6, NULL, NULL, $7, $6, NULL)`,
      [callId, callerUserId, callerNickname, target.id, target.nickname, nowIso, expiresAt]
    );

    await client.query('COMMIT');
    return {
      status: 'ok',
      call: {
        id: callId,
        callerUserId,
        callerNickname,
        calleeUserId: target.id,
        calleeNickname: target.nickname,
        status: 'ringing',
        endReason: null,
        createdAt: nowIso,
        answeredAt: null,
        endedAt: null,
        expiresAt,
        callerHeartbeatAt: nowIso,
        calleeHeartbeatAt: null,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function repoRespondToVoiceCall(params: {
  userId: string;
  callId: string;
  action: 'accept' | 'decline' | 'cancel';
}): Promise<{
  status: 'ok' | 'not_found' | 'forbidden' | 'expired' | 'invalid_state' | 'busy';
  call?: VoiceCallRecord;
}> {
  const { userId, callId, action } = params;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  await cleanupExpiredVoiceCalls(nowMs);

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const call = db.voiceCalls.find((c) => c.id === callId);
    if (!call) return { status: 'not_found' };
    if (call.callerUserId !== userId && call.calleeUserId !== userId) {
      return { status: 'forbidden' };
    }
    if (call.status === 'missed') return { status: 'expired' };
    if (call.status !== 'ringing') return { status: 'invalid_state' };

    if (action === 'cancel') {
      if (call.callerUserId !== userId) return { status: 'forbidden' };
      call.status = 'ended';
      call.endReason = 'cancelled';
      call.endedAt = nowIso;
    } else {
      if (call.calleeUserId !== userId) return { status: 'forbidden' };
      if (action === 'accept') {
        const anotherActive = db.voiceCalls.some(
          (c) =>
            c.id !== call.id &&
            c.status === 'accepted' &&
            (c.callerUserId === userId ||
              c.calleeUserId === userId ||
              c.callerUserId === call.callerUserId ||
              c.calleeUserId === call.callerUserId)
        );
        if (anotherActive) return { status: 'busy' };
        call.status = 'accepted';
        call.answeredAt = nowIso;
        call.calleeHeartbeatAt = nowIso;
        call.callerHeartbeatAt = nowIso;
      } else {
        call.status = 'declined';
        call.endReason = 'declined';
        call.endedAt = nowIso;
      }
    }

    saveLocalDb();
    return { status: 'ok', call: { ...call } };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const res = await client.query(`SELECT * FROM voice_calls WHERE id = $1 FOR UPDATE`, [callId]);
    const row = res.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }

    const call: VoiceCallRecord = {
      id: row.id,
      callerUserId: row.caller_user_id,
      callerNickname: row.caller_nickname,
      calleeUserId: row.callee_user_id,
      calleeNickname: row.callee_nickname,
      status: row.status,
      endReason: row.end_reason,
      createdAt: row.created_at,
      answeredAt: row.answered_at,
      endedAt: row.ended_at,
      expiresAt: row.expires_at,
      callerHeartbeatAt: row.caller_heartbeat_at,
      calleeHeartbeatAt: row.callee_heartbeat_at,
    };

    if (call.callerUserId !== userId && call.calleeUserId !== userId) {
      await client.query('ROLLBACK');
      return { status: 'forbidden' };
    }
    if (call.status === 'missed') {
      await client.query('ROLLBACK');
      return { status: 'expired' };
    }
    if (call.status !== 'ringing') {
      await client.query('ROLLBACK');
      return { status: 'invalid_state' };
    }

    if (action === 'cancel') {
      if (call.callerUserId !== userId) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      await client.query(
        `UPDATE voice_calls SET status = 'ended', end_reason = 'cancelled', ended_at = $1 WHERE id = $2`,
        [nowIso, call.id]
      );
      call.status = 'ended';
      call.endReason = 'cancelled';
      call.endedAt = nowIso;
    } else {
      if (call.calleeUserId !== userId) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      if (action === 'accept') {
        const busyRes = await client.query(
          `SELECT id FROM voice_calls
           WHERE id <> $1 AND status = 'accepted'
             AND (caller_user_id = $2 OR callee_user_id = $2 OR caller_user_id = $3 OR callee_user_id = $3)
           LIMIT 1`,
          [call.id, call.callerUserId, call.calleeUserId]
        );
        if (busyRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return { status: 'busy' };
        }
        await client.query(
          `UPDATE voice_calls
           SET status = 'accepted', answered_at = $1, caller_heartbeat_at = $1, callee_heartbeat_at = $1
           WHERE id = $2`,
          [nowIso, call.id]
        );
        call.status = 'accepted';
        call.answeredAt = nowIso;
        call.callerHeartbeatAt = nowIso;
        call.calleeHeartbeatAt = nowIso;
      } else {
        await client.query(
          `UPDATE voice_calls SET status = 'declined', end_reason = 'declined', ended_at = $1 WHERE id = $2`,
          [nowIso, call.id]
        );
        call.status = 'declined';
        call.endReason = 'declined';
        call.endedAt = nowIso;
      }
    }

    await client.query('COMMIT');
    return { status: 'ok', call };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function repoPostVoiceCallSignal(params: {
  userId: string;
  callId: string;
  type: VoiceCallSignalType;
  payload: Record<string, unknown>;
}): Promise<{
  status: 'ok' | 'not_found' | 'forbidden' | 'invalid_state' | 'payload_too_large';
  signal?: VoiceCallSignal;
}> {
  const { userId, callId, type, payload } = params;
  const serialized = JSON.stringify(payload || {});
  if (serialized.length > MAX_SIGNAL_PAYLOAD_BYTES) {
    return { status: 'payload_too_large' };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  await cleanupExpiredVoiceCalls(nowMs);

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const call = db.voiceCalls.find((c) => c.id === callId);
    if (!call) return { status: 'not_found' };
    if (call.callerUserId !== userId && call.calleeUserId !== userId) {
      return { status: 'forbidden' };
    }
    if (call.status !== 'accepted' && call.status !== 'ringing') {
      return { status: 'invalid_state' };
    }

    if (call.callerUserId === userId) call.callerHeartbeatAt = nowIso;
    else call.calleeHeartbeatAt = nowIso;

    const toUserId = call.callerUserId === userId ? call.calleeUserId : call.callerUserId;
    db.voiceCallSignalSeq = (db.voiceCallSignalSeq || 0) + 1;
    const signal: VoiceCallSignal = {
      id: `vsig_${generateToken(8)}`,
      seq: db.voiceCallSignalSeq,
      callId: call.id,
      fromUserId: userId,
      toUserId,
      type,
      payload,
      createdAt: nowIso,
    };
    db.voiceCallSignals.push(signal);
    saveLocalDb();
    return { status: 'ok', signal };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db.select().from(voiceCalls).where(eq(voiceCalls.id, callId)).limit(1);
  const call = rows[0];
  if (!call) return { status: 'not_found' };
  if (call.callerUserId !== userId && call.calleeUserId !== userId) {
    return { status: 'forbidden' };
  }
  if (call.status !== 'accepted' && call.status !== 'ringing') {
    return { status: 'invalid_state' };
  }

  const toUserId = call.callerUserId === userId ? call.calleeUserId : call.callerUserId;
  await db
    .update(voiceCalls)
    .set(
      call.callerUserId === userId
        ? { callerHeartbeatAt: nowIso }
        : { calleeHeartbeatAt: nowIso }
    )
    .where(eq(voiceCalls.id, call.id));

  const inserted = await db
    .insert(voiceCallSignals)
    .values({
      id: `vsig_${generateToken(8)}`,
      callId: call.id,
      fromUserId: userId,
      toUserId,
      type,
      payload,
      createdAt: nowIso,
    })
    .returning();

  const row = inserted[0];
  return {
    status: 'ok',
    signal: {
      id: row.id,
      seq: row.seq,
      callId: row.callId,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      type: row.type,
      payload: row.payload,
      createdAt: row.createdAt,
    },
  };
}

export async function repoHeartbeatVoiceCall(params: {
  userId: string;
  callId: string;
}): Promise<{
  status: 'ok' | 'not_found' | 'forbidden';
  call?: VoiceCallRecord;
}> {
  const { userId, callId } = params;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  await cleanupExpiredVoiceCalls(nowMs);

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const call = db.voiceCalls.find((c) => c.id === callId);
    if (!call) return { status: 'not_found' };
    if (call.callerUserId !== userId && call.calleeUserId !== userId) {
      return { status: 'forbidden' };
    }
    if (call.status === 'ringing' || call.status === 'accepted') {
      if (call.callerUserId === userId) call.callerHeartbeatAt = nowIso;
      else call.calleeHeartbeatAt = nowIso;
      saveLocalDb();
    }
    return { status: 'ok', call: { ...call } };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db.select().from(voiceCalls).where(eq(voiceCalls.id, callId)).limit(1);
  const row = rows[0];
  if (!row) return { status: 'not_found' };
  if (row.callerUserId !== userId && row.calleeUserId !== userId) {
    return { status: 'forbidden' };
  }
  const rec = mapRowToCallRecord(row);
  if (rec.status === 'ringing' || rec.status === 'accepted') {
    await db
      .update(voiceCalls)
      .set(
        rec.callerUserId === userId
          ? { callerHeartbeatAt: nowIso }
          : { calleeHeartbeatAt: nowIso }
      )
      .where(eq(voiceCalls.id, rec.id));
    if (rec.callerUserId === userId) rec.callerHeartbeatAt = nowIso;
    else rec.calleeHeartbeatAt = nowIso;
  }
  return { status: 'ok', call: rec };
}

export async function repoEndVoiceCall(params: {
  userId: string;
  callId: string;
  reason?: string;
}): Promise<{
  status: 'ok' | 'not_found' | 'forbidden';
  call?: VoiceCallRecord;
}> {
  const { userId, callId, reason } = params;
  const cleanReason =
    typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 32) : 'hangup';
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const call = db.voiceCalls.find((c) => c.id === callId);
    if (!call) return { status: 'not_found' };
    if (call.callerUserId !== userId && call.calleeUserId !== userId) {
      return { status: 'forbidden' };
    }
    if (call.status === 'ringing' || call.status === 'accepted') {
      call.status = 'ended';
      call.endReason = cleanReason;
      call.endedAt = nowIso;
      saveLocalDb();
    }
    return { status: 'ok', call: { ...call } };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db.select().from(voiceCalls).where(eq(voiceCalls.id, callId)).limit(1);
  const row = rows[0];
  if (!row) return { status: 'not_found' };
  if (row.callerUserId !== userId && row.calleeUserId !== userId) {
    return { status: 'forbidden' };
  }
  const rec = mapRowToCallRecord(row);
  if (rec.status === 'ringing' || rec.status === 'accepted') {
    await db
      .update(voiceCalls)
      .set({ status: 'ended', endReason: cleanReason, endedAt: nowIso })
      .where(eq(voiceCalls.id, rec.id));
    rec.status = 'ended';
    rec.endReason = cleanReason;
    rec.endedAt = nowIso;
  }
  return { status: 'ok', call: rec };
}

export async function repoGetVoiceCallState(params: {
  userId: string;
  callId?: string;
  sinceSeq?: number;
}): Promise<VoiceCallStatePayload> {
  const { userId, callId, sinceSeq = 0 } = params;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const terminalCutoffIso = new Date(nowMs - RECENT_TERMINAL_WINDOW_MS).toISOString();
  await cleanupExpiredVoiceCalls(nowMs);

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const myCalls = db.voiceCalls
      .filter((c) => c.callerUserId === userId || c.calleeUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const activeCall =
      myCalls.find(
        (c) =>
          c.status === 'accepted' || (c.status === 'ringing' && c.callerUserId === userId)
      ) || null;
    const incomingInvite =
      myCalls.find((c) => c.status === 'ringing' && c.calleeUserId === userId) || null;
    const recentTerminalCall =
      !activeCall
        ? myCalls.find(
            (c) =>
              (c.status === 'ended' || c.status === 'declined' || c.status === 'missed') &&
              (c.endedAt || c.createdAt) >= terminalCutoffIso
          ) || null
        : null;

    // Update caller/callee heartbeat passively on active call polls
    if (activeCall) {
      if (activeCall.callerUserId === userId) activeCall.callerHeartbeatAt = nowIso;
      else activeCall.calleeHeartbeatAt = nowIso;
      saveLocalDb();
    }

    const targetCallId = callId || activeCall?.id || null;
    const signals = targetCallId
      ? db.voiceCallSignals
          .filter(
            (s) => s.callId === targetCallId && s.toUserId === userId && s.seq > sinceSeq
          )
          .sort((a, b) => a.seq - b.seq)
      : [];

    const acceptedFriendShips = db.friendships.filter(
      (f) => f.status === 'accepted' && (f.userLowId === userId || f.userHighId === userId)
    );
    const friendIds = acceptedFriendShips.map((f) =>
      f.userLowId === userId ? f.userHighId : f.userLowId
    );
    const inCallSet = await repoGetActiveVoiceCallUserIds(friendIds);

    return {
      serverNow: nowIso,
      activeCall: activeCall ? { ...activeCall } : null,
      incomingInvite: incomingInvite ? { ...incomingInvite } : null,
      recentTerminalCall: recentTerminalCall ? { ...recentTerminalCall } : null,
      signals,
      inCallFriendIds: Array.from(inCallSet),
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const [myCallRows, myShipRows] = await Promise.all([
    db
      .select()
      .from(voiceCalls)
      .where(or(eq(voiceCalls.callerUserId, userId), eq(voiceCalls.calleeUserId, userId)))
      .orderBy(desc(voiceCalls.createdAt))
      .limit(12),
    db
      .select({ userLowId: friendships.userLowId, userHighId: friendships.userHighId })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(eq(friendships.userLowId, userId), eq(friendships.userHighId, userId))
        )
      ),
  ]);

  const myCalls = myCallRows.map(mapRowToCallRecord);
  const activeCall =
    myCalls.find(
      (c) => c.status === 'accepted' || (c.status === 'ringing' && c.callerUserId === userId)
    ) || null;
  const incomingInvite =
    myCalls.find((c) => c.status === 'ringing' && c.calleeUserId === userId) || null;
  const recentTerminalCall =
    !activeCall
      ? myCalls.find(
          (c) =>
            (c.status === 'ended' || c.status === 'declined' || c.status === 'missed') &&
            (c.endedAt || c.createdAt) >= terminalCutoffIso
        ) || null
      : null;

  if (activeCall) {
    await db
      .update(voiceCalls)
      .set(
        activeCall.callerUserId === userId
          ? { callerHeartbeatAt: nowIso }
          : { calleeHeartbeatAt: nowIso }
      )
      .where(eq(voiceCalls.id, activeCall.id));
  }

  const targetCallId = callId || activeCall?.id || null;
  const friendIds = myShipRows.map((f) => (f.userLowId === userId ? f.userHighId : f.userLowId));

  const [signalRows, inCallSet] = await Promise.all([
    targetCallId
      ? db
          .select()
          .from(voiceCallSignals)
          .where(
            and(
              eq(voiceCallSignals.callId, targetCallId),
              eq(voiceCallSignals.toUserId, userId),
              gte(voiceCallSignals.seq, sinceSeq + 1)
            )
          )
          .orderBy(asc(voiceCallSignals.seq))
      : Promise.resolve([]),
    repoGetActiveVoiceCallUserIds(friendIds),
  ]);

  return {
    serverNow: nowIso,
    activeCall,
    incomingInvite,
    recentTerminalCall,
    signals: signalRows.map((row) => ({
      id: row.id,
      seq: row.seq,
      callId: row.callId,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      type: row.type,
      payload: row.payload,
      createdAt: row.createdAt,
    })),
    inCallFriendIds: Array.from(inCallSet),
  };
}
