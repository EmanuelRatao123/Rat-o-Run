import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { ensureNeonSchema, getNeonDb, isNeonConfigured } from '../db/neon.ts';
import {
  multiplayerEvents,
  multiplayerInvites,
  multiplayerMatches,
  multiplayerParticipants,
  multiplayerRooms,
  playerCompetitiveStats,
  users,
  x1Results,
} from '../db/schema.ts';
import {
  MapId,
  MultiplayerInvite,
  MultiplayerMatchRecord,
  MultiplayerMode,
  MultiplayerParticipant,
  MultiplayerRoom,
  ParticipantAnimState,
  PlayerCompetitiveStats,
  PublicPlayerLookup,
  SkinId,
  X1ResultRecord,
} from '../shared/constants.ts';
import { verifySeededCoinSpawn } from '../shared/trackGenerator.ts';
import { generateToken } from './crypto.ts';
import {
  repoCanUserEquipSkin,
  repoComputePlayerRank,
  repoFindUserByNickname,
  repoGetCompetitiveStatsForUser,
  repoGetRecentX1ResultsForUser,
} from './repository.ts';
import { StoredUser, getDb as getLocalDb, saveDb as saveLocalDb } from './store.ts';

export const COUNTDOWN_DURATION_MS = 3400;
export const DISCONNECT_GRACE_MS = 12000;
export const INVITE_TTL_MS = 5 * 60 * 1000;
export const X1_MAX_DURATION_MS = 180000;

export interface RoomBundle {
  room: MultiplayerRoom;
  participants: MultiplayerParticipant[];
  x1Result: X1ResultRecord | null;
  matchRecord: MultiplayerMatchRecord | null;
}

export interface TelemetrySyncInput {
  posX: number;
  posY: number;
  posZ: number;
  lane: number;
  animState: ParticipantAnimState;
  distance: number;
  coins: number;
  score: number;
  noCoinTimeMs: number;
  durationMs: number;
  collisionCount: number;
  alive: boolean;
  hoverboard: boolean;
  jetpack: boolean;
  events?: {
    type: 'coin_collected' | 'crashed' | 'finished';
    coinZ?: number;
    coinLane?: number;
    timestampMs?: number;
  }[];
}

function defaultCompStats(userId: string): PlayerCompetitiveStats {
  return {
    userId,
    x1Wins: 0,
    x1Losses: 0,
    x1Draws: 0,
    coopMatches: 0,
    coopWins: 0,
    lastMatchAt: null,
  };
}

function sanitizeAnimState(val: unknown): ParticipantAnimState {
  const valid: ParticipantAnimState[] = ['idle', 'run', 'jump', 'slide', 'stumble', 'crash', 'jetpack'];
  return typeof val === 'string' && valid.includes(val as ParticipantAnimState)
    ? (val as ParticipantAnimState)
    : 'run';
}

function generateTrackSeed(): number {
  return Math.floor(100000 + Math.random() * 2000000000);
}

// --- Player Public Search ---

export async function mpSearchPlayersByNickname(
  query: string,
  requesterId: string
): Promise<PublicPlayerLookup[]> {
  const clean = query.trim().toLowerCase();
  if (clean.length < 1) return [];
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const matches = Object.values(db.users)
      .filter((u) => u.id !== requesterId && u.nicknameLower.includes(clean))
      .slice(0, 12);

    return Promise.all(
      matches.map(async (u) => ({
        id: u.id,
        nickname: u.nickname,
        equippedSkin: u.equippedSkin,
        bestNoCoinTimeMs: u.bestNoCoinTimeMs,
        bestDistance: u.bestDistance,
        totalMatches: u.totalMatches,
        rank: await repoComputePlayerRank(u.id),
        onlineRecently: new Date(u.lastSeenAt).getTime() >= fiveMinAgo,
        competitiveStats: db.playerCompetitiveStats[u.id] || defaultCompStats(u.id),
      }))
    );
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const escaped = clean.replace(/[\\%_]/g, '\\$&');
  const rows = await db
    .select()
    .from(users)
    .where(ilike(users.nicknameLower, `%${escaped}%`))
    .limit(15);

  const filtered = rows.filter((u) => u.id !== requesterId).slice(0, 12);
  return Promise.all(
    filtered.map(async (u) => ({
      id: u.id,
      nickname: u.nickname,
      equippedSkin: u.equippedSkin,
      bestNoCoinTimeMs: u.bestNoCoinTimeMs,
      bestDistance: u.bestDistance,
      totalMatches: u.totalMatches,
      rank: await repoComputePlayerRank(u.id),
      onlineRecently: new Date(u.lastSeenAt).getTime() >= fiveMinAgo,
      competitiveStats: await repoGetCompetitiveStatsForUser(u.id),
    }))
  );
}

// --- Invite Creation & Response ---

export async function mpCreateInviteAndRoom(params: {
  host: StoredUser;
  targetNickname: string;
  mode: MultiplayerMode;
  mapId: MapId;
}): Promise<
  | { status: 'ok'; invite: MultiplayerInvite; room: MultiplayerRoom; participants: MultiplayerParticipant[] }
  | { status: 'not_found' | 'self_invite' | 'duplicate_invite' }
