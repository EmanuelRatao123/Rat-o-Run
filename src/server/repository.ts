import { and, count, desc, eq, gt, ilike, inArray, or, sql } from 'drizzle-orm';
import { ensureNeonSchema, getNeonDb, isNeonConfigured } from '../db/neon.ts';
import {
  activeMatches,
  adminLogs,
  exclusiveSkinPermissions,
  gameSettings,
  globalMessages,
  matches,
  playerCompetitiveStats,
  pollVotes,
  polls,
  sessions,
  skinGifts,
  users,
  x1Results,
} from '../db/schema.ts';
import {
  ALL_SKIN_IDS,
  AdminLogItem,
  AdminPlayerRecord,
  AdminStats,
  COMMON_SKIN_IDS,
  ExclusiveSkinId,
  GlobalMessage,
  LeaderboardEntry,
  MapId,
  PlayerCompetitiveStats,
  PollItem,
  SKINS,
  SkinGiftItem,
  SkinId,
  X1ResultRecord,
  isCommonSkinId,
  isExclusiveSkinId,
  isValidAnySkinId,
} from '../shared/constants.ts';
import { generateToken, hashPassword } from './crypto.ts';
import {
  ActiveMatchToken,
  StoredMatch,
  StoredPoll,
  StoredUser,
  cleanupExpiredSessions as cleanupLocalExpired,
  ensureAdminFromEnv as ensureLocalAdminFromEnv,
  findUserByNickname as findLocalUserByNickname,
  getDb as getLocalDb,
  hasAdminAccount as hasLocalAdminAccount,
  saveDb as saveLocalDb,
} from './store.ts';

const isValidSkinId = isValidAnySkinId;

function mapNeonUserRow(row: typeof users.$inferSelect): StoredUser {
  return {
    id: row.id,
    nickname: row.nickname,
    nicknameLower: row.nicknameLower,
    passwordHash: row.passwordHash,
    recoveryHash: row.recoveryHash,
    googleUid: row.googleUid ?? undefined,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    equippedSkin: row.equippedSkin,
    unlockedSkins: Array.isArray(row.unlockedSkins) ? row.unlockedSkins : [...ALL_SKIN_IDS],
    giftedSkins: Array.isArray(row.giftedSkins) ? row.giftedSkins : [],
    bestNoCoinTimeMs: row.bestNoCoinTimeMs,
    bestDistance: row.bestDistance,
    bestScore: row.bestScore,
    totalMatches: row.totalMatches,
    totalCoins: row.totalCoins,
    favoriteSkin: row.favoriteSkin,
    skinUsage: row.skinUsage && typeof row.skinUsage === 'object' ? row.skinUsage : {},
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
}

declare global {
  var _rataoLastPruneAt: number | undefined;
  var _rataoNeonAdminChecked: boolean | undefined;
}

export async function ensureDbAndAdminReady(): Promise<void> {
  if (!isNeonConfigured()) {
    await ensureLocalAdminFromEnv();
    return;
  }

  await ensureNeonSchema();

  if (global._rataoNeonAdminChecked) return;
  const envUser = process.env.ADMIN_INITIAL_USERNAME?.trim();
  const envPass = process.env.ADMIN_INITIAL_PASSWORD;
  const db = getNeonDb();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);

  if (existing.length > 0) {
    global._rataoNeonAdminChecked = true;
    return;
  }

  if (!envUser || !envPass) {
    return;
  }

  const id = `adm_${generateToken(8)}`;
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(envPass);

  await db
    .insert(users)
    .values({
      id,
      nickname: envUser,
      nicknameLower: envUser.toLowerCase(),
      passwordHash,
      recoveryHash: null,
      googleUid: null,
      role: 'admin',
      mustChangePassword: true,
      equippedSkin: 'ratao',
      unlockedSkins: [...COMMON_SKIN_IDS],
      giftedSkins: [],
      bestNoCoinTimeMs: 0,
      bestDistance: 0,
      bestScore: 0,
      totalMatches: 0,
      totalCoins: 0,
      favoriteSkin: 'ratao',
      skinUsage: {},
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoNothing();

  global._rataoNeonAdminChecked = true;
}

export async function repoHasAdminAccount(): Promise<boolean> {
  if (!isNeonConfigured()) {
    return hasLocalAdminAccount();
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  return rows.length > 0;
}

export async function repoFindUserByNickname(nickname: string): Promise<StoredUser | undefined> {
  if (!isNeonConfigured()) {
    return findLocalUserByNickname(nickname);
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.nicknameLower, nickname.trim().toLowerCase()))
    .limit(1);
  return rows[0] ? mapNeonUserRow(rows[0]) : undefined;
}

export async function repoFindUserByGoogleUid(uid: string): Promise<StoredUser | undefined> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return Object.values(db.users).find((u) => u.googleUid === uid);
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db.select().from(users).where(eq(users.googleUid, uid)).limit(1);
  return rows[0] ? mapNeonUserRow(rows[0]) : undefined;
}

export async function repoCreateUser(user: StoredUser): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.users[user.id] = user;
    saveLocalDb();
    return;
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(users).values({
    id: user.id,
    nickname: user.nickname,
    nicknameLower: user.nicknameLower,
    passwordHash: user.passwordHash,
    recoveryHash: user.recoveryHash,
    googleUid: user.googleUid ?? null,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    equippedSkin: user.equippedSkin,
    unlockedSkins: user.unlockedSkins,
    giftedSkins: user.giftedSkins,
    bestNoCoinTimeMs: user.bestNoCoinTimeMs,
    bestDistance: user.bestDistance,
    bestScore: user.bestScore,
    totalMatches: user.totalMatches,
    totalCoins: user.totalCoins,
    favoriteSkin: user.favoriteSkin,
    skinUsage: user.skinUsage,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  });
  if (user.role === 'admin') {
    global._rataoNeonAdminChecked = true;
  }
}

