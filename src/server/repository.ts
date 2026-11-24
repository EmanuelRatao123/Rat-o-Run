import { and, count, desc, eq, gt, ilike, inArray, or, sql } from 'drizzle-orm';
import { ensureNeonSchema, getNeonDb, getNeonPool, isNeonConfigured } from '../db/neon.ts';
import {
  activeMatches,
  adminLogs,
  coinLedgerEvents,
  exclusiveSkinPermissions,
  gameSettings,
  globalMessages,
  matches,
  playerCompetitiveStats,
  playerWalletStats,
  pollVotes,
  polls,
  sessions,
  skinGifts,
  skinGrantHistory,
  users,
  x1Results,
} from '../db/schema.ts';
import {
  ALL_SKINS,
  AdminExclusiveSkinOwner,
  AdminLogItem,
  AdminPlayerRecord,
  AdminPlayerSkinsSummary,
  AdminStats,
  BULK_GRANTABLE_ALL_SKIN_IDS,
  BULK_GRANTABLE_RESTRICTED_SKIN_IDS,
  COMMON_SKIN_IDS,
  CoinsLeaderboardEntry,
  EXCLUSIVE_SKIN_IDS,
  ExclusiveSkinId,
  ExclusiveSkinPermissionRecord,
  GlobalMessage,
  LOCKED_EXCLUSIVE_SKIN_IDS,
  LeaderboardEntry,
  LockedExclusiveSkinId,
  MapId,
  PlayerCompetitiveStats,
  PlayerWalletStats,
  PollItem,
  SKINS,
  SkinGiftItem,
  SkinGrantHistoryRecord,
  SkinId,
  SoloGameMode,
  SpecialUnlockableSkinId,
  X1ResultRecord,
  isCommonSkinId,
  isExclusiveSkinId,
  isGiftableSkinId,
  isLockedExclusiveSkinId,
  isSpecialUnlockableSkinId,
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
    unlockedSkins: Array.isArray(row.unlockedSkins) ? row.unlockedSkins : [...COMMON_SKIN_IDS],
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

export async function repoFindUserById(userId: string): Promise<StoredUser | undefined> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.users[userId];
  }
  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
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
      .filter((u) => u.bestNoCoinTimeMs > 0)
      .sort((a, b) => b.bestNoCoinTimeMs - a.bestNoCoinTimeMs || b.bestDistance - a.bestDistance);
    const idx = ranked.findIndex((u) => u.id === userId);
    return idx >= 0 ? idx + 1 : null;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = userRows[0];
  if (!u || u.bestNoCoinTimeMs <= 0) return null;

  const aheadRes = await db
    .select({ cnt: count() })
    .from(users)
    .where(
      and(
        gt(users.bestNoCoinTimeMs, 0),
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
  if (!rows[0]) return undefined;
  return {
    ...rows[0],
    mode: rows[0].mode === 'normal' ? 'normal' : 'no_coin',
  };
}

export async function repoCompleteMatchAndRecord(params: {
  match: StoredMatch;
  user: StoredUser;
}): Promise<{ ok: boolean; isNewPersonalRecord: boolean; globalRank: number | null }> {
  const { match, user } = params;
  const matchMode: SoloGameMode = match.mode === 'normal' ? 'normal' : 'no_coin';
  const effectiveNoCoinMs = matchMode === 'no_coin' ? match.noCoinTimeMs : 0;
  // Coins collected during a No Coin attempt must NEVER increase accumulated wallet coins
  const effectiveCoinsCredit = matchMode === 'normal' ? Math.max(0, Math.round(match.coins)) : 0;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const active = db.activeMatches[match.id];
    if (!active || active.userId !== user.id || active.completed) {
      return { ok: false, isNewPersonalRecord: false, globalRank: null };
    }
    active.completed = true;
    db.matches.push({
      ...match,
      mode: matchMode,
      noCoinTimeMs: effectiveNoCoinMs,
    });
    if (db.matches.length > 5000) {
      db.matches.splice(0, db.matches.length - 5000);
    }

    const storedUser = db.users[user.id];
    const isNewPersonalRecord =
      matchMode === 'no_coin' && effectiveNoCoinMs > storedUser.bestNoCoinTimeMs;
    if (isNewPersonalRecord) storedUser.bestNoCoinTimeMs = effectiveNoCoinMs;
    if (match.distance > storedUser.bestDistance) storedUser.bestDistance = match.distance;
    if (match.score > storedUser.bestScore) storedUser.bestScore = match.score;
    storedUser.totalMatches += 1;
    if (effectiveCoinsCredit > 0) {
      storedUser.totalCoins += effectiveCoinsCredit;
    }
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

    if (effectiveCoinsCredit > 0) {
      await repoCreditWalletCoins({
        userId: user.id,
        amount: effectiveCoinsCredit,
        sourceType: 'solo',
        eventKey: `solo:${match.id}`,
        skipUserTotalCoinsUpdate: true,
      });
    }
    saveLocalDb();

    await repoSyncExclusiveSkinPermissions();
    const globalRank = await repoComputePlayerRank(user.id);
    return { ok: true, isNewPersonalRecord, globalRank };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();
  let isNewPersonalRecord = false;

  try {
    await client.query('BEGIN');

    const activeRes = await client.query<{ match_id: string; completed: boolean }>(
      `SELECT match_id, completed FROM active_matches WHERE match_id = $1 AND user_id = $2 FOR UPDATE`,
      [match.id, user.id]
    );
    if (activeRes.rows.length === 0 || activeRes.rows[0].completed) {
      await client.query('ROLLBACK');
      return { ok: false, isNewPersonalRecord: false, globalRank: null };
    }

    await client.query(`UPDATE active_matches SET completed = TRUE WHERE match_id = $1`, [match.id]);

    await client.query(
      `INSERT INTO matches (id, user_id, nickname, mode, skin_id, map_id, no_coin_time_ms, collected_coin, coins, distance, score, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        match.id,
        match.userId,
        match.nickname,
        matchMode,
        match.skinId,
        match.mapId,
        effectiveNoCoinMs,
        match.collectedCoin,
        match.coins,
        match.distance,
        match.score,
        match.durationMs,
        match.createdAt,
      ]
    );

    const uRes = await client.query<{
      best_no_coin_time_ms: number;
      best_distance: number;
      best_score: number;
      total_matches: number;
      total_coins: number;
      skin_usage: Record<string, number>;
    }>(
      `SELECT best_no_coin_time_ms, best_distance, best_score, total_matches, total_coins, skin_usage
       FROM users WHERE id = $1 FOR UPDATE`,
      [user.id]
    );

    const cur = uRes.rows[0];
    const curBestNoCoin = cur?.best_no_coin_time_ms ?? user.bestNoCoinTimeMs;
    isNewPersonalRecord = matchMode === 'no_coin' && effectiveNoCoinMs > curBestNoCoin;
    const nextBestNoCoin = isNewPersonalRecord ? effectiveNoCoinMs : curBestNoCoin;
    const nextBestDist = Math.max(cur?.best_distance ?? user.bestDistance, match.distance);
    const nextBestScore = Math.max(cur?.best_score ?? user.bestScore, match.score);
    const nextTotalMatches = (cur?.total_matches ?? user.totalMatches) + 1;
    const prevTotalCoins = cur?.total_coins ?? user.totalCoins;
    const nextTotalCoins = prevTotalCoins + effectiveCoinsCredit;
    const nextSkinUsage = {
      ...(cur?.skin_usage && typeof cur.skin_usage === 'object' ? cur.skin_usage : user.skinUsage),
    };
    nextSkinUsage[match.skinId] = (nextSkinUsage[match.skinId] || 0) + 1;

    let topSkin: SkinId = match.skinId;
    let topCount = -1;
    for (const [sk, cnt] of Object.entries(nextSkinUsage)) {
      if (cnt > topCount && isValidSkinId(sk)) {
        topCount = cnt;
        topSkin = sk;
      }
    }

    await client.query(
      `UPDATE users
       SET best_no_coin_time_ms = $1,
           best_distance = $2,
           best_score = $3,
           total_matches = $4,
           total_coins = $5,
           skin_usage = $6::jsonb,
           favorite_skin = $7,
           last_seen_at = $8
       WHERE id = $9`,
      [
        nextBestNoCoin,
        nextBestDist,
        nextBestScore,
        nextTotalMatches,
        nextTotalCoins,
        JSON.stringify(nextSkinUsage),
        topSkin,
        match.createdAt,
        user.id,
      ]
    );

    if (effectiveCoinsCredit > 0) {
      const ledgerRes = await client.query(
        `INSERT INTO coin_ledger_events (id, event_key, user_id, source_type, amount, created_at)
         VALUES ($1, $2, $3, 'solo', $4, $5)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING id`,
        [`cl_${generateToken(8)}`, `solo:${match.id}`, user.id, effectiveCoinsCredit, match.createdAt]
      );

      if (ledgerRes.rows.length > 0) {
        const walletRes = await client.query<{
          total_coins_collected: number;
          solo_coins_collected: number;
          multiplayer_coins_collected: number;
          promo_coins_collected: number;
          spent_coins: number;
        }>(
          `SELECT total_coins_collected, solo_coins_collected, multiplayer_coins_collected, promo_coins_collected, spent_coins
           FROM player_wallet_stats WHERE user_id = $1 FOR UPDATE`,
          [user.id]
        );

        const baseTotal = walletRes.rows[0]?.total_coins_collected ?? prevTotalCoins;
        const baseSolo = walletRes.rows[0]?.solo_coins_collected ?? prevTotalCoins;
        const baseMp = walletRes.rows[0]?.multiplayer_coins_collected ?? 0;
        const basePromo = walletRes.rows[0]?.promo_coins_collected ?? 0;
        const baseSpent = walletRes.rows[0]?.spent_coins ?? 0;

        await client.query(
          `INSERT INTO player_wallet_stats (user_id, total_coins_collected, solo_coins_collected, multiplayer_coins_collected, promo_coins_collected, spent_coins, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET
             total_coins_collected = EXCLUDED.total_coins_collected,
             solo_coins_collected = EXCLUDED.solo_coins_collected,
             updated_at = EXCLUDED.updated_at`,
          [
            user.id,
            baseTotal + effectiveCoinsCredit,
            baseSolo + effectiveCoinsCredit,
            baseMp,
            basePromo,
            baseSpent,
            match.createdAt,
          ]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await repoSyncExclusiveSkinPermissions();
  const globalRank = await repoComputePlayerRank(user.id);
  return { ok: true, isNewPersonalRecord, globalRank };
}

export async function repoGetLeaderboard(params: {
  page?: number;
  pageSize?: number;
  currentUserId?: string;
}): Promise<{
  category: 'no_coin';
  entries: LeaderboardEntry[];
  totalRanked: number;
  page: number;
  pageSize: number;
  totalPages: number;
  currentUserEntry: LeaderboardEntry | null;
}> {
  const pageSize = Math.max(1, Math.min(100, Math.floor(params.pageSize ?? 20)));
  const requestedPage = Math.max(1, Math.floor(params.page ?? 1));
  const currentUserId = params.currentUserId;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const bestMatchByUser = new Map<
      string,
      { mapId: MapId; skinId: SkinId; achievedAt: string; distance: number }
    >();
    for (const m of db.matches) {
      if ((m.mode || 'no_coin') !== 'no_coin' && m.noCoinTimeMs <= 0) continue;
      const prev = bestMatchByUser.get(m.userId);
      const user = db.users[m.userId];
      if (
        user &&
        m.noCoinTimeMs > 0 &&
        m.noCoinTimeMs >= user.bestNoCoinTimeMs &&
        (!prev || m.createdAt >= prev.achievedAt)
      ) {
        bestMatchByUser.set(m.userId, {
          mapId: m.mapId,
          skinId: m.skinId,
          achievedAt: m.createdAt,
          distance: m.distance,
        });
      }
    }

    const allEntries: LeaderboardEntry[] = Object.values(db.users)
      .filter((u) => u.bestNoCoinTimeMs > 0)
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

    const totalRanked = allEntries.length;
    const totalPages = Math.max(1, Math.ceil(totalRanked / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startIdx = (safePage - 1) * pageSize;

    const currentUserEntry = currentUserId
      ? allEntries.find((e) => e.userId === currentUserId) || null
      : null;

    return {
      category: 'no_coin',
      entries: allEntries.slice(startIdx, startIdx + pageSize),
      totalRanked,
      page: safePage,
      pageSize,
      totalPages,
      currentUserEntry,
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const rankedFilter = gt(users.bestNoCoinTimeMs, 0);

  const totalRes = await db.select({ cnt: count() }).from(users).where(rankedFilter);
  const totalRanked = Number(totalRes[0]?.cnt ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRanked / pageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * pageSize;

  const topUsers = await db
    .select()
    .from(users)
    .where(rankedFilter)
    .orderBy(desc(users.bestNoCoinTimeMs), desc(users.bestDistance))
    .limit(pageSize)
    .offset(offset);

  const loadBestMeta = async (u: typeof users.$inferSelect) => {
    const bestRuns = await db
      .select()
      .from(matches)
      .where(and(eq(matches.userId, u.id), eq(matches.mode, 'no_coin')))
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
        rank: offset + idx + 1,
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
    const inPage = entries.find((e) => e.userId === currentUserId);
    if (inPage) {
      currentUserEntry = inPage;
    } else {
      const curRows = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
      const cu = curRows[0];
      if (cu && cu.bestNoCoinTimeMs > 0) {
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

  return {
    category: 'no_coin',
    entries,
    totalRanked,
    page: safePage,
    pageSize,
    totalPages,
    currentUserEntry,
  };
}

export async function repoGetCoinsLeaderboard(params: {
  page?: number;
  pageSize?: number;
  currentUserId?: string;
}): Promise<{
  category: 'coins';
  entries: CoinsLeaderboardEntry[];
  totalRanked: number;
  page: number;
  pageSize: number;
  totalPages: number;
  currentUserEntry: CoinsLeaderboardEntry | null;
}> {
  const pageSize = Math.max(1, Math.min(100, Math.floor(params.pageSize ?? 20)));
  const requestedPage = Math.max(1, Math.floor(params.page ?? 1));
  const currentUserId = params.currentUserId;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const rankedUsers = Object.values(db.users)
      .map((u) => {
        const walletTotal = db.playerWalletStats[u.id]?.totalCoinsCollected ?? 0;
        const totalCoinsCollected = Math.max(walletTotal, u.totalCoins);
        return { user: u, totalCoinsCollected };
      })
      .filter((item) => item.totalCoinsCollected > 0)
      .sort(
        (a, b) =>
          b.totalCoinsCollected - a.totalCoinsCollected ||
          b.user.totalMatches - a.user.totalMatches ||
          a.user.createdAt.localeCompare(b.user.createdAt)
      )
      .map((item, idx): CoinsLeaderboardEntry => ({
        rank: idx + 1,
        userId: item.user.id,
        nickname: item.user.nickname,
        skinId: item.user.equippedSkin,
        totalCoinsCollected: item.totalCoinsCollected,
        totalMatches: item.user.totalMatches,
      }));

    const totalRanked = rankedUsers.length;
    const totalPages = Math.max(1, Math.ceil(totalRanked / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startIdx = (safePage - 1) * pageSize;

    const currentUserEntry = currentUserId
      ? rankedUsers.find((e) => e.userId === currentUserId) || null
      : null;

    return {
      category: 'coins',
      entries: rankedUsers.slice(startIdx, startIdx + pageSize),
      totalRanked,
      page: safePage,
      pageSize,
      totalPages,
      currentUserEntry,
    };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();

  const countRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM users u
     LEFT JOIN player_wallet_stats w ON w.user_id = u.id
     WHERE GREATEST(COALESCE(w.total_coins_collected, 0), u.total_coins) > 0`
  );
  const totalRanked = Number(countRes.rows[0]?.cnt ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRanked / pageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * pageSize;

  const pageRes = await pool.query<{
    id: string;
    nickname: string;
    equipped_skin: SkinId;
    total_matches: number;
    coins_total: number;
  }>(
    `SELECT u.id,
            u.nickname,
            u.equipped_skin,
            u.total_matches,
            GREATEST(COALESCE(w.total_coins_collected, 0), u.total_coins) AS coins_total
     FROM users u
     LEFT JOIN player_wallet_stats w ON w.user_id = u.id
     WHERE GREATEST(COALESCE(w.total_coins_collected, 0), u.total_coins) > 0
     ORDER BY coins_total DESC, u.total_matches DESC, u.created_at ASC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  const entries: CoinsLeaderboardEntry[] = pageRes.rows.map((row, idx) => ({
    rank: offset + idx + 1,
    userId: row.id,
    nickname: row.nickname,
    skinId: row.equipped_skin,
    totalCoinsCollected: Number(row.coins_total),
    totalMatches: Number(row.total_matches),
  }));

  let currentUserEntry: CoinsLeaderboardEntry | null = null;
  if (currentUserId) {
    const inPage = entries.find((e) => e.userId === currentUserId);
    if (inPage) {
      currentUserEntry = inPage;
    } else {
      const myRes = await pool.query<{
        id: string;
        nickname: string;
        equipped_skin: SkinId;
        total_matches: number;
        created_at: string;
        coins_total: number;
      }>(
        `SELECT u.id,
                u.nickname,
                u.equipped_skin,
                u.total_matches,
                u.created_at,
                GREATEST(COALESCE(w.total_coins_collected, 0), u.total_coins) AS coins_total
         FROM users u
         LEFT JOIN player_wallet_stats w ON w.user_id = u.id
         WHERE u.id = $1
         LIMIT 1`,
        [currentUserId]
      );
      const me = myRes.rows[0];
      if (me && Number(me.coins_total) > 0) {
        const aheadRes = await pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM users u
           LEFT JOIN player_wallet_stats w ON w.user_id = u.id
           WHERE GREATEST(COALESCE(w.total_coins_collected, 0), u.total_coins) > $1
              OR (
                GREATEST(COALESCE(w.total_coins_collected, 0), u.total_coins) = $1
                AND (
                  u.total_matches > $2
                  OR (u.total_matches = $2 AND u.created_at < $3)
                )
              )`,
          [Number(me.coins_total), Number(me.total_matches), me.created_at]
        );
        currentUserEntry = {
          rank: Number(aheadRes.rows[0]?.cnt ?? 0) + 1,
          userId: me.id,
          nickname: me.nickname,
          skinId: me.equipped_skin,
          totalCoinsCollected: Number(me.coins_total),
          totalMatches: Number(me.total_matches),
        };
      }
    }
  }

  return {
    category: 'coins',
    entries,
    totalRanked,
    page: safePage,
    pageSize,
    totalPages,
    currentUserEntry,
  };
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
  if (!isGiftableSkinId(skinId)) {
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
      skinName: ALL_SKINS.find((s) => s.id === skinId)?.name || skinId,
    };
  }

  const nextGifted = [...target.giftedSkins, skinId];
  const nextUnlocked = target.unlockedSkins.includes(skinId)
    ? target.unlockedSkins
    : [...target.unlockedSkins, skinId];

  const nowIso = new Date().toISOString();
  const gift: SkinGiftItem = {
    id: `gift_${generateToken(8)}`,
    targetUserId: target.id,
    targetNickname: target.nickname,
    skinId,
    grantedBy: adminNickname,
    createdAt: nowIso,
    seen: false,
  };

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const u = db.users[target.id];
    if (u) {
      u.giftedSkins = nextGifted;
      u.unlockedSkins = nextUnlocked;
    }
    if (isSpecialUnlockableSkinId(skinId) || isLockedExclusiveSkinId(skinId)) {
      const existingPerm = db.exclusiveSkinPermissions.find(
        (p) => p.userId === target.id && p.skinId === skinId && p.active
      );
      if (!existingPerm) {
        db.exclusiveSkinPermissions.push({
          id: `eperm_${generateToken(8)}`,
          userId: target.id,
          skinId,
          reason: 'admin_gift',
          rankPosition: null,
          active: true,
          grantedAt: nowIso,
          revokedAt: null,
          updatedAt: nowIso,
        });
      } else if (existingPerm.reason === 'admin_bulk_grant') {
        existingPerm.reason = 'admin_gift';
        existingPerm.updatedAt = nowIso;
      }
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

  if (isSpecialUnlockableSkinId(skinId) || isLockedExclusiveSkinId(skinId)) {
    const existingPerm = await db
      .select()
      .from(exclusiveSkinPermissions)
      .where(
        and(
          eq(exclusiveSkinPermissions.userId, target.id),
          eq(exclusiveSkinPermissions.skinId, skinId),
          eq(exclusiveSkinPermissions.active, true)
        )
      )
      .limit(1);
    if (existingPerm.length === 0) {
      await db.insert(exclusiveSkinPermissions).values({
        id: `eperm_${generateToken(8)}`,
        userId: target.id,
        skinId,
        reason: 'admin_gift',
        rankPosition: null,
        active: true,
        grantedAt: nowIso,
        revokedAt: null,
        updatedAt: nowIso,
      });
    } else if (existingPerm[0].reason === 'admin_bulk_grant') {
      await db
        .update(exclusiveSkinPermissions)
        .set({ reason: 'admin_gift', updatedAt: nowIso })
        .where(eq(exclusiveSkinPermissions.id, existingPerm[0].id));
    }
  }

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
      activeExclusivePermissions: db.exclusiveSkinPermissions
        .filter((p) => p.userId === u.id && p.active)
        .map((p) => p.skinId),
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

  const matchedIds = matchedRows.map((r) => r.id);
  const [allGifts, activePerms] = await Promise.all([
    db.select().from(skinGifts).orderBy(desc(skinGifts.createdAt)),
    matchedIds.length > 0
      ? db
          .select()
          .from(exclusiveSkinPermissions)
          .where(
            and(
              inArray(exclusiveSkinPermissions.userId, matchedIds),
              eq(exclusiveSkinPermissions.active, true)
            )
          )
      : Promise.resolve([]),
  ]);
  const giftsByUser = new Map<string, SkinGiftItem[]>();
  for (const g of allGifts) {
    const list = giftsByUser.get(g.targetUserId);
    if (list) list.push(g);
    else giftsByUser.set(g.targetUserId, [g]);
  }
  const permsByUser = new Map<string, SkinId[]>();
  for (const p of activePerms) {
    const list = permsByUser.get(p.userId);
    if (list) list.push(p.skinId);
    else permsByUser.set(p.userId, [p.skinId]);
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
      activeExclusivePermissions: permsByUser.get(u.id) || [],
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

const RANK_SKIN_IDS = new Set<SkinId>(['lenda_suprema', 'campeao_prata', 'guerreiro_bronze']);

export async function repoSyncExclusiveSkinPermissions(): Promise<void> {
  const now = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const ranked = Object.values(db.users)
      .filter((u) => u.bestNoCoinTimeMs > 0)
      .sort((a, b) => b.bestNoCoinTimeMs - a.bestNoCoinTimeMs || b.bestDistance - a.bestDistance)
      .slice(0, 3);

    const desiredRankByUser = new Map<string, Set<ExclusiveSkinId>>();
    RANK_SKIN_MAP.forEach((slot, idx) => {
      const holder = ranked[idx];
      if (!holder) return;
      const set = desiredRankByUser.get(holder.id) || new Set<ExclusiveSkinId>();
      set.add(slot.skinId);
      desiredRankByUser.set(holder.id, set);
    });

    let changed = false;

    // Preserve explicit 'admin' (ratao_rei), 'promo_code', 'admin_gift', 'special_rule' permissions!
    // Only sync dynamic rank skins & ensure non-admins never hold ratao_rei.
    for (const perm of db.exclusiveSkinPermissions) {
      if (!perm.active) continue;
      if (perm.skinId === 'ratao_rei') {
        const u = db.users[perm.userId];
        if (!u || u.role !== 'admin') {
          perm.active = false;
          perm.revokedAt = now;
          perm.updatedAt = now;
          changed = true;
        }
        continue;
      }
      if (RANK_SKIN_IDS.has(perm.skinId)) {
        const desired = desiredRankByUser.get(perm.userId);
        if (!desired || !desired.has(perm.skinId as ExclusiveSkinId)) {
          perm.active = false;
          perm.revokedAt = now;
          perm.updatedAt = now;
          changed = true;
        }
      }
    }

    for (const [uid, skins] of desiredRankByUser.entries()) {
      for (const skinId of skins) {
        const already = db.exclusiveSkinPermissions.find(
          (p) => p.userId === uid && p.skinId === skinId && p.active
        );
        if (!already) {
          const rankSlot = RANK_SKIN_MAP.find((r) => r.skinId === skinId)!;
          db.exclusiveSkinPermissions.push({
            id: `eperm_${generateToken(8)}`,
            userId: uid,
            skinId,
            reason: rankSlot.reason,
            rankPosition: rankSlot.rank,
            active: true,
            grantedAt: now,
            revokedAt: null,
            updatedAt: now,
          });
          changed = true;
        }
      }
    }

    // Revert equipped skin if a user holds an exclusive/unlockable skin without active permission
    for (const u of Object.values(db.users)) {
      if (
        isExclusiveSkinId(u.equippedSkin) ||
        isSpecialUnlockableSkinId(u.equippedSkin) ||
        isLockedExclusiveSkinId(u.equippedSkin)
      ) {
        const hasPerm = db.exclusiveSkinPermissions.some(
          (p) => p.userId === u.id && p.skinId === u.equippedSkin && p.active
        );
        const isValidKing = u.equippedSkin !== 'ratao_rei' || u.role === 'admin';
        if (!hasPerm || !isValidKing) {
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

  const rankedFilter = gt(users.bestNoCoinTimeMs, 0);
  const [topUsers, adminUsers, activePerms] = await Promise.all([
    db
      .select()
      .from(users)
      .where(rankedFilter)
      .orderBy(desc(users.bestNoCoinTimeMs), desc(users.bestDistance))
      .limit(3),
    db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')),
    db
      .select()
      .from(exclusiveSkinPermissions)
      .where(eq(exclusiveSkinPermissions.active, true)),
  ]);

  const adminIdSet = new Set(adminUsers.map((a) => a.id));
  const desiredRankByUser = new Map<string, Set<ExclusiveSkinId>>();
  RANK_SKIN_MAP.forEach((slot, idx) => {
    const holder = topUsers[idx];
    if (!holder) return;
    const set = desiredRankByUser.get(holder.id) || new Set<ExclusiveSkinId>();
    set.add(slot.skinId);
    desiredRankByUser.set(holder.id, set);
  });

  const revokeIds: string[] = [];
  for (const perm of activePerms) {
    if (perm.skinId === 'ratao_rei') {
      if (!adminIdSet.has(perm.userId)) {
        revokeIds.push(perm.id);
      }
      continue;
    }
    if (RANK_SKIN_IDS.has(perm.skinId)) {
      const desired = desiredRankByUser.get(perm.userId);
      if (!desired || !desired.has(perm.skinId as ExclusiveSkinId)) {
        revokeIds.push(perm.id);
      }
    }
  }
  if (revokeIds.length > 0) {
    await db
      .update(exclusiveSkinPermissions)
      .set({ active: false, revokedAt: now, updatedAt: now })
      .where(inArray(exclusiveSkinPermissions.id, revokeIds));
  }

  for (const [uid, skins] of desiredRankByUser.entries()) {
    for (const skinId of skins) {
      const exists = activePerms.some((p) => p.userId === uid && p.skinId === skinId);
      if (!exists) {
        const rankSlot = RANK_SKIN_MAP.find((r) => r.skinId === skinId)!;
        await db.insert(exclusiveSkinPermissions).values({
          id: `eperm_${generateToken(8)}`,
          userId: uid,
          skinId,
          reason: rankSlot.reason,
          rankPosition: rankSlot.rank,
          active: true,
          grantedAt: now,
          revokedAt: null,
          updatedAt: now,
        });
      }
    }
  }

  // Revert any user who currently has an exclusive/unlockable skin equipped without active permission
  const exclusiveHolders = await db
    .select()
    .from(users)
    .where(
      inArray(users.equippedSkin, [
        'ratao_rei',
        'lenda_suprema',
        'campeao_prata',
        'guerreiro_bronze',
        'meu_ratao',
        ...LOCKED_EXCLUSIVE_SKIN_IDS,
      ])
    );
  const freshActivePerms = await db
    .select()
    .from(exclusiveSkinPermissions)
    .where(eq(exclusiveSkinPermissions.active, true));
  for (const u of exclusiveHolders) {
    const hasPerm = freshActivePerms.some(
      (p) => p.userId === u.id && p.skinId === u.equippedSkin
    );
    const isValidKing = u.equippedSkin !== 'ratao_rei' || u.role === 'admin';
    if (!hasPerm || !isValidKing) {
      await db.update(users).set({ equippedSkin: 'ratao' }).where(eq(users.id, u.id));
    }
  }
}

export async function repoUnlockAdminKingSkin(
  adminUser: StoredUser
): Promise<{ alreadyUnlocked: boolean; allowedExclusiveSkins: SkinId[] }> {
  if (adminUser.role !== 'admin') {
    throw new Error('Apenas administradores podem desbloquear a skin Ratão Rei.');
  }

  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const already = db.exclusiveSkinPermissions.some(
      (p) => p.userId === adminUser.id && p.skinId === 'ratao_rei' && p.active
    );
    if (!already) {
      db.exclusiveSkinPermissions.push({
        id: `eperm_${generateToken(8)}`,
        userId: adminUser.id,
        skinId: 'ratao_rei',
        reason: 'admin',
        rankPosition: null,
        active: true,
        grantedAt: nowIso,
        revokedAt: null,
        updatedAt: nowIso,
      });
      const u = db.users[adminUser.id];
      if (u && !u.unlockedSkins.includes('ratao_rei')) {
        u.unlockedSkins.push('ratao_rei');
      }
      await addLocalAdminLog(
        adminUser.nickname,
        'DESBLOQUEAR_RATAO_REI',
        `Admin ${adminUser.nickname} desbloqueou a skin Ratão Rei no inventário administrativo`
      );
      saveLocalDb();
    }
    const allowedExclusiveSkins = await repoGetAllowedExclusiveSkinsForUser(adminUser);
    return { alreadyUnlocked: already, allowedExclusiveSkins };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const existing = await db
    .select()
    .from(exclusiveSkinPermissions)
    .where(
      and(
        eq(exclusiveSkinPermissions.userId, adminUser.id),
        eq(exclusiveSkinPermissions.skinId, 'ratao_rei'),
        eq(exclusiveSkinPermissions.active, true)
      )
    )
    .limit(1);

  const already = existing.length > 0;
  if (!already) {
    await db.insert(exclusiveSkinPermissions).values({
      id: `eperm_${generateToken(8)}`,
      userId: adminUser.id,
      skinId: 'ratao_rei',
      reason: 'admin',
      rankPosition: null,
      active: true,
      grantedAt: nowIso,
      revokedAt: null,
      updatedAt: nowIso,
    });
    const nextUnlocked: SkinId[] = adminUser.unlockedSkins.includes('ratao_rei')
      ? adminUser.unlockedSkins
      : [...adminUser.unlockedSkins, 'ratao_rei'];
    await db
      .update(users)
      .set({ unlockedSkins: nextUnlocked })
      .where(eq(users.id, adminUser.id));

    await addNeonAdminLog(
      adminUser.nickname,
      'DESBLOQUEAR_RATAO_REI',
      `Admin ${adminUser.nickname} desbloqueou a skin Ratão Rei no inventário administrativo`
    );
  }

  const allowedExclusiveSkins = await repoGetAllowedExclusiveSkinsForUser(adminUser);
  return { alreadyUnlocked: already, allowedExclusiveSkins };
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
    if (freshUser.role !== 'admin') {
      set.delete('ratao_rei');
    }
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
  if (user.role !== 'admin') {
    set.delete('ratao_rei');
  }
  return Array.from(set);
}

export async function repoCanUserEquipSkin(user: StoredUser, skinId: SkinId): Promise<boolean> {
  if (isCommonSkinId(skinId)) return true;
  if (skinId === 'ratao_rei' && user.role !== 'admin') return false;
  const allowed = await repoGetAllowedExclusiveSkinsForUser(user);
  return allowed.includes(skinId);
}

function isAdminManageableLockedSkin(
  skinId: SkinId
): skinId is LockedExclusiveSkinId | SpecialUnlockableSkinId {
  return isLockedExclusiveSkinId(skinId) || isSpecialUnlockableSkinId(skinId);
}

export async function repoAdminListExclusiveSkinOwners(
  skinId?: SkinId
): Promise<AdminExclusiveSkinOwner[]> {
  const filterSkin =
    skinId && isAdminManageableLockedSkin(skinId) ? skinId : undefined;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.exclusiveSkinPermissions
      .filter(
        (p) =>
          p.active &&
          isAdminManageableLockedSkin(p.skinId) &&
          (!filterSkin || p.skinId === filterSkin)
      )
      .map((p) => {
        const u = db.users[p.userId];
        return {
          id: p.id,
          userId: p.userId,
          nickname: u?.nickname || 'Jogador removido',
          skinId: p.skinId,
          reason: p.reason,
          grantedAt: p.grantedAt,
          equipped: u?.equippedSkin === p.skinId,
        };
      })
      .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const perms = await db
    .select()
    .from(exclusiveSkinPermissions)
    .where(
      filterSkin
        ? and(
            eq(exclusiveSkinPermissions.active, true),
            eq(exclusiveSkinPermissions.skinId, filterSkin)
          )
        : eq(exclusiveSkinPermissions.active, true)
    )
    .orderBy(desc(exclusiveSkinPermissions.grantedAt));

  const filtered = perms.filter((p) => isAdminManageableLockedSkin(p.skinId));
  if (filtered.length === 0) return [];

  const userIds = Array.from(new Set(filtered.map((p) => p.userId)));
  const userRows = await db
    .select({
      id: users.id,
      nickname: users.nickname,
      equippedSkin: users.equippedSkin,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return filtered.map((p) => {
    const u = userMap.get(p.userId);
    return {
      id: p.id,
      userId: p.userId,
      nickname: u?.nickname || 'Jogador removido',
      skinId: p.skinId,
      reason: p.reason,
      grantedAt: p.grantedAt,
      equipped: u?.equippedSkin === p.skinId,
    };
  });
}

export async function repoAdminGrantLockedSkin(params: {
  adminNickname: string;
  targetNickname: string;
  skinId: SkinId;
}): Promise<
  | { status: 'ok'; owner: AdminExclusiveSkinOwner }
  | { status: 'invalid_skin' | 'not_found' }
  | { status: 'already_unlocked'; targetNickname: string; skinName: string }
> {
  if (!isAdminManageableLockedSkin(params.skinId)) {
    return { status: 'invalid_skin' };
  }
  const target = await repoFindUserByNickname(params.targetNickname);
  if (!target) {
    return { status: 'not_found' };
  }

  const skinName = ALL_SKINS.find((s) => s.id === params.skinId)?.name || params.skinId;
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const already = db.exclusiveSkinPermissions.some(
      (p) => p.userId === target.id && p.skinId === params.skinId && p.active
    );
    if (already) {
      return { status: 'already_unlocked', targetNickname: target.nickname, skinName };
    }
    const permId = `eperm_${generateToken(8)}`;
    db.exclusiveSkinPermissions.push({
      id: permId,
      userId: target.id,
      skinId: params.skinId,
      reason: 'admin_gift',
      rankPosition: null,
      active: true,
      grantedAt: nowIso,
      revokedAt: null,
      updatedAt: nowIso,
    });
    const u = db.users[target.id];
    if (u && !u.unlockedSkins.includes(params.skinId)) {
      u.unlockedSkins.push(params.skinId);
    }
    await addLocalAdminLog(
      params.adminNickname,
      'LIBERAR_SKIN_EXCLUSIVA',
      `Liberou "${skinName}" (${params.skinId}) para ${target.nickname}`
    );
    saveLocalDb();
    return {
      status: 'ok',
      owner: {
        id: permId,
        userId: target.id,
        nickname: target.nickname,
        skinId: params.skinId,
        reason: 'admin_gift',
        grantedAt: nowIso,
        equipped: target.equippedSkin === params.skinId,
      },
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const existing = await db
    .select()
    .from(exclusiveSkinPermissions)
    .where(
      and(
        eq(exclusiveSkinPermissions.userId, target.id),
        eq(exclusiveSkinPermissions.skinId, params.skinId),
        eq(exclusiveSkinPermissions.active, true)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { status: 'already_unlocked', targetNickname: target.nickname, skinName };
  }

  const permId = `eperm_${generateToken(8)}`;
  await db.insert(exclusiveSkinPermissions).values({
    id: permId,
    userId: target.id,
    skinId: params.skinId,
    reason: 'admin_gift',
    rankPosition: null,
    active: true,
    grantedAt: nowIso,
    revokedAt: null,
    updatedAt: nowIso,
  });

  if (!target.unlockedSkins.includes(params.skinId)) {
    await db
      .update(users)
      .set({ unlockedSkins: [...target.unlockedSkins, params.skinId] })
      .where(eq(users.id, target.id));
  }

  await addNeonAdminLog(
    params.adminNickname,
    'LIBERAR_SKIN_EXCLUSIVA',
    `Liberou "${skinName}" (${params.skinId}) para ${target.nickname}`
  );

  return {
    status: 'ok',
    owner: {
      id: permId,
      userId: target.id,
      nickname: target.nickname,
      skinId: params.skinId,
      reason: 'admin_gift',
      grantedAt: nowIso,
      equipped: target.equippedSkin === params.skinId,
    },
  };
}

export async function repoAdminRevokeLockedSkin(params: {
  adminNickname: string;
  userId: string;
  skinId: SkinId;
}): Promise<
  | { status: 'ok'; targetNickname: string; resetEquipped: boolean }
  | { status: 'invalid_skin' | 'not_found' }
> {
  if (!isAdminManageableLockedSkin(params.skinId)) {
    return { status: 'invalid_skin' };
  }
  const target = await repoFindUserById(params.userId);
  if (!target) {
    return { status: 'not_found' };
  }

  const skinName = ALL_SKINS.find((s) => s.id === params.skinId)?.name || params.skinId;
  const nowIso = new Date().toISOString();
  const resetEquipped = target.equippedSkin === params.skinId;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    let revokedAny = false;
    for (const perm of db.exclusiveSkinPermissions) {
      if (perm.userId === target.id && perm.skinId === params.skinId && perm.active) {
        perm.active = false;
        perm.revokedAt = nowIso;
        perm.updatedAt = nowIso;
        revokedAny = true;
      }
    }
    const u = db.users[target.id];
    if (u) {
      u.unlockedSkins = u.unlockedSkins.filter((s) => s !== params.skinId);
      u.giftedSkins = u.giftedSkins.filter((s) => s !== params.skinId);
      if (u.equippedSkin === params.skinId) {
        u.equippedSkin = 'ratao';
      }
    }
    if (!revokedAny && !target.unlockedSkins.includes(params.skinId) && !resetEquipped) {
      return { status: 'not_found' };
    }
    await addLocalAdminLog(
      params.adminNickname,
      'REVOGAR_SKIN_EXCLUSIVA',
      `Removeu permissão da skin "${skinName}" (${params.skinId}) de ${target.nickname}`
    );
    saveLocalDb();
    return { status: 'ok', targetNickname: target.nickname, resetEquipped };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const updatedPerms = await db
    .update(exclusiveSkinPermissions)
    .set({ active: false, revokedAt: nowIso, updatedAt: nowIso })
    .where(
      and(
        eq(exclusiveSkinPermissions.userId, target.id),
        eq(exclusiveSkinPermissions.skinId, params.skinId),
        eq(exclusiveSkinPermissions.active, true)
      )
    )
    .returning({ id: exclusiveSkinPermissions.id });

  const nextUnlocked = target.unlockedSkins.filter((s) => s !== params.skinId);
  const nextGifted = target.giftedSkins.filter((s) => s !== params.skinId);
  await db
    .update(users)
    .set({
      unlockedSkins: nextUnlocked,
      giftedSkins: nextGifted,
      ...(resetEquipped ? { equippedSkin: 'ratao' } : {}),
    })
    .where(eq(users.id, target.id));

  if (
    updatedPerms.length === 0 &&
    !target.unlockedSkins.includes(params.skinId) &&
    !resetEquipped
  ) {
    return { status: 'not_found' };
  }

  await addNeonAdminLog(
    params.adminNickname,
    'REVOGAR_SKIN_EXCLUSIVA',
    `Removeu permissão da skin "${skinName}" (${params.skinId}) de ${target.nickname}`
  );
  return { status: 'ok', targetNickname: target.nickname, resetEquipped };
}

function buildPlayerSkinsSummary(
  target: StoredUser,
  activePerms: Pick<ExclusiveSkinPermissionRecord, 'skinId' | 'reason'>[]
): AdminPlayerSkinsSummary {
  const permBySkin = new Map<SkinId, ExclusiveSkinPermissionRecord['reason']>();
  for (const p of activePerms) {
    if (p.skinId === 'ratao_rei' && target.role !== 'admin') continue;
    permBySkin.set(p.skinId, p.reason);
  }

  const bulkGrantedSkinIds: SkinId[] = [];
  const legitimateSpecialSkinIds: SkinId[] = [];
  const specialUnlocked: SkinId[] = [];

  for (const skinId of BULK_GRANTABLE_RESTRICTED_SKIN_IDS) {
    const reason = permBySkin.get(skinId);
    if (!reason) continue;
    specialUnlocked.push(skinId);
    if (reason === 'admin_bulk_grant') {
      bulkGrantedSkinIds.push(skinId);
    } else {
      legitimateSpecialSkinIds.push(skinId);
    }
  }

  const protectedExclusiveOwned: SkinId[] = EXCLUSIVE_SKIN_IDS.filter((skinId) =>
    permBySkin.has(skinId)
  );

  const unlockedSkinIds: SkinId[] = Array.from(
    new Set<SkinId>([...COMMON_SKIN_IDS, ...specialUnlocked, ...protectedExclusiveOwned])
  );

  return {
    userId: target.id,
    nickname: target.nickname,
    role: target.role,
    equippedSkin: target.equippedSkin,
    totalCatalogSkins: ALL_SKINS.length,
    totalGrantableSkins: BULK_GRANTABLE_ALL_SKIN_IDS.length,
    totalUnlockedCount: unlockedSkinIds.length,
    commonUnlockedCount: COMMON_SKIN_IDS.length,
    commonTotalCount: COMMON_SKIN_IDS.length,
    specialUnlockedCount: specialUnlocked.length,
    specialTotalCount: BULK_GRANTABLE_RESTRICTED_SKIN_IDS.length,
    bulkGrantedCount: bulkGrantedSkinIds.length,
    legitimateSpecialCount: legitimateSpecialSkinIds.length,
    protectedExclusiveOwned,
    unlockedSkinIds,
    bulkGrantedSkinIds,
    legitimateSpecialSkinIds,
  };
}

export async function repoAdminGetPlayerSkinsSummary(
  nickname: string
): Promise<AdminPlayerSkinsSummary | null> {
  await repoSyncExclusiveSkinPermissions();
  const target = await repoFindUserByNickname(nickname);
  if (!target) return null;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const activePerms = db.exclusiveSkinPermissions.filter(
      (p) => p.userId === target.id && p.active
    );
    return buildPlayerSkinsSummary(target, activePerms);
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const activePerms = await db
    .select({
      skinId: exclusiveSkinPermissions.skinId,
      reason: exclusiveSkinPermissions.reason,
    })
    .from(exclusiveSkinPermissions)
    .where(
      and(
        eq(exclusiveSkinPermissions.userId, target.id),
        eq(exclusiveSkinPermissions.active, true)
      )
    );
  return buildPlayerSkinsSummary(target, activePerms);
}

export async function repoAdminGrantAllEligibleSkins(params: {
  adminUser: StoredUser;
  targetNickname: string;
}): Promise<
  | {
      status: 'ok';
      alreadyHadAll: boolean;
      grantedSkins: SkinId[];
      summary: AdminPlayerSkinsSummary;
      historyEntry: SkinGrantHistoryRecord | null;
    }
  | { status: 'forbidden' | 'not_found' }
> {
  if (params.adminUser.role !== 'admin') {
    return { status: 'forbidden' };
  }

  await repoSyncExclusiveSkinPermissions();
  const cleanNick = params.targetNickname.trim().toLowerCase();
  if (!cleanNick) return { status: 'not_found' };

  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const target = Object.values(db.users).find((u) => u.nicknameLower === cleanNick);
    if (!target) return { status: 'not_found' };

    const activePerms = db.exclusiveSkinPermissions.filter(
      (p) => p.userId === target.id && p.active
    );
    const activeSkinSet = new Set<SkinId>(activePerms.map((p) => p.skinId));

    const newlyGrantedRestricted: SkinId[] = [];
    for (const skinId of BULK_GRANTABLE_RESTRICTED_SKIN_IDS) {
      if (!activeSkinSet.has(skinId)) {
        db.exclusiveSkinPermissions.push({
          id: `eperm_${generateToken(8)}`,
          userId: target.id,
          skinId,
          reason: 'admin_bulk_grant',
          rankPosition: null,
          active: true,
          grantedAt: nowIso,
          revokedAt: null,
          updatedAt: nowIso,
        });
        newlyGrantedRestricted.push(skinId);
      }
    }

    const missingCommon = COMMON_SKIN_IDS.filter((s) => !target.unlockedSkins.includes(s));
    const freshPerms = db.exclusiveSkinPermissions.filter(
      (p) => p.userId === target.id && p.active
    );
    const summary = buildPlayerSkinsSummary(target, freshPerms);
    target.unlockedSkins = [...summary.unlockedSkinIds];

    const alreadyHadAll = newlyGrantedRestricted.length === 0 && missingCommon.length === 0;
    let historyEntry: SkinGrantHistoryRecord | null = null;

    if (!alreadyHadAll) {
      const affected = [...missingCommon, ...newlyGrantedRestricted];
      historyEntry = {
        id: `sgh_${generateToken(8)}`,
        action: 'grant_all',
        adminUserId: params.adminUser.id,
        adminNickname: params.adminUser.nickname,
        targetUserId: target.id,
        targetNickname: target.nickname,
        skinsAffected: affected,
        skinsCount: affected.length,
        alreadyOwnedCount: BULK_GRANTABLE_ALL_SKIN_IDS.length - affected.length,
        totalSkinsAfter: summary.totalUnlockedCount,
        createdAt: nowIso,
      };
      db.skinGrantHistory.unshift(historyEntry);
      if (db.skinGrantHistory.length > 300) db.skinGrantHistory.length = 300;
      await addLocalAdminLog(
        params.adminUser.nickname,
        'CONCEDER_TODAS_SKINS',
        `Desbloqueou ${affected.length} skin(s) elegível(is) para ${target.nickname} (total: ${summary.totalUnlockedCount}/${summary.totalCatalogSkins})`
      );
    }

    saveLocalDb();
    return {
      status: 'ok',
      alreadyHadAll,
      grantedSkins: newlyGrantedRestricted,
      summary,
      historyEntry,
    };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const uRes = await client.query<{
      id: string;
      nickname: string;
      nickname_lower: string;
      password_hash: string;
      recovery_hash: string | null;
      google_uid: string | null;
      role: 'player' | 'admin';
      must_change_password: boolean;
      equipped_skin: SkinId;
      unlocked_skins: SkinId[];
      gifted_skins: SkinId[];
      best_no_coin_time_ms: number;
      best_distance: number;
      best_score: number;
      total_matches: number;
      total_coins: number;
      favorite_skin: SkinId;
      skin_usage: Record<string, number>;
      created_at: string;
      last_seen_at: string;
    }>(
      `SELECT * FROM users WHERE nickname_lower = $1 FOR UPDATE`,
      [cleanNick]
    );
    const uRow = uRes.rows[0];
    if (!uRow) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }

    const target: StoredUser = {
      id: uRow.id,
      nickname: uRow.nickname,
      nicknameLower: uRow.nickname_lower,
      passwordHash: uRow.password_hash,
      recoveryHash: uRow.recovery_hash,
      googleUid: uRow.google_uid ?? undefined,
      role: uRow.role,
      mustChangePassword: uRow.must_change_password,
      equippedSkin: uRow.equipped_skin,
      unlockedSkins: Array.isArray(uRow.unlocked_skins) ? uRow.unlocked_skins : [...COMMON_SKIN_IDS],
      giftedSkins: Array.isArray(uRow.gifted_skins) ? uRow.gifted_skins : [],
      bestNoCoinTimeMs: uRow.best_no_coin_time_ms,
      bestDistance: uRow.best_distance,
      bestScore: uRow.best_score,
      totalMatches: uRow.total_matches,
      totalCoins: uRow.total_coins,
      favoriteSkin: uRow.favorite_skin,
      skinUsage: uRow.skin_usage || {},
      createdAt: uRow.created_at,
      lastSeenAt: uRow.last_seen_at,
    };

    const permsRes = await client.query<{
      skin_id: ExclusiveSkinPermissionRecord['skinId'];
      reason: ExclusiveSkinPermissionRecord['reason'];
    }>(
      `SELECT skin_id, reason FROM exclusive_skin_permissions WHERE user_id = $1 AND active = TRUE`,
      [target.id]
    );
    const activePerms = permsRes.rows.map((r) => ({
      skinId: r.skin_id,
      reason: r.reason,
    }));
    const activeSkinSet = new Set<SkinId>(activePerms.map((p) => p.skinId));

    const newlyGrantedRestricted: SkinId[] = [];
    for (const skinId of BULK_GRANTABLE_RESTRICTED_SKIN_IDS) {
      if (!activeSkinSet.has(skinId)) {
        await client.query(
          `INSERT INTO exclusive_skin_permissions
             (id, user_id, skin_id, reason, rank_position, active, granted_at, revoked_at, updated_at)
           VALUES ($1, $2, $3, 'admin_bulk_grant', NULL, TRUE, $4, NULL, $4)`,
          [`eperm_${generateToken(8)}`, target.id, skinId, nowIso]
        );
        newlyGrantedRestricted.push(skinId);
        activePerms.push({ skinId, reason: 'admin_bulk_grant' });
      }
    }

    const missingCommon = COMMON_SKIN_IDS.filter((s) => !target.unlockedSkins.includes(s));
    const summary = buildPlayerSkinsSummary(target, activePerms);

    await client.query(
      `UPDATE users SET unlocked_skins = $1::jsonb WHERE id = $2`,
      [JSON.stringify(summary.unlockedSkinIds), target.id]
    );

    const alreadyHadAll = newlyGrantedRestricted.length === 0 && missingCommon.length === 0;
    let historyEntry: SkinGrantHistoryRecord | null = null;

    if (!alreadyHadAll) {
      const affected = [...missingCommon, ...newlyGrantedRestricted];
      historyEntry = {
        id: `sgh_${generateToken(8)}`,
        action: 'grant_all',
        adminUserId: params.adminUser.id,
        adminNickname: params.adminUser.nickname,
        targetUserId: target.id,
        targetNickname: target.nickname,
        skinsAffected: affected,
        skinsCount: affected.length,
        alreadyOwnedCount: BULK_GRANTABLE_ALL_SKIN_IDS.length - affected.length,
        totalSkinsAfter: summary.totalUnlockedCount,
        createdAt: nowIso,
      };
      await client.query(
        `INSERT INTO skin_grant_history
           (id, action, admin_user_id, admin_nickname, target_user_id, target_nickname, skins_affected, skins_count, already_owned_count, total_skins_after, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [
          historyEntry.id,
          historyEntry.action,
          historyEntry.adminUserId,
          historyEntry.adminNickname,
          historyEntry.targetUserId,
          historyEntry.targetNickname,
          JSON.stringify(historyEntry.skinsAffected),
          historyEntry.skinsCount,
          historyEntry.alreadyOwnedCount,
          historyEntry.totalSkinsAfter,
          historyEntry.createdAt,
        ]
      );
      await client.query(
        `INSERT INTO admin_logs (id, admin_nickname, action, details, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `log_${generateToken(6)}`,
          params.adminUser.nickname,
          'CONCEDER_TODAS_SKINS',
          `Desbloqueou ${affected.length} skin(s) elegível(is) para ${target.nickname} (total: ${summary.totalUnlockedCount}/${summary.totalCatalogSkins})`,
          nowIso,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      status: 'ok',
      alreadyHadAll,
      grantedSkins: newlyGrantedRestricted,
      summary,
      historyEntry,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function repoAdminRevokeBulkGrantedSkins(params: {
  adminUser: StoredUser;
  targetNickname?: string;
  targetUserId?: string;
}): Promise<
  | {
      status: 'ok';
      revokedSkins: SkinId[];
      resetEquipped: boolean;
      summary: AdminPlayerSkinsSummary;
      historyEntry: SkinGrantHistoryRecord | null;
    }
  | { status: 'forbidden' | 'not_found' }
> {
  if (params.adminUser.role !== 'admin') {
    return { status: 'forbidden' };
  }

  await repoSyncExclusiveSkinPermissions();
  const cleanNick = params.targetNickname?.trim().toLowerCase() || '';
  const cleanId = params.targetUserId?.trim() || '';
  if (!cleanNick && !cleanId) return { status: 'not_found' };

  const grantableRestrictedSet = new Set<SkinId>(BULK_GRANTABLE_RESTRICTED_SKIN_IDS);
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const target = cleanId
      ? db.users[cleanId]
      : Object.values(db.users).find((u) => u.nicknameLower === cleanNick);
    if (!target) return { status: 'not_found' };

    const revokedSkins: SkinId[] = [];
    for (const perm of db.exclusiveSkinPermissions) {
      if (
        perm.userId === target.id &&
        perm.active &&
        perm.reason === 'admin_bulk_grant' &&
        grantableRestrictedSet.has(perm.skinId)
      ) {
        perm.active = false;
        perm.revokedAt = nowIso;
        perm.updatedAt = nowIso;
        revokedSkins.push(perm.skinId);
      }
    }

    const remainingPerms = db.exclusiveSkinPermissions.filter(
      (p) => p.userId === target.id && p.active
    );
    const remainingAllowed = new Set<SkinId>(remainingPerms.map((p) => p.skinId));
    if (target.role !== 'admin') remainingAllowed.delete('ratao_rei');

    let resetEquipped = false;
    if (!isCommonSkinId(target.equippedSkin) && !remainingAllowed.has(target.equippedSkin)) {
      target.equippedSkin = 'ratao';
      resetEquipped = true;
    }

    const summary = buildPlayerSkinsSummary(target, remainingPerms);
    target.unlockedSkins = [...summary.unlockedSkinIds];

    let historyEntry: SkinGrantHistoryRecord | null = null;
    if (revokedSkins.length > 0) {
      historyEntry = {
        id: `sgh_${generateToken(8)}`,
        action: 'revoke_bulk',
        adminUserId: params.adminUser.id,
        adminNickname: params.adminUser.nickname,
        targetUserId: target.id,
        targetNickname: target.nickname,
        skinsAffected: revokedSkins,
        skinsCount: revokedSkins.length,
        alreadyOwnedCount: summary.legitimateSpecialCount,
        totalSkinsAfter: summary.totalUnlockedCount,
        createdAt: nowIso,
      };
      db.skinGrantHistory.unshift(historyEntry);
      if (db.skinGrantHistory.length > 300) db.skinGrantHistory.length = 300;
      await addLocalAdminLog(
        params.adminUser.nickname,
        'REVOGAR_SKINS_EM_MASSA',
        `Removeu ${revokedSkins.length} skin(s) da concessão em massa de ${target.nickname} (preservadas ${summary.legitimateSpecialCount} especiais legítimas)`
      );
    }

    saveLocalDb();
    return {
      status: 'ok',
      revokedSkins,
      resetEquipped,
      summary,
      historyEntry,
    };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const uRes = await client.query<{
      id: string;
      nickname: string;
      nickname_lower: string;
      password_hash: string;
      recovery_hash: string | null;
      google_uid: string | null;
      role: 'player' | 'admin';
      must_change_password: boolean;
      equipped_skin: SkinId;
      unlocked_skins: SkinId[];
      gifted_skins: SkinId[];
      best_no_coin_time_ms: number;
      best_distance: number;
      best_score: number;
      total_matches: number;
      total_coins: number;
      favorite_skin: SkinId;
      skin_usage: Record<string, number>;
      created_at: string;
      last_seen_at: string;
    }>(
      cleanId
        ? `SELECT * FROM users WHERE id = $1 FOR UPDATE`
        : `SELECT * FROM users WHERE nickname_lower = $1 FOR UPDATE`,
      [cleanId || cleanNick]
    );

    const uRow = uRes.rows[0];
    if (!uRow) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }

    const revokedRes = await client.query<{ skin_id: SkinId }>(
      `UPDATE exclusive_skin_permissions
       SET active = FALSE, revoked_at = $1, updated_at = $1
       WHERE user_id = $2
         AND active = TRUE
         AND reason = 'admin_bulk_grant'
         AND skin_id = ANY($3::text[])
       RETURNING skin_id`,
      [nowIso, uRow.id, BULK_GRANTABLE_RESTRICTED_SKIN_IDS]
    );
    const revokedSkins = revokedRes.rows.map((r) => r.skin_id);

    const remainingRes = await client.query<{
      skin_id: ExclusiveSkinPermissionRecord['skinId'];
      reason: ExclusiveSkinPermissionRecord['reason'];
    }>(
      `SELECT skin_id, reason FROM exclusive_skin_permissions WHERE user_id = $1 AND active = TRUE`,
      [uRow.id]
    );
    const remainingPerms = remainingRes.rows.map((r) => ({
      skinId: r.skin_id,
      reason: r.reason,
    }));

    const remainingAllowed = new Set<SkinId>(remainingPerms.map((p) => p.skinId));
    if (uRow.role !== 'admin') remainingAllowed.delete('ratao_rei');

    let resetEquipped = false;
    let nextEquipped = uRow.equipped_skin;
    if (!isCommonSkinId(nextEquipped) && !remainingAllowed.has(nextEquipped)) {
      nextEquipped = 'ratao';
      resetEquipped = true;
    }

    const target: StoredUser = {
      id: uRow.id,
      nickname: uRow.nickname,
      nicknameLower: uRow.nickname_lower,
      passwordHash: uRow.password_hash,
      recoveryHash: uRow.recovery_hash,
      googleUid: uRow.google_uid ?? undefined,
      role: uRow.role,
      mustChangePassword: uRow.must_change_password,
      equippedSkin: nextEquipped,
      unlockedSkins: Array.isArray(uRow.unlocked_skins) ? uRow.unlocked_skins : [...COMMON_SKIN_IDS],
      giftedSkins: Array.isArray(uRow.gifted_skins) ? uRow.gifted_skins : [],
      bestNoCoinTimeMs: uRow.best_no_coin_time_ms,
      bestDistance: uRow.best_distance,
      bestScore: uRow.best_score,
      totalMatches: uRow.total_matches,
      totalCoins: uRow.total_coins,
      favoriteSkin: uRow.favorite_skin,
      skinUsage: uRow.skin_usage || {},
      createdAt: uRow.created_at,
      lastSeenAt: uRow.last_seen_at,
    };

    const summary = buildPlayerSkinsSummary(target, remainingPerms);

    await client.query(
      `UPDATE users SET unlocked_skins = $1::jsonb, equipped_skin = $2 WHERE id = $3`,
      [JSON.stringify(summary.unlockedSkinIds), nextEquipped, target.id]
    );

    let historyEntry: SkinGrantHistoryRecord | null = null;
    if (revokedSkins.length > 0) {
      historyEntry = {
        id: `sgh_${generateToken(8)}`,
        action: 'revoke_bulk',
        adminUserId: params.adminUser.id,
        adminNickname: params.adminUser.nickname,
        targetUserId: target.id,
        targetNickname: target.nickname,
        skinsAffected: revokedSkins,
        skinsCount: revokedSkins.length,
        alreadyOwnedCount: summary.legitimateSpecialCount,
        totalSkinsAfter: summary.totalUnlockedCount,
        createdAt: nowIso,
      };
      await client.query(
        `INSERT INTO skin_grant_history
           (id, action, admin_user_id, admin_nickname, target_user_id, target_nickname, skins_affected, skins_count, already_owned_count, total_skins_after, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [
          historyEntry.id,
          historyEntry.action,
          historyEntry.adminUserId,
          historyEntry.adminNickname,
          historyEntry.targetUserId,
          historyEntry.targetNickname,
          JSON.stringify(historyEntry.skinsAffected),
          historyEntry.skinsCount,
          historyEntry.alreadyOwnedCount,
          historyEntry.totalSkinsAfter,
          historyEntry.createdAt,
        ]
      );
      await client.query(
        `INSERT INTO admin_logs (id, admin_nickname, action, details, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `log_${generateToken(6)}`,
          params.adminUser.nickname,
          'REVOGAR_SKINS_EM_MASSA',
          `Removeu ${revokedSkins.length} skin(s) da concessão em massa de ${target.nickname} (preservadas ${summary.legitimateSpecialCount} especiais legítimas)`,
          nowIso,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      status: 'ok',
      revokedSkins,
      resetEquipped,
      summary,
      historyEntry,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function repoAdminListSkinGrantHistory(
  nicknameFilter?: string,
  limit = 60
): Promise<SkinGrantHistoryRecord[]> {
  const clean = nicknameFilter?.trim().toLowerCase() || '';
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return db.skinGrantHistory
      .filter(
        (h) =>
          !clean ||
          h.targetNickname.toLowerCase().includes(clean) ||
          h.adminNickname.toLowerCase().includes(clean)
      )
      .slice(0, safeLimit);
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  if (clean) {
    const escaped = clean.replace(/[\\%_]/g, '\\$&');
    return db
      .select()
      .from(skinGrantHistory)
      .where(
        or(
          ilike(skinGrantHistory.targetNickname, `%${escaped}%`),
          ilike(skinGrantHistory.adminNickname, `%${escaped}%`)
        )
      )
      .orderBy(desc(skinGrantHistory.createdAt))
      .limit(safeLimit);
  }

  return db
    .select()
    .from(skinGrantHistory)
    .orderBy(desc(skinGrantHistory.createdAt))
    .limit(safeLimit);
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

// --- Idempotent Coin Wallet Stats & Ledger ---

export async function repoGetWalletStatsForUser(userId: string): Promise<PlayerWalletStats> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const existing = db.playerWalletStats[userId];
    if (existing) return existing;
    const u = db.users[userId];
    return {
      userId,
      totalCoinsCollected: u?.totalCoins || 0,
      soloCoinsCollected: u?.totalCoins || 0,
      multiplayerCoinsCollected: 0,
      promoCoinsCollected: 0,
      spentCoins: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(playerWalletStats)
    .where(eq(playerWalletStats.userId, userId))
    .limit(1);
  if (rows[0]) return rows[0];

  const userRows = await db
    .select({ totalCoins: users.totalCoins })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const baseCoins = userRows[0]?.totalCoins || 0;
  return {
    userId,
    totalCoinsCollected: baseCoins,
    soloCoinsCollected: baseCoins,
    multiplayerCoinsCollected: 0,
    promoCoinsCollected: 0,
    spentCoins: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function repoCreditWalletCoins(params: {
  userId: string;
  amount: number;
  sourceType: 'solo' | 'coop' | 'x1' | 'promo';
  eventKey: string;
  skipUserTotalCoinsUpdate?: boolean;
}): Promise<{ credited: boolean; wallet: PlayerWalletStats }> {
  const { userId, amount, sourceType, eventKey, skipUserTotalCoinsUpdate } = params;
  const safeAmount = Math.max(0, Math.round(amount));
  const nowIso = new Date().toISOString();

  if (safeAmount <= 0) {
    return { credited: false, wallet: await repoGetWalletStatsForUser(userId) };
  }

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const dup = db.coinLedgerEvents.some((e) => e.eventKey === eventKey);
    if (dup) {
      return { credited: false, wallet: await repoGetWalletStatsForUser(userId) };
    }
    db.coinLedgerEvents.push({
      id: `cl_${generateToken(8)}`,
      eventKey,
      userId,
      sourceType,
      amount: safeAmount,
      createdAt: nowIso,
    });
    const u = db.users[userId];
    if (!db.playerWalletStats[userId]) {
      const priorTotal = skipUserTotalCoinsUpdate
        ? Math.max(0, (u?.totalCoins || 0) - safeAmount)
        : u?.totalCoins || 0;
      db.playerWalletStats[userId] = {
        userId,
        totalCoinsCollected: priorTotal,
        soloCoinsCollected: priorTotal,
        multiplayerCoinsCollected: 0,
        promoCoinsCollected: 0,
        spentCoins: 0,
        updatedAt: nowIso,
      };
    }
    const w = db.playerWalletStats[userId];
    w.totalCoinsCollected += safeAmount;
    if (sourceType === 'solo') w.soloCoinsCollected += safeAmount;
    else if (sourceType === 'promo') w.promoCoinsCollected += safeAmount;
    else w.multiplayerCoinsCollected += safeAmount;
    w.updatedAt = nowIso;

    if (!skipUserTotalCoinsUpdate && u) {
      u.totalCoins += safeAmount;
    }
    saveLocalDb();
    return { credited: true, wallet: w };
  }

  await ensureNeonSchema();
  const db = getNeonDb();

  const inserted = await db
    .insert(coinLedgerEvents)
    .values({
      id: `cl_${generateToken(8)}`,
      eventKey,
      userId,
      sourceType,
      amount: safeAmount,
      createdAt: nowIso,
    })
    .onConflictDoNothing()
    .returning({ id: coinLedgerEvents.id });

  if (inserted.length === 0) {
    return { credited: false, wallet: await repoGetWalletStatsForUser(userId) };
  }

  const existing = await db
    .select()
    .from(playerWalletStats)
    .where(eq(playerWalletStats.userId, userId))
    .limit(1);

  let baseTotal = existing[0]?.totalCoinsCollected ?? 0;
  let baseSolo = existing[0]?.soloCoinsCollected ?? 0;
  let baseMp = existing[0]?.multiplayerCoinsCollected ?? 0;
  let basePromo = existing[0]?.promoCoinsCollected ?? 0;

  if (!existing[0]) {
    const userRows = await db
      .select({ totalCoins: users.totalCoins })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const prior = skipUserTotalCoinsUpdate
      ? Math.max(0, (userRows[0]?.totalCoins ?? 0) - safeAmount)
      : userRows[0]?.totalCoins ?? 0;
    baseTotal = prior;
    baseSolo = prior;
  }

  const nextWallet: PlayerWalletStats = {
    userId,
    totalCoinsCollected: baseTotal + safeAmount,
    soloCoinsCollected: baseSolo + (sourceType === 'solo' ? safeAmount : 0),
    multiplayerCoinsCollected:
      baseMp + (sourceType === 'coop' || sourceType === 'x1' ? safeAmount : 0),
    promoCoinsCollected: basePromo + (sourceType === 'promo' ? safeAmount : 0),
    spentCoins: existing[0]?.spentCoins ?? 0,
    updatedAt: nowIso,
  };

  await db
    .insert(playerWalletStats)
    .values(nextWallet)
    .onConflictDoUpdate({
      target: playerWalletStats.userId,
      set: {
        totalCoinsCollected: nextWallet.totalCoinsCollected,
        soloCoinsCollected: nextWallet.soloCoinsCollected,
        multiplayerCoinsCollected: nextWallet.multiplayerCoinsCollected,
        promoCoinsCollected: nextWallet.promoCoinsCollected,
        updatedAt: nowIso,
      },
    });

  if (!skipUserTotalCoinsUpdate) {
    await db
      .update(users)
      .set({ totalCoins: sql`${users.totalCoins} + ${safeAmount}` })
      .where(eq(users.id, userId));
  }

  return { credited: true, wallet: nextWallet };
}