> {
  const { host, targetNickname, mode, mapId } = params;
  const target = await repoFindUserByNickname(targetNickname);
  if (!target) return { status: 'not_found' };
  if (target.id === host.id) return { status: 'self_invite' };

  const hostSkin: SkinId = (await repoCanUserEquipSkin(host, host.equippedSkin))
    ? host.equippedSkin
    : 'ratao';

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + INVITE_TTL_MS).toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    // Expire old invites
    for (const inv of db.multiplayerInvites) {
      if (inv.status === 'pending' && new Date(inv.expiresAt).getTime() <= nowMs) {
        inv.status = 'expired';
      }
    }
    const duplicate = db.multiplayerInvites.find(
      (inv) =>
        inv.fromUserId === host.id &&
        inv.toUserId === target.id &&
        inv.status === 'pending' &&
        inv.mode === mode
    );
    if (duplicate) return { status: 'duplicate_invite' };

    const roomId = `rm_${generateToken(8)}`;
    const inviteId = `inv_${generateToken(8)}`;

    const room: MultiplayerRoom = {
      id: roomId,
      mode,
      mapId,
      seed: generateTrackSeed(),
      hostUserId: host.id,
      guestUserId: null,
      status: 'invite_sent',
      countdownStartAt: null,
      startedAt: null,
      finishedAt: null,
      winnerUserId: null,
      loserUserId: null,
      resultReason: null,
      maxDurationMs: X1_MAX_DURATION_MS,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const hostParticipant: MultiplayerParticipant = {
      id: `pt_${generateToken(8)}`,
      roomId,
      userId: host.id,
      nickname: host.nickname,
      skinId: hostSkin,
      role: 'host',
      ready: false,
      connected: true,
      lastHeartbeatAt: nowMs,
      posX: 0,
      posY: 0,
      posZ: 0,
      lane: 0,
      animState: 'idle',
      distance: 0,
      coins: 0,
      score: 0,
      noCoinTimeMs: 0,
      durationMs: 0,
      collisionCount: 0,
      alive: true,
      collectedFirstCoin: false,
      finishedAt: null,
      hoverboard: false,
      jetpack: false,
      updatedAt: nowIso,
    };

    const invite: MultiplayerInvite = {
      id: inviteId,
      roomId,
      fromUserId: host.id,
      fromNickname: host.nickname,
      fromSkinId: hostSkin,
      toUserId: target.id,
      toNickname: target.nickname,
      mode,
      mapId,
      status: 'pending',
      createdAt: nowIso,
      respondedAt: null,
      expiresAt: expiresIso,
    };

    db.multiplayerRooms[roomId] = room;
    db.multiplayerParticipants.push(hostParticipant);
    db.multiplayerInvites.unshift(invite);
    db.multiplayerEvents.push({
      id: `ev_${generateToken(8)}`,
      roomId,
      userId: host.id,
      eventType: 'invite_sent',
      payload: { toUserId: target.id, toNickname: target.nickname, mode, mapId },
      createdAt: nowIso,
    });
    saveLocalDb();

    return { status: 'ok', invite, room, participants: [hostParticipant] };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const existingPending = await db
    .select()
    .from(multiplayerInvites)
    .where(
      and(
        eq(multiplayerInvites.fromUserId, host.id),
        eq(multiplayerInvites.toUserId, target.id),
        eq(multiplayerInvites.mode, mode),
        eq(multiplayerInvites.status, 'pending')
      )
    );

  const activeDup = existingPending.find((inv) => new Date(inv.expiresAt).getTime() > nowMs);
  if (activeDup) return { status: 'duplicate_invite' };

  // Mark any stale pending invites as expired
  for (const stale of existingPending) {
    await db
      .update(multiplayerInvites)
      .set({ status: 'expired' })
      .where(eq(multiplayerInvites.id, stale.id));
  }

  const roomId = `rm_${generateToken(8)}`;
  const inviteId = `inv_${generateToken(8)}`;

  const room: MultiplayerRoom = {
    id: roomId,
    mode,
    mapId,
    seed: generateTrackSeed(),
    hostUserId: host.id,
    guestUserId: null,
    status: 'invite_sent',
    countdownStartAt: null,
    startedAt: null,
    finishedAt: null,
    winnerUserId: null,
    loserUserId: null,
    resultReason: null,
    maxDurationMs: X1_MAX_DURATION_MS,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const hostParticipant: MultiplayerParticipant = {
    id: `pt_${generateToken(8)}`,
    roomId,
    userId: host.id,
    nickname: host.nickname,
    skinId: hostSkin,
    role: 'host',
    ready: false,
    connected: true,
    lastHeartbeatAt: nowMs,
    posX: 0,
    posY: 0,
    posZ: 0,
    lane: 0,
    animState: 'idle',
    distance: 0,
    coins: 0,
    score: 0,
    noCoinTimeMs: 0,
    durationMs: 0,
    collisionCount: 0,
    alive: true,
    collectedFirstCoin: false,
    finishedAt: null,
    hoverboard: false,
    jetpack: false,
    updatedAt: nowIso,
  };

  const invite: MultiplayerInvite = {
    id: inviteId,
    roomId,
    fromUserId: host.id,
    fromNickname: host.nickname,
    fromSkinId: hostSkin,
    toUserId: target.id,
    toNickname: target.nickname,
    mode,
    mapId,
    status: 'pending',
    createdAt: nowIso,
    respondedAt: null,
    expiresAt: expiresIso,
  };

  await db.insert(multiplayerRooms).values(room);
  await db.insert(multiplayerParticipants).values(hostParticipant);
  await db.insert(multiplayerInvites).values(invite);
  await db.insert(multiplayerEvents).values({
    id: `ev_${generateToken(8)}`,
    roomId,
    userId: host.id,
    eventType: 'invite_sent',
    payload: { toUserId: target.id, toNickname: target.nickname, mode, mapId },
    createdAt: nowIso,
  });

  return { status: 'ok', invite, room, participants: [hostParticipant] };
}

export async function mpRespondToInvite(params: {
  inviteId: string;
  user: StoredUser;
  action: 'accept' | 'decline' | 'cancel';
}): Promise<
  | { status: 'ok'; invite: MultiplayerInvite; bundle: RoomBundle | null }
  | { status: 'not_found' | 'forbidden' | 'expired' | 'invalid_state' }
> {
  const { inviteId, user, action } = params;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const verifiedSkin: SkinId = (await repoCanUserEquipSkin(user, user.equippedSkin))
    ? user.equippedSkin
    : 'ratao';

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const inv = db.multiplayerInvites.find((i) => i.id === inviteId);
    if (!inv) return { status: 'not_found' };

    if (action === 'cancel') {
      if (inv.fromUserId !== user.id) return { status: 'forbidden' };
      if (inv.status !== 'pending') return { status: 'invalid_state' };
      inv.status = 'cancelled';
      inv.respondedAt = nowIso;
      const room = db.multiplayerRooms[inv.roomId];
      if (room && room.status !== 'finished') {
        room.status = 'cancelled';
        room.updatedAt = nowIso;
      }
      saveLocalDb();
      return { status: 'ok', invite: inv, bundle: null };
    }

    if (inv.toUserId !== user.id) return { status: 'forbidden' };
    if (inv.status !== 'pending') return { status: 'invalid_state' };
    if (new Date(inv.expiresAt).getTime() <= nowMs) {
      inv.status = 'expired';
      saveLocalDb();
      return { status: 'expired' };
    }

    const room = db.multiplayerRooms[inv.roomId];
    if (!room || room.status === 'cancelled' || room.status === 'finished') {
      inv.status = 'expired';
      saveLocalDb();
      return { status: 'invalid_state' };
    }

    if (action === 'decline') {
      inv.status = 'declined';
      inv.respondedAt = nowIso;
      room.status = 'cancelled';
      room.resultReason = 'invite_declined';
      room.updatedAt = nowIso;
      db.multiplayerEvents.push({
        id: `ev_${generateToken(8)}`,
        roomId: room.id,
        userId: user.id,
        eventType: 'invite_declined',
        payload: { byNickname: user.nickname },
        createdAt: nowIso,
      });
      saveLocalDb();
      return { status: 'ok', invite: inv, bundle: null };
    }

    // Accept
    inv.status = 'accepted';
    inv.respondedAt = nowIso;
    room.guestUserId = user.id;
    room.status = 'preparing';
    room.updatedAt = nowIso;

    let guestPt = db.multiplayerParticipants.find(
      (p) => p.roomId === room.id && p.userId === user.id
    );
    if (!guestPt) {
      guestPt = {
        id: `pt_${generateToken(8)}`,
        roomId: room.id,
        userId: user.id,
        nickname: user.nickname,
        skinId: verifiedSkin,
        role: 'guest',
        ready: false,
        connected: true,
        lastHeartbeatAt: nowMs,
        posX: 0,
        posY: 0,
        posZ: 0,
        lane: 0,
        animState: 'idle',
        distance: 0,
        coins: 0,
        score: 0,
        noCoinTimeMs: 0,
        durationMs: 0,
        collisionCount: 0,
        alive: true,
        collectedFirstCoin: false,
        finishedAt: null,
        hoverboard: false,
        jetpack: false,
        updatedAt: nowIso,
      };
      db.multiplayerParticipants.push(guestPt);
    }
    db.multiplayerEvents.push({
      id: `ev_${generateToken(8)}`,
      roomId: room.id,
      userId: user.id,
      eventType: 'invite_accepted',
      payload: { byNickname: user.nickname },
      createdAt: nowIso,
    });
    saveLocalDb();
    const bundle = await mpGetRoomBundle(room.id, user.id);
    return { status: 'ok', invite: inv, bundle };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const invRows = await db
    .select()
    .from(multiplayerInvites)
    .where(eq(multiplayerInvites.id, inviteId))
    .limit(1);
  const inv = invRows[0];
  if (!inv) return { status: 'not_found' };

  if (action === 'cancel') {
    if (inv.fromUserId !== user.id) return { status: 'forbidden' };
    if (inv.status !== 'pending') return { status: 'invalid_state' };
    await db
      .update(multiplayerInvites)
      .set({ status: 'cancelled', respondedAt: nowIso })
      .where(eq(multiplayerInvites.id, inviteId));
    await db
      .update(multiplayerRooms)
      .set({ status: 'cancelled', updatedAt: nowIso })
      .where(eq(multiplayerRooms.id, inv.roomId));
    return {
      status: 'ok',
      invite: { ...inv, status: 'cancelled', respondedAt: nowIso },
      bundle: null,
    };
  }

  if (inv.toUserId !== user.id) return { status: 'forbidden' };
  if (inv.status !== 'pending') return { status: 'invalid_state' };
  if (new Date(inv.expiresAt).getTime() <= nowMs) {
    await db
      .update(multiplayerInvites)
      .set({ status: 'expired' })
      .where(eq(multiplayerInvites.id, inviteId));
    return { status: 'expired' };
  }

  const roomRows = await db
    .select()
    .from(multiplayerRooms)
    .where(eq(multiplayerRooms.id, inv.roomId))
    .limit(1);
  const room = roomRows[0];
  if (!room || room.status === 'cancelled' || room.status === 'finished') {
    await db
      .update(multiplayerInvites)
      .set({ status: 'expired' })
      .where(eq(multiplayerInvites.id, inviteId));
    return { status: 'invalid_state' };
  }

  if (action === 'decline') {
    await db
      .update(multiplayerInvites)
      .set({ status: 'declined', respondedAt: nowIso })
      .where(eq(multiplayerInvites.id, inviteId));
    await db
      .update(multiplayerRooms)
      .set({ status: 'cancelled', resultReason: 'invite_declined', updatedAt: nowIso })
      .where(eq(multiplayerRooms.id, room.id));
    await db.insert(multiplayerEvents).values({
      id: `ev_${generateToken(8)}`,
      roomId: room.id,
      userId: user.id,
      eventType: 'invite_declined',
      payload: { byNickname: user.nickname },
      createdAt: nowIso,
    });
    return {
      status: 'ok',
      invite: { ...inv, status: 'declined', respondedAt: nowIso },
      bundle: null,
    };
  }

  // Atomic accept
  const claimed = await db
    .update(multiplayerInvites)
    .set({ status: 'accepted', respondedAt: nowIso })
    .where(and(eq(multiplayerInvites.id, inviteId), eq(multiplayerInvites.status, 'pending')))
    .returning();
  if (claimed.length === 0) return { status: 'invalid_state' };

  await db
    .update(multiplayerRooms)
    .set({ guestUserId: user.id, status: 'preparing', updatedAt: nowIso })
    .where(eq(multiplayerRooms.id, room.id));

  await db
    .insert(multiplayerParticipants)
    .values({
      id: `pt_${generateToken(8)}`,
      roomId: room.id,
      userId: user.id,
      nickname: user.nickname,
      skinId: verifiedSkin,
      role: 'guest',
      ready: false,
      connected: true,
      lastHeartbeatAt: nowMs,
      posX: 0,
      posY: 0,
      posZ: 0,
      lane: 0,
      animState: 'idle',
      distance: 0,
      coins: 0,
      score: 0,
      noCoinTimeMs: 0,
      durationMs: 0,
      collisionCount: 0,
      alive: true,
      collectedFirstCoin: false,
      finishedAt: null,
      hoverboard: false,
      jetpack: false,
      updatedAt: nowIso,
    })
    .onConflictDoNothing();

  await db.insert(multiplayerEvents).values({
    id: `ev_${generateToken(8)}`,
    roomId: room.id,
    userId: user.id,
    eventType: 'invite_accepted',
    payload: { byNickname: user.nickname },
    createdAt: nowIso,
  });

  const bundle = await mpGetRoomBundle(room.id, user.id);
  return { status: 'ok', invite: claimed[0], bundle };
}

// --- Overview & Reconnection ---

export async function mpGetOverviewForUser(userId: string): Promise<{
  incomingInvites: MultiplayerInvite[];
  outgoingInvites: MultiplayerInvite[];
  activeRoom: RoomBundle | null;
  competitiveStats: PlayerCompetitiveStats;
  recentMatches: MultiplayerMatchRecord[];
  recentX1: X1ResultRecord[];
}> {
  const nowMs = Date.now();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    let changed = false;
    for (const inv of db.multiplayerInvites) {
      if (inv.status === 'pending' && new Date(inv.expiresAt).getTime() <= nowMs) {
        inv.status = 'expired';
        changed = true;
      }
    }
    if (changed) saveLocalDb();

    const incomingInvites = db.multiplayerInvites.filter(
      (i) => i.toUserId === userId && i.status === 'pending'
    );
    const outgoingInvites = db.multiplayerInvites.filter(
      (i) => i.fromUserId === userId && i.status === 'pending'
    );

    const activeRooms = Object.values(db.multiplayerRooms)
      .filter(
        (r) =>
          (r.hostUserId === userId || r.guestUserId === userId) &&
          (r.status === 'preparing' ||
            r.status === 'countdown' ||
            r.status === 'in_progress' ||
            (r.status === 'invite_sent' && r.hostUserId === userId))
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const activeRoom = activeRooms[0] ? await mpGetRoomBundle(activeRooms[0].id, userId) : null;
    const recentMatches = db.multiplayerMatches
      .filter((m) => m.hostUserId === userId || m.guestUserId === userId)
      .slice(0, 10);

    return {
      incomingInvites,
      outgoingInvites,
      activeRoom,
      competitiveStats: await repoGetCompetitiveStatsForUser(userId),
      recentMatches,
      recentX1: await repoGetRecentX1ResultsForUser(userId, 10),
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const [inRows, outRows, roomRows, recentMatches, compStats, recentX1] = await Promise.all([
    db
      .select()
      .from(multiplayerInvites)
      .where(and(eq(multiplayerInvites.toUserId, userId), eq(multiplayerInvites.status, 'pending')))
      .orderBy(desc(multiplayerInvites.createdAt)),
    db
      .select()
      .from(multiplayerInvites)
      .where(and(eq(multiplayerInvites.fromUserId, userId), eq(multiplayerInvites.status, 'pending')))
      .orderBy(desc(multiplayerInvites.createdAt)),
    db
      .select()
      .from(multiplayerRooms)
      .where(or(eq(multiplayerRooms.hostUserId, userId), eq(multiplayerRooms.guestUserId, userId)))
      .orderBy(desc(multiplayerRooms.createdAt))
      .limit(10),
    db
      .select()
      .from(multiplayerMatches)
      .where(or(eq(multiplayerMatches.hostUserId, userId), eq(multiplayerMatches.guestUserId, userId)))
      .orderBy(desc(multiplayerMatches.createdAt))
      .limit(10),
    repoGetCompetitiveStatsForUser(userId),
    repoGetRecentX1ResultsForUser(userId, 10),
  ]);

  const incomingInvites = inRows.filter((i) => new Date(i.expiresAt).getTime() > nowMs);
  const outgoingInvites = outRows.filter((i) => new Date(i.expiresAt).getTime() > nowMs);

  const openRoom = roomRows.find(
    (r) =>
      r.status === 'preparing' ||
      r.status === 'countdown' ||
      r.status === 'in_progress' ||
      (r.status === 'invite_sent' && r.hostUserId === userId)
  );
  const activeRoom = openRoom ? await mpGetRoomBundle(openRoom.id, userId) : null;

  return {
    incomingInvites,
    outgoingInvites,
    activeRoom,
    competitiveStats: compStats,
    recentMatches,
    recentX1,
  };
}

// --- Finalization & Stats Persistence Helper ---

async function finalizeRoomInternal(params: {
  room: MultiplayerRoom;
  participants: MultiplayerParticipant[];
  winnerUserId: string | null;
  loserUserId: string | null;
  resultReason: string;
  nowMs: number;
}): Promise<{ x1Result: X1ResultRecord | null; matchRecord: MultiplayerMatchRecord | null }> {
  const { room, participants, winnerUserId, loserUserId, resultReason, nowMs } = params;
  const nowIso = new Date(nowMs).toISOString();
  const hostPt = participants.find((p) => p.userId === room.hostUserId);
  const guestPt = participants.find((p) => p.userId === room.guestUserId);
  if (!hostPt || !guestPt) {
    return { x1Result: null, matchRecord: null };
  }

  const matchId = `mpm_${generateToken(8)}`;
  const matchRecord: MultiplayerMatchRecord = {
    id: matchId,
    roomId: room.id,
    mode: room.mode,
    mapId: room.mapId,
    seed: room.seed,
    hostUserId: hostPt.userId,
    hostNickname: hostPt.nickname,
    hostSkinId: hostPt.skinId,
    guestUserId: guestPt.userId,
    guestNickname: guestPt.nickname,
    guestSkinId: guestPt.skinId,
    winnerUserId,
    resultReason,
    hostDistance: hostPt.distance,
    hostDurationMs: hostPt.durationMs,
    hostCoins: hostPt.coins,
    hostScore: hostPt.score,
    guestDistance: guestPt.distance,
    guestDurationMs: guestPt.durationMs,
    guestCoins: guestPt.coins,
    guestScore: guestPt.score,
    createdAt: nowIso,
  };

  let x1Res: X1ResultRecord | null = null;
  if (room.mode === 'x1') {
    const winPt = winnerUserId ? participants.find((p) => p.userId === winnerUserId) || null : null;
    const losePt = loserUserId ? participants.find((p) => p.userId === loserUserId) || null : null;
    const isDraw = !winnerUserId;
    x1Res = {
      id: `x1_${generateToken(8)}`,
      roomId: room.id,
      matchId,
      winnerUserId: winPt?.userId ?? null,
      winnerNickname: winPt?.nickname ?? null,
      loserUserId: losePt?.userId ?? null,
      loserNickname: losePt?.nickname ?? null,
      isDraw,
      reason: resultReason,
      mapId: room.mapId,
      winnerDurationMs: winPt?.durationMs ?? hostPt.durationMs,
      loserDurationMs: losePt?.durationMs ?? guestPt.durationMs,
      winnerDistance: winPt?.distance ?? hostPt.distance,
      loserDistance: losePt?.distance ?? guestPt.distance,
      createdAt: nowIso,
    };
  }

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    room.status = 'finished';
    room.finishedAt = nowMs;
    room.winnerUserId = winnerUserId;
    room.loserUserId = loserUserId;
    room.resultReason = resultReason;
    room.updatedAt = nowIso;

    db.multiplayerMatches.unshift(matchRecord);
    if (x1Res) db.x1Results.unshift(x1Res);

    const ensureStats = (uid: string) => {
      if (!db.playerCompetitiveStats[uid]) {
        db.playerCompetitiveStats[uid] = defaultCompStats(uid);
      }
      return db.playerCompetitiveStats[uid];
    };

    const hStats = ensureStats(hostPt.userId);
    const gStats = ensureStats(guestPt.userId);
    hStats.lastMatchAt = nowIso;
    gStats.lastMatchAt = nowIso;

    if (room.mode === 'x1') {
      if (!winnerUserId) {
        hStats.x1Draws += 1;
        gStats.x1Draws += 1;
      } else {
        const wStats = ensureStats(winnerUserId);
        wStats.x1Wins += 1;
        if (loserUserId) ensureStats(loserUserId).x1Losses += 1;
      }
    } else {
      hStats.coopMatches += 1;
      gStats.coopMatches += 1;
      if (winnerUserId) ensureStats(winnerUserId).coopWins += 1;
    }

    db.multiplayerEvents.push({
      id: `ev_${generateToken(8)}`,
      roomId: room.id,
      userId: winnerUserId || room.hostUserId,
      eventType: 'room_finished',
      payload: { mode: room.mode, winnerUserId, loserUserId, resultReason },
      createdAt: nowIso,
    });

    saveLocalDb();
    return { x1Result: x1Res, matchRecord };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  // Atomically claim finalization so concurrent coin/crash requests never double-award stats!
  const claimed = await db
    .update(multiplayerRooms)
    .set({
      status: 'finished',
      finishedAt: nowMs,
      winnerUserId,
      loserUserId,
      resultReason,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(multiplayerRooms.id, room.id),
        or(
          eq(multiplayerRooms.status, 'in_progress'),
          eq(multiplayerRooms.status, 'countdown'),
          eq(multiplayerRooms.status, 'preparing')
        )
      )
    )
    .returning();

  if (claimed.length === 0) {
    const existingMatch = await db
      .select()
      .from(multiplayerMatches)
      .where(eq(multiplayerMatches.roomId, room.id))
      .limit(1);
    const existingX1 = await db
      .select()
      .from(x1Results)
      .where(eq(x1Results.roomId, room.id))
      .limit(1);
    return { x1Result: existingX1[0] || null, matchRecord: existingMatch[0] || null };
  }

  await db.insert(multiplayerMatches).values(matchRecord);
  if (x1Res) {
    await db.insert(x1Results).values(x1Res);
  }

  const updateStats = async (uid: string, delta: { x1W?: number; x1L?: number; x1D?: number; cM?: number; cW?: number }) => {
    const cur = await repoGetCompetitiveStatsForUser(uid);
    const next = {
      userId: uid,
      x1Wins: cur.x1Wins + (delta.x1W || 0),
      x1Losses: cur.x1Losses + (delta.x1L || 0),
      x1Draws: cur.x1Draws + (delta.x1D || 0),
      coopMatches: cur.coopMatches + (delta.cM || 0),
      coopWins: cur.coopWins + (delta.cW || 0),
      lastMatchAt: nowIso,
      updatedAt: nowIso,
    };
    await db
      .insert(playerCompetitiveStats)
      .values(next)
      .onConflictDoUpdate({
        target: playerCompetitiveStats.userId,
        set: {
          x1Wins: next.x1Wins,
          x1Losses: next.x1Losses,
          x1Draws: next.x1Draws,
          coopMatches: next.coopMatches,
          coopWins: next.coopWins,
          lastMatchAt: nowIso,
          updatedAt: nowIso,
        },
      });
  };

  if (room.mode === 'x1') {
    if (!winnerUserId) {
      await Promise.all([
        updateStats(hostPt.userId, { x1D: 1 }),
        updateStats(guestPt.userId, { x1D: 1 }),
      ]);
    } else if (loserUserId) {
      await Promise.all([
        updateStats(winnerUserId, { x1W: 1 }),
        updateStats(loserUserId, { x1L: 1 }),
      ]);
    }
  } else {
    await Promise.all([
      updateStats(hostPt.userId, { cM: 1, cW: winnerUserId === hostPt.userId ? 1 : 0 }),
      updateStats(guestPt.userId, { cM: 1, cW: winnerUserId === guestPt.userId ? 1 : 0 }),
    ]);
  }

  await db.insert(multiplayerEvents).values({
    id: `ev_${generateToken(8)}`,
    roomId: room.id,
    userId: winnerUserId || room.hostUserId,
    eventType: 'room_finished',
    payload: { mode: room.mode, winnerUserId, loserUserId, resultReason },
    createdAt: nowIso,
  });

  room.status = 'finished';
  room.finishedAt = nowMs;
  room.winnerUserId = winnerUserId;
  room.loserUserId = loserUserId;
  room.resultReason = resultReason;
  room.updatedAt = nowIso;

  return { x1Result: x1Res, matchRecord };
}

// --- Room Retrieval + Automatic State Transitions ---

export async function mpGetRoomBundle(
  roomId: string,
  requesterUserId: string
): Promise<RoomBundle | null> {
  const nowMs = Date.now();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const room = db.multiplayerRooms[roomId];
    if (!room) return null;
    if (room.hostUserId !== requesterUserId && room.guestUserId !== requesterUserId) {
      return null;
    }

    if (room.status === 'countdown' && room.startedAt && nowMs >= room.startedAt) {
      room.status = 'in_progress';
      room.updatedAt = new Date(nowMs).toISOString();
      saveLocalDb();
    }

    const participants = db.multiplayerParticipants.filter((p) => p.roomId === roomId);
    const x1Result = db.x1Results.find((r) => r.roomId === roomId) || null;
    const matchRecord = db.multiplayerMatches.find((m) => m.roomId === roomId) || null;
    return { room, participants, x1Result, matchRecord };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const roomRows = await db
    .select()
    .from(multiplayerRooms)
    .where(eq(multiplayerRooms.id, roomId))
    .limit(1);
  const room = roomRows[0];
  if (!room) return null;
  if (room.hostUserId !== requesterUserId && room.guestUserId !== requesterUserId) {
    return null;
  }

  if (room.status === 'countdown' && room.startedAt && nowMs >= room.startedAt) {
    const nowIso = new Date(nowMs).toISOString();
    await db
      .update(multiplayerRooms)
      .set({ status: 'in_progress', updatedAt: nowIso })
      .where(and(eq(multiplayerRooms.id, roomId), eq(multiplayerRooms.status, 'countdown')));
    room.status = 'in_progress';
    room.updatedAt = nowIso;
  }

  const [participants, x1Rows, matchRows] = await Promise.all([
    db.select().from(multiplayerParticipants).where(eq(multiplayerParticipants.roomId, roomId)),
    db.select().from(x1Results).where(eq(x1Results.roomId, roomId)).limit(1),
    db.select().from(multiplayerMatches).where(eq(multiplayerMatches.roomId, roomId)).limit(1),
  ]);

  return {
    room,
    participants,
    x1Result: x1Rows[0] || null,
    matchRecord: matchRows[0] || null,
  };
}

// --- Room Ready / Map / Start ---

export async function mpSetReadyState(params: {
  roomId: string;
  user: StoredUser;
  ready: boolean;
  mapId?: MapId;
}): Promise<{ status: 'ok'; bundle: RoomBundle } | { status: 'not_found' | 'invalid_state' }> {
  const { roomId, user, ready, mapId } = params;
  const nowIso = new Date().toISOString();
  const verifiedSkin: SkinId = (await repoCanUserEquipSkin(user, user.equippedSkin))
    ? user.equippedSkin
    : 'ratao';

  const bundle = await mpGetRoomBundle(roomId, user.id);
  if (!bundle) return { status: 'not_found' };
  const { room } = bundle;
  if (room.status !== 'preparing' && room.status !== 'awaiting_confirmation') {
    return { status: 'invalid_state' };
  }

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const r = db.multiplayerRooms[roomId];
    if (mapId && r.hostUserId === user.id) {
      r.mapId = mapId;
    }
    r.updatedAt = nowIso;
    const pt = db.multiplayerParticipants.find(
      (p) => p.roomId === roomId && p.userId === user.id
    );
    if (pt) {
      pt.ready = ready;
      pt.skinId = verifiedSkin;
      pt.lastHeartbeatAt = Date.now();
      pt.connected = true;
      pt.updatedAt = nowIso;
    }
    saveLocalDb();
    return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  if (mapId && room.hostUserId === user.id) {
    await db
      .update(multiplayerRooms)
      .set({ mapId, updatedAt: nowIso })
      .where(eq(multiplayerRooms.id, roomId));
  }

  await db
    .update(multiplayerParticipants)
    .set({
      ready,
      skinId: verifiedSkin,
      lastHeartbeatAt: Date.now(),
      connected: true,
      updatedAt: nowIso,
    })
    .where(and(eq(multiplayerParticipants.roomId, roomId), eq(multiplayerParticipants.userId, user.id)));

  return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
}

export async function mpStartRoomMatch(params: {
  roomId: string;
  userId: string;
}): Promise<
  | { status: 'ok'; bundle: RoomBundle }
  | { status: 'not_found' | 'not_ready' | 'invalid_state' }
> {
  const { roomId, userId } = params;
  const bundle = await mpGetRoomBundle(roomId, userId);
  if (!bundle) return { status: 'not_found' };
  const { room, participants } = bundle;

  if (room.status === 'countdown' || room.status === 'in_progress') {
    return { status: 'ok', bundle };
  }
  if (room.status !== 'preparing') {
    return { status: 'invalid_state' };
  }
  if (participants.length < 2 || !participants.every((p) => p.ready)) {
    return { status: 'not_ready' };
  }

  const nowMs = Date.now();
  const startedAt = nowMs + COUNTDOWN_DURATION_MS;
  const nowIso = new Date(nowMs).toISOString();
  const seed = generateTrackSeed();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const r = db.multiplayerRooms[roomId];
    r.status = 'countdown';
    r.seed = seed;
    r.countdownStartAt = nowMs;
    r.startedAt = startedAt;
    r.updatedAt = nowIso;
    for (const pt of db.multiplayerParticipants) {
      if (pt.roomId === roomId) {
        pt.alive = true;
        pt.collectedFirstCoin = false;
        pt.posX = 0;
        pt.posY = 0;
        pt.posZ = 0;
        pt.lane = 0;
        pt.distance = 0;
        pt.coins = 0;
        pt.score = 0;
        pt.durationMs = 0;
        pt.noCoinTimeMs = 0;
        pt.collisionCount = 0;
        pt.finishedAt = null;
        pt.lastHeartbeatAt = nowMs;
        pt.connected = true;
      }
    }
    db.multiplayerEvents.push({
      id: `ev_${generateToken(8)}`,
      roomId,
      userId,
      eventType: 'match_countdown_started',
      payload: { seed, startedAt },
      createdAt: nowIso,
    });
    saveLocalDb();
    return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, userId))! };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  await db
    .update(multiplayerRooms)
    .set({
      status: 'countdown',
      seed,
      countdownStartAt: nowMs,
      startedAt,
      updatedAt: nowIso,
    })
    .where(and(eq(multiplayerRooms.id, roomId), eq(multiplayerRooms.status, 'preparing')));

  await db
    .update(multiplayerParticipants)
    .set({
      alive: true,
      collectedFirstCoin: false,
      posX: 0,
      posY: 0,
      posZ: 0,
      lane: 0,
      distance: 0,
      coins: 0,
      score: 0,
      durationMs: 0,
      noCoinTimeMs: 0,
      collisionCount: 0,
      finishedAt: null,
      lastHeartbeatAt: nowMs,
      connected: true,
      updatedAt: nowIso,
    })
    .where(eq(multiplayerParticipants.roomId, roomId));

  await db.insert(multiplayerEvents).values({
    id: `ev_${generateToken(8)}`,
    roomId,
    userId,
    eventType: 'match_countdown_started',
    payload: { seed, startedAt },
    createdAt: nowIso,
  });

  return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, userId))! };
}