export async function repoUpdateUserLastSeen(userId: string, lastSeenAt: string): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    if (db.users[userId]) {
      db.users[userId].lastSeenAt = lastSeenAt;
      saveLocalDb();
    }
    return;
  }
  const db = getNeonDb();
  await db.update(users).set({ lastSeenAt }).where(eq(users.id, userId));
}

export async function repoUpdateUserPassword(
  userId: string,
  passwordHash: string,
  mustChangePassword: boolean
): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const u = db.users[userId];
    if (u) {
      u.passwordHash = passwordHash;
      u.mustChangePassword = mustChangePassword;
      saveLocalDb();
    }
    return;
  }
  const db = getNeonDb();
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword })
    .where(eq(users.id, userId));
}

export async function repoUpdateUserEquippedSkin(userId: string, skinId: SkinId): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const u = db.users[userId];
    if (u) {
      u.equippedSkin = skinId;
      saveLocalDb();
    }
    return;
  }
  const db = getNeonDb();
  await db.update(users).set({ equippedSkin: skinId }).where(eq(users.id, userId));
}

export async function repoCreateSession(
  token: string,
  userId: string,
  expiresAt: number,
  scope: 'player' | 'admin' = 'player'
): Promise<void> {
  const createdAt = Date.now();
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.sessions[token] = { token, userId, scope, createdAt, expiresAt };
    saveLocalDb();
    return;
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(sessions).values({ token, userId, scope, createdAt, expiresAt });
}

export async function repoGetValidSessionUser(
  token: string,
  requiredScope?: 'player' | 'admin'
): Promise<StoredUser | null> {
  const now = Date.now();
  if (!isNeonConfigured()) {
    cleanupLocalExpired();
    const db = getLocalDb();
    const session = db.sessions[token];
    if (!session || session.expiresAt <= now) return null;
    if (requiredScope === 'admin' && session.scope !== 'admin') return null;
    const user = db.users[session.userId];
    if (!user) return null;
    if (requiredScope === 'admin' && user.role !== 'admin') return null;
    user.lastSeenAt = new Date(now).toISOString();
    return user;
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  // Periodic background-free pruning every 5 minutes
  if (!global._rataoLastPruneAt || now - global._rataoLastPruneAt > 5 * 60 * 1000) {
    global._rataoLastPruneAt = now;
    await db.delete(sessions).where(sql`${sessions.expiresAt} < ${now}`);
    await db.delete(activeMatches).where(sql`${activeMatches.startedAt} < ${now - 2 * 60 * 60 * 1000}`);
  }

  const sessRows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1);

  if (sessRows.length === 0) return null;
  if (requiredScope === 'admin' && sessRows[0].scope !== 'admin') return null;

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, sessRows[0].userId))
    .limit(1);

  if (userRows.length === 0) return null;
  if (requiredScope === 'admin' && userRows[0].role !== 'admin') return null;

  const lastSeenAt = new Date(now).toISOString();
  await db.update(users).set({ lastSeenAt }).where(eq(users.id, userRows[0].id));
  const mapped = mapNeonUserRow(userRows[0]);
  mapped.lastSeenAt = lastSeenAt;
  return mapped;
}

export async function repoDeleteSession(token: string): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    delete db.sessions[token];
    saveLocalDb();
    return;
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function repoComputePlayerRank(userId: string): Promise<number | null> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const ranked = Object.values(db.users)
      .filter((u) => u.totalMatches > 0 || u.bestNoCoinTimeMs > 0)
      .sort((a, b) => b.bestNoCoinTimeMs - a.bestNoCoinTimeMs || b.bestDistance - a.bestDistance);
    const idx = ranked.findIndex((u) => u.id === userId);
    return idx >= 0 ? idx + 1 : null;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = userRows[0];
  if (!u || (u.totalMatches <= 0 && u.bestNoCoinTimeMs <= 0)) return null;

  const aheadRes = await db
    .select({ cnt: count() })
    .from(users)
    .where(
      and(
        or(gt(users.totalMatches, 0), gt(users.bestNoCoinTimeMs, 0)),
        or(
          gt(users.bestNoCoinTimeMs, u.bestNoCoinTimeMs),
          and(eq(users.bestNoCoinTimeMs, u.bestNoCoinTimeMs), gt(users.bestDistance, u.bestDistance))
        )
      )
    );

  return Number(aheadRes[0]?.cnt ?? 0) + 1;
}

export async function repoCreateActiveMatch(match: ActiveMatchToken): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.activeMatches[match.matchId] = match;
    saveLocalDb();
    return;
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(activeMatches).values(match);
}

export async function repoGetActiveMatch(matchId: string): Promise<ActiveMatchToken | undefined> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.activeMatches[matchId];
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(activeMatches)
    .where(eq(activeMatches.matchId, matchId))
    .limit(1);
  return rows[0];
}

export async function repoCompleteMatchAndRecord(params: {
  match: StoredMatch;
  user: StoredUser;
}): Promise<{ ok: boolean; isNewPersonalRecord: boolean; globalRank: number | null }> {
  const { match, user } = params;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const active = db.activeMatches[match.id];
    if (!active || active.userId !== user.id || active.completed) {
      return { ok: false, isNewPersonalRecord: false, globalRank: null };
    }
    active.completed = true;
    db.matches.push(match);
    if (db.matches.length > 5000) {
      db.matches.splice(0, db.matches.length - 5000);
    }

    const storedUser = db.users[user.id];
    const isNewPersonalRecord = match.noCoinTimeMs > storedUser.bestNoCoinTimeMs;
    if (isNewPersonalRecord) storedUser.bestNoCoinTimeMs = match.noCoinTimeMs;
    if (match.distance > storedUser.bestDistance) storedUser.bestDistance = match.distance;
    if (match.score > storedUser.bestScore) storedUser.bestScore = match.score;
    storedUser.totalMatches += 1;
    storedUser.totalCoins += match.coins;
    storedUser.skinUsage[match.skinId] = (storedUser.skinUsage[match.skinId] || 0) + 1;

    let topSkin: SkinId = match.skinId;
    let topCount = -1;
    for (const [sk, cnt] of Object.entries(storedUser.skinUsage)) {
      if (cnt > topCount && isValidSkinId(sk)) {
        topCount = cnt;
        topSkin = sk;
      }
    }
    storedUser.favoriteSkin = topSkin;
    storedUser.lastSeenAt = match.createdAt;
    saveLocalDb();

    await repoSyncExclusiveSkinPermissions();
    const globalRank = await repoComputePlayerRank(user.id);
    return { ok: true, isNewPersonalRecord, globalRank };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  // Atomically mark active match completed to prevent replay/double submission
  const claimed = await db
    .update(activeMatches)
    .set({ completed: true })
    .where(
      and(
        eq(activeMatches.matchId, match.id),
        eq(activeMatches.userId, user.id),
        eq(activeMatches.completed, false)
      )
    )
    .returning({ matchId: activeMatches.matchId });

  if (claimed.length === 0) {
    return { ok: false, isNewPersonalRecord: false, globalRank: null };
  }

  await db.insert(matches).values(match);

  const freshRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const freshUser = freshRows[0] ? mapNeonUserRow(freshRows[0]) : user;

  const isNewPersonalRecord = match.noCoinTimeMs > freshUser.bestNoCoinTimeMs;
  const nextBestNoCoin = isNewPersonalRecord ? match.noCoinTimeMs : freshUser.bestNoCoinTimeMs;
  const nextBestDist = Math.max(freshUser.bestDistance, match.distance);
  const nextBestScore = Math.max(freshUser.bestScore, match.score);
  const nextTotalMatches = freshUser.totalMatches + 1;
  const nextTotalCoins = freshUser.totalCoins + match.coins;
  const nextSkinUsage = { ...freshUser.skinUsage };
  nextSkinUsage[match.skinId] = (nextSkinUsage[match.skinId] || 0) + 1;

  let topSkin: SkinId = match.skinId;
  let topCount = -1;
  for (const [sk, cnt] of Object.entries(nextSkinUsage)) {
    if (cnt > topCount && isValidSkinId(sk)) {
      topCount = cnt;
      topSkin = sk;
    }
  }

  await db
    .update(users)
    .set({
      bestNoCoinTimeMs: nextBestNoCoin,
      bestDistance: nextBestDist,
      bestScore: nextBestScore,
      totalMatches: nextTotalMatches,
      totalCoins: nextTotalCoins,
      skinUsage: nextSkinUsage,
      favoriteSkin: topSkin,
      lastSeenAt: match.createdAt,
    })
    .where(eq(users.id, user.id));

  await repoSyncExclusiveSkinPermissions();
  const globalRank = await repoComputePlayerRank(user.id);
  return { ok: true, isNewPersonalRecord, globalRank };
}

export async function repoGetLeaderboard(
  limit: number,
  currentUserId?: string
): Promise<{
  entries: LeaderboardEntry[];
  totalRanked: number;
  currentUserEntry: LeaderboardEntry | null;
}> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const bestMatchByUser = new Map<
      string,
      { mapId: MapId; skinId: SkinId; achievedAt: string; distance: number }
    >();
    for (const m of db.matches) {
      const prev = bestMatchByUser.get(m.userId);
      const user = db.users[m.userId];
      if (user && m.noCoinTimeMs >= user.bestNoCoinTimeMs && (!prev || m.createdAt >= prev.achievedAt)) {
        bestMatchByUser.set(m.userId, {
          mapId: m.mapId,
          skinId: m.skinId,
          achievedAt: m.createdAt,
          distance: m.distance,
        });
      }
    }

    const allEntries: LeaderboardEntry[] = Object.values(db.users)
      .filter((u) => u.totalMatches > 0 || u.bestNoCoinTimeMs > 0)
      .sort((a, b) => b.bestNoCoinTimeMs - a.bestNoCoinTimeMs || b.bestDistance - a.bestDistance)
      .map((u, idx) => {
        const meta = bestMatchByUser.get(u.id);
        return {
          rank: idx + 1,
          userId: u.id,
          nickname: u.nickname,
          skinId: meta?.skinId || u.equippedSkin,
          mapId: meta?.mapId || 'brasil',
          noCoinTimeMs: u.bestNoCoinTimeMs,
          distance: meta?.distance ?? u.bestDistance,
          achievedAt: meta?.achievedAt || u.lastSeenAt,
        };
      });

    const currentUserEntry = currentUserId
      ? allEntries.find((e) => e.userId === currentUserId) || null
      : null;

    return {
      entries: allEntries.slice(0, limit),
      totalRanked: allEntries.length,
      currentUserEntry,
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const rankedFilter = or(gt(users.totalMatches, 0), gt(users.bestNoCoinTimeMs, 0));

  const [totalRes, topUsers] = await Promise.all([
    db.select({ cnt: count() }).from(users).where(rankedFilter),
    db
      .select()
      .from(users)
      .where(rankedFilter)
      .orderBy(desc(users.bestNoCoinTimeMs), desc(users.bestDistance))
      .limit(limit),
  ]);

  const totalRanked = Number(totalRes[0]?.cnt ?? 0);

  const loadBestMeta = async (u: typeof users.$inferSelect) => {
    const bestRuns = await db
      .select()
      .from(matches)
      .where(eq(matches.userId, u.id))
      .orderBy(desc(matches.noCoinTimeMs), desc(matches.createdAt))
      .limit(1);
    const meta = bestRuns[0];
    return {
      skinId: meta?.skinId ?? u.equippedSkin,
      mapId: meta?.mapId ?? ('brasil' as MapId),
      distance: meta?.distance ?? u.bestDistance,
      achievedAt: meta?.createdAt ?? u.lastSeenAt,
    };
  };

  const entries: LeaderboardEntry[] = await Promise.all(
    topUsers.map(async (u, idx) => {
      const meta = await loadBestMeta(u);
      return {
        rank: idx + 1,
        userId: u.id,
        nickname: u.nickname,
        skinId: meta.skinId,
        mapId: meta.mapId,
        noCoinTimeMs: u.bestNoCoinTimeMs,
        distance: meta.distance,
        achievedAt: meta.achievedAt,
      };
    })
  );

  let currentUserEntry: LeaderboardEntry | null = null;
  if (currentUserId) {
    const inTop = entries.find((e) => e.userId === currentUserId);
    if (inTop) {
      currentUserEntry = inTop;
    } else {
      const curRows = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
      const cu = curRows[0];
      if (cu && (cu.totalMatches > 0 || cu.bestNoCoinTimeMs > 0)) {
        const [rank, meta] = await Promise.all([
          repoComputePlayerRank(cu.id),
          loadBestMeta(cu),
        ]);
        if (rank !== null) {
          currentUserEntry = {
            rank,
            userId: cu.id,
            nickname: cu.nickname,
            skinId: meta.skinId,
            mapId: meta.mapId,
            noCoinTimeMs: cu.bestNoCoinTimeMs,
            distance: meta.distance,
            achievedAt: meta.achievedAt,
          };
        }
      }
    }
  }

  return { entries, totalRanked, currentUserEntry };
}