// --- Real-Time Telemetry Sync + Server-Authoritative X1 & Co-op Adjudication ---

export async function mpSyncParticipantState(params: {
  roomId: string;
  user: StoredUser;
  input: TelemetrySyncInput;
}): Promise<
  | { status: 'ok'; bundle: RoomBundle; warning?: string }
  | { status: 'not_found' | 'invalid_coin_claim' }
> {
  const { roomId, user, input } = params;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const bundle = await mpGetRoomBundle(roomId, user.id);
  if (!bundle) return { status: 'not_found' };
  const { room, participants } = bundle;

  const me = participants.find((p) => p.userId === user.id);
  const opponent = participants.find((p) => p.userId !== user.id);
  if (!me) return { status: 'not_found' };

  const clampedLane = Math.max(-1, Math.min(1, Math.round(Number(input.lane) || 0)));
  const safeX = Number.isFinite(input.posX) ? Math.max(-4, Math.min(4, input.posX)) : 0;
  const safeY = Number.isFinite(input.posY) ? Math.max(0, Math.min(20, input.posY)) : 0;
  const safeZ = Number.isFinite(input.posZ) ? Math.max(-100000, Math.min(50, input.posZ)) : 0;
  const safeDist = Math.max(0, Math.min(500000, Math.round(Number(input.distance) || 0)));
  const safeCoins = Math.max(0, Math.min(50000, Math.round(Number(input.coins) || 0)));
  const safeScore = Math.max(0, Math.min(10000000, Math.round(Number(input.score) || 0)));
  const safeNoCoin = Math.max(0, Math.min(3600000, Math.round(Number(input.noCoinTimeMs) || 0)));
  const safeDur = Math.max(0, Math.min(3600000, Math.round(Number(input.durationMs) || 0)));
  const safeCollisions = Math.max(0, Math.min(99, Math.round(Number(input.collisionCount) || 0)));
  const animState = sanitizeAnimState(input.animState);

  // Update telemetry if room is countdown or in_progress
  if (room.status === 'countdown' || room.status === 'in_progress') {
    me.posX = safeX;
    me.posY = safeY;
    me.posZ = safeZ;
    me.lane = clampedLane;
    me.animState = animState;
    me.distance = Math.max(me.distance, safeDist);
    me.coins = Math.max(me.coins, safeCoins);
    me.score = Math.max(me.score, safeScore);
    me.noCoinTimeMs = Math.max(me.noCoinTimeMs, safeNoCoin);
    me.durationMs = Math.max(me.durationMs, safeDur);
    me.collisionCount = Math.max(me.collisionCount, safeCollisions);
    me.hoverboard = Boolean(input.hoverboard);
    me.jetpack = Boolean(input.jetpack);
    me.connected = true;
    me.lastHeartbeatAt = nowMs;
    me.updatedAt = nowIso;

    if (typeof input.alive === 'boolean' && !input.alive) {
      me.alive = false;
      if (!me.finishedAt) me.finishedAt = nowMs;
    }

    if (!isNeonConfigured()) {
      saveLocalDb();
    } else {
      const db = getNeonDb();
      await db
        .update(multiplayerParticipants)
        .set({
          posX: me.posX,
          posY: me.posY,
          posZ: me.posZ,
          lane: me.lane,
          animState: me.animState,
          distance: me.distance,
          coins: me.coins,
          score: me.score,
          noCoinTimeMs: me.noCoinTimeMs,
          durationMs: me.durationMs,
          collisionCount: me.collisionCount,
          alive: me.alive,
          finishedAt: me.finishedAt,
          hoverboard: me.hoverboard,
          jetpack: me.jetpack,
          connected: true,
          lastHeartbeatAt: nowMs,
          updatedAt: nowIso,
        })
        .where(eq(multiplayerParticipants.id, me.id));
    }
  }

  // Only process active match events / timers while room is in_progress
  if (room.status !== 'in_progress' || !opponent) {
    return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
  }

  // 1. Check incoming events from this client
  const events = Array.isArray(input.events) ? input.events : [];
  for (const evt of events) {
    if (evt.type === 'coin_collected' && room.mode === 'x1') {
      const coinZ = Number(evt.coinZ);
      const coinLane = Number(evt.coinLane);
      const isValidCoin = verifySeededCoinSpawn(room.seed, coinZ, coinLane);
      if (!isValidCoin) {
        if (!isNeonConfigured()) {
          const db = getLocalDb();
          db.multiplayerEvents.push({
            id: `ev_${generateToken(8)}`,
            roomId,
            userId: user.id,
            eventType: 'invalid_coin_claim',
            payload: { coinZ, coinLane },
            createdAt: nowIso,
          });
          saveLocalDb();
        } else {
          await getNeonDb().insert(multiplayerEvents).values({
            id: `ev_${generateToken(8)}`,
            roomId,
            userId: user.id,
            eventType: 'invalid_coin_claim',
            payload: { coinZ, coinLane },
            createdAt: nowIso,
          });
        }
        return { status: 'invalid_coin_claim' };
      }

      // Valid X1 coin collected! Mark participant and immediately finish X1 (collector LOSES, opponent WINS!)
      me.collectedFirstCoin = true;
      me.coins = Math.max(1, me.coins);
      me.finishedAt = nowMs;

      if (!isNeonConfigured()) {
        saveLocalDb();
      } else {
        await getNeonDb()
          .update(multiplayerParticipants)
          .set({ collectedFirstCoin: true, coins: me.coins, finishedAt: nowMs, updatedAt: nowIso })
          .where(eq(multiplayerParticipants.id, me.id));
      }

      await finalizeRoomInternal({
        room,
        participants,
        winnerUserId: opponent.userId,
        loserUserId: me.userId,
        resultReason: 'first_coin_collected',
        nowMs,
      });

      return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
    }

    if (evt.type === 'crashed') {
      me.alive = false;
      me.animState = 'crash';
      me.finishedAt = me.finishedAt || nowMs;

      if (isNeonConfigured()) {
        await getNeonDb()
          .update(multiplayerParticipants)
          .set({ alive: false, animState: 'crash', finishedAt: me.finishedAt, updatedAt: nowIso })
          .where(eq(multiplayerParticipants.id, me.id));
      } else {
        saveLocalDb();
      }

      if (room.mode === 'x1') {
        if (opponent.alive) {
          await finalizeRoomInternal({
            room,
            participants,
            winnerUserId: opponent.userId,
            loserUserId: me.userId,
            resultReason: 'opponent_crashed',
            nowMs,
          });
        } else {
          await finalizeRoomInternal({
            room,
            participants,
            winnerUserId: null,
            loserUserId: null,
            resultReason: 'both_crashed',
            nowMs,
          });
        }
        return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
      } else {
        // Co-op mode: if BOTH crashed, finish match comparing survival time / distance!
        if (!opponent.alive) {
          let coopWinner: string | null = null;
          let coopLoser: string | null = null;
          if (me.durationMs > opponent.durationMs) {
            coopWinner = me.userId;
            coopLoser = opponent.userId;
          } else if (opponent.durationMs > me.durationMs) {
            coopWinner = opponent.userId;
            coopLoser = me.userId;
          } else if (me.distance !== opponent.distance) {
            coopWinner = me.distance > opponent.distance ? me.userId : opponent.userId;
            coopLoser = coopWinner === me.userId ? opponent.userId : me.userId;
          }
          await finalizeRoomInternal({
            room,
            participants,
            winnerUserId: coopWinner,
            loserUserId: coopLoser,
            resultReason: 'coop_both_finished',
            nowMs,
          });
          return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
        }
      }
    }
  }

  // 2. Check Opponent Disconnect Grace Timeout (12 seconds since last heartbeat while in_progress)
  if (
    room.startedAt &&
    nowMs - room.startedAt > DISCONNECT_GRACE_MS &&
    nowMs - opponent.lastHeartbeatAt > DISCONNECT_GRACE_MS
  ) {
    opponent.connected = false;
    if (isNeonConfigured()) {
      await getNeonDb()
        .update(multiplayerParticipants)
        .set({ connected: false, updatedAt: nowIso })
        .where(eq(multiplayerParticipants.id, opponent.id));
    }

    if (room.mode === 'x1') {
      await finalizeRoomInternal({
        room,
        participants,
        winnerUserId: me.userId,
        loserUserId: opponent.userId,
        resultReason: 'opponent_disconnected',
        nowMs,
      });
      return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
    } else if (!me.alive) {
      await finalizeRoomInternal({
        room,
        participants,
        winnerUserId: me.durationMs >= opponent.durationMs ? me.userId : opponent.userId,
        loserUserId: me.durationMs >= opponent.durationMs ? opponent.userId : me.userId,
        resultReason: 'coop_partner_disconnected',
        nowMs,
      });
      return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
    }
  }

  // 3. Check X1 Maximum Time Limit Draw
  if (room.mode === 'x1' && room.startedAt && nowMs - room.startedAt >= room.maxDurationMs) {
    await finalizeRoomInternal({
      room,
      participants,
      winnerUserId: null,
      loserUserId: null,
      resultReason: 'time_limit_draw',
      nowMs,
    });
  }

  return { status: 'ok', bundle: (await mpGetRoomBundle(roomId, user.id))! };
}