function buildPollItemFromLists(
  poll: StoredPoll,
  votesForPoll: { userId: string; optionIndex: number }[],
  currentUserId?: string
): PollItem {
  const now = Date.now();
  const expired = new Date(poll.expiresAt).getTime() <= now;
  const effectiveActive = poll.active && !expired;
  const totalVotes = votesForPoll.length;
  const counts = poll.options.map(
    (_, idx) => votesForPoll.filter((v) => v.optionIndex === idx).length
  );
  const userVote = currentUserId
    ? votesForPoll.find((v) => v.userId === currentUserId)
    : undefined;

  return {
    id: poll.id,
    title: poll.title,
    options: poll.options.map((label, idx) => ({
      index: idx,
      label,
      votes: counts[idx],
      percentage: totalVotes > 0 ? Math.round((counts[idx] / totalVotes) * 100) : 0,
    })),
    totalVotes,
    active: effectiveActive,
    durationMinutes: poll.durationMinutes,
    createdAt: poll.createdAt,
    expiresAt: poll.expiresAt,
    userVotedIndex: userVote ? userVote.optionIndex : null,
  };
}

export async function repoGetSocialFeed(currentUserId?: string): Promise<{
  messages: GlobalMessage[];
  polls: PollItem[];
  unseenGifts: SkinGiftItem[];
  featuredMap: MapId;
}> {
  const now = Date.now();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const activeMessages = db.messages
      .filter((m) => m.active && new Date(m.expiresAt).getTime() > now)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pollItems = db.polls
      .map((p) =>
        buildPollItemFromLists(
          p,
          db.votes.filter((v) => v.pollId === p.id),
          currentUserId
        )
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    const unseenGifts = currentUserId
      ? db.gifts.filter((g) => g.targetUserId === currentUserId && !g.seen)
      : [];

    return {
      messages: activeMessages,
      polls: pollItems,
      unseenGifts,
      featuredMap: db.settings.featuredMap,
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const [msgRows, pollRows, voteRows, giftRows, settingsRows] = await Promise.all([
    db.select().from(globalMessages).where(eq(globalMessages.active, true)).orderBy(desc(globalMessages.createdAt)),
    db.select().from(polls).orderBy(desc(polls.createdAt)).limit(20),
    db.select().from(pollVotes),
    currentUserId
      ? db
          .select()
          .from(skinGifts)
          .where(and(eq(skinGifts.targetUserId, currentUserId), eq(skinGifts.seen, false)))
      : Promise.resolve([]),
    db.select().from(gameSettings).where(eq(gameSettings.id, 'default')).limit(1),
  ]);

  const activeMessages = msgRows.filter((m) => new Date(m.expiresAt).getTime() > now);
  const votesByPoll = new Map<string, { userId: string; optionIndex: number }[]>();
  for (const v of voteRows) {
    const list = votesByPoll.get(v.pollId);
    if (list) list.push(v);
    else votesByPoll.set(v.pollId, [v]);
  }

  const pollItems = pollRows.map((p) =>
    buildPollItemFromLists(p, votesByPoll.get(p.id) || [], currentUserId)
  );

  return {
    messages: activeMessages,
    polls: pollItems,
    unseenGifts: giftRows,
    featuredMap: settingsRows[0]?.featuredMap ?? 'brasil',
  };
}

export async function repoMarkGiftsSeen(userId: string): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    let changed = false;
    for (const g of db.gifts) {
      if (g.targetUserId === userId && !g.seen) {
        g.seen = true;
        changed = true;
      }
    }
    if (changed) saveLocalDb();
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db
    .update(skinGifts)
    .set({ seen: true })
    .where(and(eq(skinGifts.targetUserId, userId), eq(skinGifts.seen, false)));
}

export async function repoVoteOnPoll(
  pollId: string,
  userId: string,
  optionIndex: number
): Promise<
  | { status: 'ok'; poll: PollItem }
  | { status: 'not_found' | 'closed' | 'invalid_option' | 'already_voted' }
> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const poll = db.polls.find((p) => p.id === pollId);
    if (!poll) return { status: 'not_found' };
    if (!poll.active || new Date(poll.expiresAt).getTime() <= Date.now()) {
      return { status: 'closed' };
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
      return { status: 'invalid_option' };
    }
    const existingVote = db.votes.find((v) => v.pollId === pollId && v.userId === userId);
    if (existingVote) return { status: 'already_voted' };

    db.votes.push({
      id: `v_${generateToken(8)}`,
      pollId,
      userId,
      optionIndex,
      createdAt: new Date().toISOString(),
    });
    saveLocalDb();

    return {
      status: 'ok',
      poll: buildPollItemFromLists(
        poll,
        db.votes.filter((v) => v.pollId === pollId),
        userId
      ),
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const pollRows = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
  const poll = pollRows[0];
  if (!poll) return { status: 'not_found' };
  if (!poll.active || new Date(poll.expiresAt).getTime() <= Date.now()) {
    return { status: 'closed' };
  }
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
    return { status: 'invalid_option' };
  }

  const inserted = await db
    .insert(pollVotes)
    .values({
      id: `v_${generateToken(8)}`,
      pollId,
      userId,
      optionIndex,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ id: pollVotes.id });

  if (inserted.length === 0) {
    return { status: 'already_voted' };
  }

  const allVotes = await db.select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
  return {
    status: 'ok',
    poll: buildPollItemFromLists(poll, allVotes, userId),
  };
}

// --- Admin Repository Methods ---

async function addLocalAdminLog(adminNickname: string, action: string, details: string): Promise<void> {
  const db = getLocalDb();
  db.adminLogs.unshift({
    id: `log_${generateToken(6)}`,
    adminNickname,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
  if (db.adminLogs.length > 200) db.adminLogs.length = 200;
}

async function addNeonAdminLog(adminNickname: string, action: string, details: string): Promise<void> {
  const db = getNeonDb();
  await db.insert(adminLogs).values({
    id: `log_${generateToken(6)}`,
    adminNickname,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}

export async function repoGetAdminDashboardData(): Promise<{
  stats: AdminStats;
  messages: GlobalMessage[];
  polls: PollItem[];
  gifts: SkinGiftItem[];
  logs: AdminLogItem[];
}> {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const usersList = Object.values(db.users);
    const onlineRecently = usersList.filter(
      (u) => new Date(u.lastSeenAt).getTime() >= fiveMinAgo
    ).length;

    const globalSkinCounts: Record<string, number> = {};
    for (const u of usersList) {
      for (const [sk, cnt] of Object.entries(u.skinUsage)) {
        globalSkinCounts[sk] = (globalSkinCounts[sk] || 0) + cnt;
      }
      globalSkinCounts[u.equippedSkin] = (globalSkinCounts[u.equippedSkin] || 0) + 1;
    }

    let mostUsedSkin: SkinId = 'ratao';
    let bestCount = -1;
    for (const [sk, cnt] of Object.entries(globalSkinCounts)) {
      if (cnt > bestCount && isValidSkinId(sk)) {
        bestCount = cnt;
        mostUsedSkin = sk;
      }
    }

    let highestRecordMs = 0;
    let highestHolder = '-';
    for (const u of usersList) {
      if (u.bestNoCoinTimeMs > highestRecordMs) {
        highestRecordMs = u.bestNoCoinTimeMs;
        highestHolder = u.nickname;
      }
    }

    const stats: AdminStats = {
      totalUsers: usersList.filter((u) => u.role !== 'admin').length,
      onlineRecently,
      totalMatches: db.matches.length,
      mostUsedSkin,
      highestGlobalRecordMs: highestRecordMs,
      highestRecordHolder: highestHolder,
      publishedMessagesCount: db.messages.length,
      pollsCount: db.polls.length,
      giftsSentCount: db.gifts.length,
    };

    return {
      stats,
      messages: [...db.messages].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      polls: db.polls
        .map((p) =>
          buildPollItemFromLists(
            p,
            db.votes.filter((v) => v.pollId === p.id)
          )
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      gifts: [...db.gifts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      logs: db.adminLogs,
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const [userRows, matchCountRes, msgRows, pollRows, voteRows, giftRows, logRows] =
    await Promise.all([
      db.select().from(users),
      db.select({ cnt: count() }).from(matches),
      db.select().from(globalMessages).orderBy(desc(globalMessages.createdAt)),
      db.select().from(polls).orderBy(desc(polls.createdAt)),
      db.select().from(pollVotes),
      db.select().from(skinGifts).orderBy(desc(skinGifts.createdAt)),
      db.select().from(adminLogs).orderBy(desc(adminLogs.createdAt)).limit(200),
    ]);

  const usersList = userRows.map(mapNeonUserRow);
  const onlineRecently = usersList.filter(
    (u) => new Date(u.lastSeenAt).getTime() >= fiveMinAgo
  ).length;

  const globalSkinCounts: Record<string, number> = {};
  for (const u of usersList) {
    for (const [sk, cnt] of Object.entries(u.skinUsage)) {
      globalSkinCounts[sk] = (globalSkinCounts[sk] || 0) + cnt;
    }
    globalSkinCounts[u.equippedSkin] = (globalSkinCounts[u.equippedSkin] || 0) + 1;
  }

  let mostUsedSkin: SkinId = 'ratao';
  let bestCount = -1;
  for (const [sk, cnt] of Object.entries(globalSkinCounts)) {
    if (cnt > bestCount && isValidSkinId(sk)) {
      bestCount = cnt;
      mostUsedSkin = sk;
    }
  }

  let highestRecordMs = 0;
  let highestHolder = '-';
  for (const u of usersList) {
    if (u.bestNoCoinTimeMs > highestRecordMs) {
      highestRecordMs = u.bestNoCoinTimeMs;
      highestHolder = u.nickname;
    }
  }

  const votesByPoll = new Map<string, { userId: string; optionIndex: number }[]>();
  for (const v of voteRows) {
    const list = votesByPoll.get(v.pollId);
    if (list) list.push(v);
    else votesByPoll.set(v.pollId, [v]);
  }

  const stats: AdminStats = {
    totalUsers: usersList.filter((u) => u.role !== 'admin').length,
    onlineRecently,
    totalMatches: Number(matchCountRes[0]?.cnt ?? 0),
    mostUsedSkin,
    highestGlobalRecordMs: highestRecordMs,
    highestRecordHolder: highestHolder,
    publishedMessagesCount: msgRows.length,
    pollsCount: pollRows.length,
    giftsSentCount: giftRows.length,
  };

  return {
    stats,
    messages: msgRows,
    polls: pollRows.map((p) => buildPollItemFromLists(p, votesByPoll.get(p.id) || [])),
    gifts: giftRows,
    logs: logRows,
  };
}

export async function repoCreateGlobalMessage(
  adminNickname: string,
  msg: GlobalMessage
): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.messages.unshift(msg);
    await addLocalAdminLog(
      adminNickname,
      'MENSAGEM_GLOBAL',
      `Publicou "${msg.title}" (${msg.durationMinutes} min)`
    );
    saveLocalDb();
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(globalMessages).values(msg);
  await addNeonAdminLog(
    adminNickname,
    'MENSAGEM_GLOBAL',
    `Publicou "${msg.title}" (${msg.durationMinutes} min)`
  );
}

export async function repoDeleteGlobalMessage(
  adminNickname: string,
  id: string
): Promise<boolean> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const idx = db.messages.findIndex((m) => m.id === id);
    if (idx < 0) return false;
    const [removed] = db.messages.splice(idx, 1);
    await addLocalAdminLog(adminNickname, 'EXCLUIR_MENSAGEM', `Removeu "${removed.title}"`);
    saveLocalDb();
    return true;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const deleted = await db
    .delete(globalMessages)
    .where(eq(globalMessages.id, id))
    .returning({ title: globalMessages.title });
  if (deleted.length === 0) return false;
  await addNeonAdminLog(adminNickname, 'EXCLUIR_MENSAGEM', `Removeu "${deleted[0].title}"`);
  return true;
}

export async function repoCreateGlobalPoll(
  adminNickname: string,
  poll: StoredPoll
): Promise<PollItem> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.polls.unshift(poll);
    await addLocalAdminLog(
      adminNickname,
      'CRIAR_VOTACAO',
      `Criou votação "${poll.title}" (${poll.durationMinutes} min)`
    );
    saveLocalDb();
    return buildPollItemFromLists(poll, []);
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(polls).values(poll);
  await addNeonAdminLog(
    adminNickname,
    'CRIAR_VOTACAO',
    `Criou votação "${poll.title}" (${poll.durationMinutes} min)`
  );
  return buildPollItemFromLists(poll, []);
}

export async function repoCloseGlobalPoll(
  adminNickname: string,
  id: string
): Promise<PollItem | null> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const poll = db.polls.find((p) => p.id === id);
    if (!poll) return null;
    poll.active = false;
    await addLocalAdminLog(adminNickname, 'ENCERRAR_VOTACAO', `Encerrou "${poll.title}"`);
    saveLocalDb();
    return buildPollItemFromLists(
      poll,
      db.votes.filter((v) => v.pollId === id)
    );
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const updated = await db
    .update(polls)
    .set({ active: false })
    .where(eq(polls.id, id))
    .returning();
  if (updated.length === 0) return null;
  await addNeonAdminLog(adminNickname, 'ENCERRAR_VOTACAO', `Encerrou "${updated[0].title}"`);
  const votesForPoll = await db.select().from(pollVotes).where(eq(pollVotes.pollId, id));
  return buildPollItemFromLists(updated[0], votesForPoll);
}

export async function repoGiftSkinToPlayer(params: {
  adminNickname: string;
  targetNickname: string;
  skinId: SkinId;
}): Promise<
  | { status: 'ok'; gift: SkinGiftItem }
  | { status: 'not_found' }
  | { status: 'duplicate'; targetNickname: string; skinName: string }
> {
  const { adminNickname, targetNickname, skinId } = params;
  if (!isCommonSkinId(skinId)) {
    return { status: 'not_found' };
  }
  const target = await repoFindUserByNickname(targetNickname);
  if (!target) {
    return { status: 'not_found' };
  }

  if (target.giftedSkins.includes(skinId)) {
    return {
      status: 'duplicate',
      targetNickname: target.nickname,
      skinName: SKINS.find((s) => s.id === skinId)?.name || skinId,
    };
  }

  const nextGifted = [...target.giftedSkins, skinId];
  const nextUnlocked = target.unlockedSkins.includes(skinId)
    ? target.unlockedSkins
    : [...target.unlockedSkins, skinId];

  const gift: SkinGiftItem = {
    id: `gift_${generateToken(8)}`,
    targetUserId: target.id,
    targetNickname: target.nickname,
    skinId,
    grantedBy: adminNickname,
    createdAt: new Date().toISOString(),
    seen: false,
  };

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const u = db.users[target.id];
    if (u) {
      u.giftedSkins = nextGifted;
      u.unlockedSkins = nextUnlocked;
    }
    db.gifts.unshift(gift);
    await addLocalAdminLog(
      adminNickname,
      'PRESENTEAR_SKIN',
      `Presenteou "${skinId}" para ${target.nickname}`
    );
    saveLocalDb();
    return { status: 'ok', gift };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db
    .update(users)
    .set({
      giftedSkins: nextGifted,
      unlockedSkins: nextUnlocked,
    })
    .where(eq(users.id, target.id));

  await db.insert(skinGifts).values(gift);
  await addNeonAdminLog(
    adminNickname,
    'PRESENTEAR_SKIN',
    `Presenteou "${skinId}" para ${target.nickname}`
  );
  return { status: 'ok', gift };
}

export async function repoFindAdminAccount(): Promise<StoredUser | undefined> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return Object.values(db.users).find((u) => u.role === 'admin');
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  return rows[0] ? mapNeonUserRow(rows[0]) : undefined;
}

export async function repoRecordAdminLog(
  adminNickname: string,
  action: string,
  details: string
): Promise<void> {
  if (!isNeonConfigured()) {
    await addLocalAdminLog(adminNickname, action, details);
    saveLocalDb();
    return;
  }
  await ensureNeonSchema();
  await addNeonAdminLog(adminNickname, action, details);
}

export async function repoSearchPlayersForAdmin(query: string): Promise<AdminPlayerRecord[]> {
  const clean = query.trim().toLowerCase();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const matched = Object.values(db.users)
      .filter((u) => !clean || u.nicknameLower.includes(clean))
      .sort((a, b) => b.bestNoCoinTimeMs - a.bestNoCoinTimeMs || b.totalMatches - a.totalMatches)
      .slice(0, 25);

    return matched.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      role: u.role,
      equippedSkin: u.equippedSkin,
      unlockedSkins: u.unlockedSkins,
      giftedSkins: u.giftedSkins,
      bestNoCoinTimeMs: u.bestNoCoinTimeMs,
      bestDistance: u.bestDistance,
      bestScore: u.bestScore,
      totalMatches: u.totalMatches,
      totalCoins: u.totalCoins,
      favoriteSkin: u.favoriteSkin,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      giftsHistory: db.gifts.filter((g) => g.targetUserId === u.id),
    }));
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  let matchedRows: (typeof users.$inferSelect)[];
  if (clean) {
    const escaped = clean.replace(/[\\%_]/g, '\\$&');
    matchedRows = await db
      .select()
      .from(users)
      .where(ilike(users.nicknameLower, `%${escaped}%`))
      .orderBy(desc(users.bestNoCoinTimeMs), desc(users.totalMatches))
      .limit(25);
  } else {
    matchedRows = await db
      .select()
      .from(users)
      .orderBy(desc(users.bestNoCoinTimeMs), desc(users.totalMatches))
      .limit(25);
  }

  const allGifts = await db.select().from(skinGifts).orderBy(desc(skinGifts.createdAt));
  const giftsByUser = new Map<string, SkinGiftItem[]>();
  for (const g of allGifts) {
    const list = giftsByUser.get(g.targetUserId);
    if (list) list.push(g);
    else giftsByUser.set(g.targetUserId, [g]);
  }

  return matchedRows.map((row) => {
    const u = mapNeonUserRow(row);
    return {
      id: u.id,
      nickname: u.nickname,
      role: u.role,
      equippedSkin: u.equippedSkin,
      unlockedSkins: u.unlockedSkins,
      giftedSkins: u.giftedSkins,
      bestNoCoinTimeMs: u.bestNoCoinTimeMs,
      bestDistance: u.bestDistance,
      bestScore: u.bestScore,
      totalMatches: u.totalMatches,
      totalCoins: u.totalCoins,
      favoriteSkin: u.favoriteSkin,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      giftsHistory: giftsByUser.get(u.id) || [],
    };
  });
}