// --- Leave / Forfeit ---

export async function mpLeaveRoom(params: {
  roomId: string;
  userId: string;
}): Promise<{ ok: boolean }> {
  const { roomId, userId } = params;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const bundle = await mpGetRoomBundle(roomId, userId);
  if (!bundle) return { ok: false };
  const { room, participants } = bundle;
  const opponent = participants.find((p) => p.userId !== userId) || null;

  if (room.status === 'finished' || room.status === 'cancelled') {
    return { ok: true };
  }

  if (room.status === 'in_progress' || room.status === 'countdown') {
    if (opponent) {
      await finalizeRoomInternal({
        room,
        participants,
        winnerUserId: opponent.userId,
        loserUserId: userId,
        resultReason: room.mode === 'x1' ? 'opponent_abandoned' : 'coop_partner_left',
        nowMs,
      });
      return { ok: true };
    }
  }

  // Cancel lobby/invite
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.multiplayerRooms[roomId].status = 'cancelled';
    db.multiplayerRooms[roomId].resultReason = 'player_left';
    db.multiplayerRooms[roomId].updatedAt = nowIso;
    for (const inv of db.multiplayerInvites) {
      if (inv.roomId === roomId && inv.status === 'pending') {
        inv.status = 'cancelled';
        inv.respondedAt = nowIso;
      }
    }
    saveLocalDb();
    return { ok: true };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db
    .update(multiplayerRooms)
    .set({ status: 'cancelled', resultReason: 'player_left', updatedAt: nowIso })
    .where(eq(multiplayerRooms.id, roomId));
  await db
    .update(multiplayerInvites)
    .set({ status: 'cancelled', respondedAt: nowIso })
    .where(and(eq(multiplayerInvites.roomId, roomId), eq(multiplayerInvites.status, 'pending')));
  return { ok: true };
}