// --- Exclusive Skin Permissions & Competitive Stats Engine ---

const RANK_SKIN_MAP: { rank: 1 | 2 | 3; skinId: ExclusiveSkinId; reason: 'top1' | 'top2' | 'top3' }[] = [
  { rank: 1, skinId: 'lenda_suprema', reason: 'top1' },
  { rank: 2, skinId: 'campeao_prata', reason: 'top2' },
  { rank: 3, skinId: 'guerreiro_bronze', reason: 'top3' },
];

export async function repoSyncExclusiveSkinPermissions(): Promise<void> {
  const now = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const ranked = Object.values(db.users)
      .filter((u) => u.totalMatches > 0 || u.bestNoCoinTimeMs > 0)
      .sort((a, b) => b.bestNoCoinTimeMs - a.bestNoCoinTimeMs || b.bestDistance - a.bestDistance)
      .slice(0, 3);

    const desiredByUser = new Map<string, Set<ExclusiveSkinId>>();

    // Admin strictly gets ratao_rei
    for (const u of Object.values(db.users)) {
      if (u.role === 'admin') {
        const set = desiredByUser.get(u.id) || new Set<ExclusiveSkinId>();
        set.add('ratao_rei');
        desiredByUser.set(u.id, set);
      }
    }

    // Top 1 / Top 2 / Top 3 get their corresponding exclusive skins
    RANK_SKIN_MAP.forEach((slot, idx) => {
      const holder = ranked[idx];
      if (!holder) return;
      const set = desiredByUser.get(holder.id) || new Set<ExclusiveSkinId>();
      set.add(slot.skinId);
      desiredByUser.set(holder.id, set);
    });

    // Revoke stale active permissions
    let changed = false;
    for (const perm of db.exclusiveSkinPermissions) {
      if (!perm.active) continue;
      const desired = desiredByUser.get(perm.userId);
      if (!desired || !desired.has(perm.skinId)) {
        perm.active = false;
        perm.revokedAt = now;
        perm.updatedAt = now;
        changed = true;
      }
    }

    // Grant missing desired permissions
    for (const [uid, skins] of desiredByUser.entries()) {
      for (const skinId of skins) {
        const already = db.exclusiveSkinPermissions.find(
          (p) => p.userId === uid && p.skinId === skinId && p.active
        );
        if (!already) {
          const rankSlot = RANK_SKIN_MAP.find((r) => r.skinId === skinId);
          db.exclusiveSkinPermissions.push({
            id: `eperm_${generateToken(8)}`,
            userId: uid,
            skinId,
            reason: rankSlot ? rankSlot.reason : 'admin',
            rankPosition: rankSlot ? rankSlot.rank : null,
            active: true,
            grantedAt: now,
            revokedAt: null,
            updatedAt: now,
          });
          changed = true;
        }
      }
    }

    // Revert equipped skin if a user currently has an exclusive skin they no longer have permission for
    for (const u of Object.values(db.users)) {
      if (isExclusiveSkinId(u.equippedSkin)) {
        const allowed = desiredByUser.get(u.id);
        if (!allowed || !allowed.has(u.equippedSkin)) {
          u.equippedSkin = 'ratao';
          changed = true;
        }
      }
    }

    if (changed) saveLocalDb();
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const rankedFilter = or(gt(users.totalMatches, 0), gt(users.bestNoCoinTimeMs, 0));
  const [topUsers, adminUsers, activePerms] = await Promise.all([
    db
      .select()
      .from(users)
      .where(rankedFilter)
      .orderBy(desc(users.bestNoCoinTimeMs), desc(users.bestDistance))
      .limit(3),
    db.select().from(users).where(eq(users.role, 'admin')),
    db
      .select()
      .from(exclusiveSkinPermissions)
      .where(eq(exclusiveSkinPermissions.active, true)),
  ]);

  const desiredByUser = new Map<string, Set<ExclusiveSkinId>>();
  for (const adm of adminUsers) {
    const set = desiredByUser.get(adm.id) || new Set<ExclusiveSkinId>();
    set.add('ratao_rei');
    desiredByUser.set(adm.id, set);
  }
  RANK_SKIN_MAP.forEach((slot, idx) => {
    const holder = topUsers[idx];
    if (!holder) return;
    const set = desiredByUser.get(holder.id) || new Set<ExclusiveSkinId>();
    set.add(slot.skinId);
    desiredByUser.set(holder.id, set);
  });

  const revokeIds: string[] = [];
  for (const perm of activePerms) {
    const desired = desiredByUser.get(perm.userId);
    if (!desired || !desired.has(perm.skinId)) {
      revokeIds.push(perm.id);
    }
  }
  if (revokeIds.length > 0) {
    await db
      .update(exclusiveSkinPermissions)
      .set({ active: false, revokedAt: now, updatedAt: now })
      .where(inArray(exclusiveSkinPermissions.id, revokeIds));
  }

  for (const [uid, skins] of desiredByUser.entries()) {
    for (const skinId of skins) {
      const exists = activePerms.some((p) => p.userId === uid && p.skinId === skinId);
      if (!exists) {
        const rankSlot = RANK_SKIN_MAP.find((r) => r.skinId === skinId);
        await db.insert(exclusiveSkinPermissions).values({
          id: `eperm_${generateToken(8)}`,
          userId: uid,
          skinId,
          reason: rankSlot ? rankSlot.reason : 'admin',
          rankPosition: rankSlot ? rankSlot.rank : null,
          active: true,
          grantedAt: now,
          revokedAt: null,
          updatedAt: now,
        });
      }
    }
  }

  // Revert any displaced user who currently has an exclusive skin equipped without active permission
  const exclusiveHolders = await db
    .select()
    .from(users)
    .where(inArray(users.equippedSkin, ['ratao_rei', 'lenda_suprema', 'campeao_prata', 'guerreiro_bronze']));
  for (const u of exclusiveHolders) {
    const allowed = desiredByUser.get(u.id);
    if (!allowed || !allowed.has(u.equippedSkin as ExclusiveSkinId)) {
      await db.update(users).set({ equippedSkin: 'ratao' }).where(eq(users.id, u.id));
    }
  }
}

export async function repoGetAllowedExclusiveSkinsForUser(user: StoredUser): Promise<SkinId[]> {
  await repoSyncExclusiveSkinPermissions();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const freshUser = db.users[user.id] || user;
    user.equippedSkin = freshUser.equippedSkin;
    const perms = db.exclusiveSkinPermissions
      .filter((p) => p.userId === user.id && p.active)
      .map((p) => p.skinId);
    const set = new Set<SkinId>(perms);
    if (freshUser.role === 'admin') set.add('ratao_rei');
    else set.delete('ratao_rei');
    return Array.from(set);
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const [freshRows, perms] = await Promise.all([
    db.select().from(users).where(eq(users.id, user.id)).limit(1),
    db
      .select()
      .from(exclusiveSkinPermissions)
      .where(and(eq(exclusiveSkinPermissions.userId, user.id), eq(exclusiveSkinPermissions.active, true))),
  ]);
  if (freshRows[0]) {
    user.equippedSkin = freshRows[0].equippedSkin;
  }
  const set = new Set<SkinId>(perms.map((p) => p.skinId));
  if (user.role === 'admin') set.add('ratao_rei');
  else set.delete('ratao_rei');
  return Array.from(set);
}

export async function repoCanUserEquipSkin(user: StoredUser, skinId: SkinId): Promise<boolean> {
  if (isCommonSkinId(skinId)) return true;
  if (skinId === 'ratao_rei' && user.role !== 'admin') return false;
  const allowed = await repoGetAllowedExclusiveSkinsForUser(user);
  return allowed.includes(skinId);
}

export async function repoGetCompetitiveStatsForUser(userId: string): Promise<PlayerCompetitiveStats> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const row = db.playerCompetitiveStats[userId];
    return (
      row || {
        userId,
        x1Wins: 0,
        x1Losses: 0,
        x1Draws: 0,
        coopMatches: 0,
        coopWins: 0,
        lastMatchAt: null,
      }
    );
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(playerCompetitiveStats)
    .where(eq(playerCompetitiveStats.userId, userId))
    .limit(1);
  if (!rows[0]) {
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
  return {
    userId: rows[0].userId,
    x1Wins: rows[0].x1Wins,
    x1Losses: rows[0].x1Losses,
    x1Draws: rows[0].x1Draws,
    coopMatches: rows[0].coopMatches,
    coopWins: rows[0].coopWins,
    lastMatchAt: rows[0].lastMatchAt,
  };
}

export async function repoGetRecentX1ResultsForUser(
  userId: string,
  limitCount = 10
): Promise<X1ResultRecord[]> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.x1Results
      .filter((r) => r.winnerUserId === userId || r.loserUserId === userId)
      .slice(0, limitCount);
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(x1Results)
    .where(or(eq(x1Results.winnerUserId, userId), eq(x1Results.loserUserId, userId)))
    .orderBy(desc(x1Results.createdAt))
    .limit(limitCount);
  return rows;
}

