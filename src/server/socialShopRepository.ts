import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { ensureNeonSchema, getNeonDb, getNeonPool, isNeonConfigured } from '../db/neon.ts';
import {
  activeMatches,
  friendMessages,
  friendships,
  matchSkateUses,
  multiplayerRooms,
  notificationHistory,
  playerCapes,
  playerLiveModeConfigs,
  playerSkateInventory,
  playerWalletStats,
  shopTransactions,
  users,
} from '../db/schema.ts';
import {
  CAPES_CATALOG,
  CapeBackgroundStyle,
  CapeId,
  DEFAULT_LIVE_MODE_CONFIG,
  DEFAULT_PLAYER_CAPE_CONFIG,
  FriendEntry,
  FriendPrivateMessage,
  FriendRequestEntry,
  FriendSearchResult,
  FriendsOverviewPayload,
  LiveOverlayFontFamily,
  LiveOverlayPosition,
  LiveOverlayText,
  PlayerCapeConfig,
  PlayerLiveModeConfig,
  PlayerOnlineStatus,
  PlayerSkateInventoryItem,
  PlayerWalletStats,
  SkateId,
  getSkateDefinition,
  isValidSkateId,
} from '../shared/constants.ts';
import { repoGetActiveVoiceCallUserIds } from './callRepository.ts';
import { generateToken } from './crypto.ts';
import { getDb as getLocalDb, saveDb as saveLocalDb } from './store.ts';

const VALID_CAPE_IDS = new Set<CapeId>(['none', 'capa_personalizavel', 'capa_camisa_10']);
const VALID_CAPE_STYLES = new Set<CapeBackgroundStyle>([
  'solid',
  'striped',
  'gradient',
  'checkered',
  'stars',
]);
const VALID_LIVE_POSITIONS = new Set<LiveOverlayPosition>([
  'top_left',
  'top_center',
  'top_right',
  'center_left',
  'center_right',
  'bottom_left',
  'bottom_center',
  'bottom_right',
]);
const VALID_LIVE_FONTS = new Set<LiveOverlayFontFamily>(['display', 'sans', 'mono']);

function sanitizeHexColor(val: unknown, fallback: string): string {
  if (typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim())) {
    return val.trim().toLowerCase();
  }
  return fallback;
}

function sanitizeSafeText(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  const cleaned = val
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, maxLen);
  return cleaned;
}

function makePairIds(userA: string, userB: string): [string, string] {
  return userA < userB ? [userA, userB] : [userB, userA];
}

// ============================================================
// CAPES SYSTEM
// ============================================================

export function normalizePlayerCapeConfig(raw: unknown): PlayerCapeConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const equippedCapeId: CapeId =
    typeof obj.equippedCapeId === 'string' && VALID_CAPE_IDS.has(obj.equippedCapeId as CapeId)
      ? (obj.equippedCapeId as CapeId)
      : 'none';
  const defForDefaults =
    CAPES_CATALOG.find((c) => c.id === equippedCapeId) ?? CAPES_CATALOG[0];
  const backgroundStyle: CapeBackgroundStyle =
    typeof obj.backgroundStyle === 'string' &&
    VALID_CAPE_STYLES.has(obj.backgroundStyle as CapeBackgroundStyle)
      ? (obj.backgroundStyle as CapeBackgroundStyle)
      : DEFAULT_PLAYER_CAPE_CONFIG.backgroundStyle;

  return {
    equippedCapeId,
    customText: sanitizeSafeText(obj.customText, 14, DEFAULT_PLAYER_CAPE_CONFIG.customText),
    shirt10Name: sanitizeSafeText(obj.shirt10Name, 12, DEFAULT_PLAYER_CAPE_CONFIG.shirt10Name),
    primaryColor: sanitizeHexColor(obj.primaryColor, defForDefaults.defaultPrimaryColor),
    secondaryColor: sanitizeHexColor(obj.secondaryColor, defForDefaults.defaultSecondaryColor),
    textColor: sanitizeHexColor(obj.textColor, defForDefaults.defaultTextColor),
    backgroundStyle,
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt
        ? obj.updatedAt
        : new Date().toISOString(),
  };
}

export async function repoGetPlayerCapeConfig(userId: string): Promise<PlayerCapeConfig> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const existing = db.playerCapes[userId];
    return existing ? normalizePlayerCapeConfig(existing) : { ...DEFAULT_PLAYER_CAPE_CONFIG };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(playerCapes)
    .where(eq(playerCapes.userId, userId))
    .limit(1);
  if (!rows[0]) return { ...DEFAULT_PLAYER_CAPE_CONFIG };
  return normalizePlayerCapeConfig(rows[0].configJson);
}

export async function repoUpdatePlayerCapeConfig(
  userId: string,
  rawConfig: unknown
): Promise<PlayerCapeConfig> {
  const normalized = normalizePlayerCapeConfig(rawConfig);
  normalized.updatedAt = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.playerCapes[userId] = normalized;
    saveLocalDb();
    return normalized;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db
    .insert(playerCapes)
    .values({
      userId,
      configJson: normalized,
      updatedAt: normalized.updatedAt,
    })
    .onConflictDoUpdate({
      target: playerCapes.userId,
      set: {
        configJson: normalized,
        updatedAt: normalized.updatedAt,
      },
    });
  return normalized;
}

// ============================================================
// LIVE MODE SYSTEM
// ============================================================

export function normalizePlayerLiveModeConfig(raw: unknown): PlayerLiveModeConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const enabled = Boolean(obj.enabled);
  const rawTexts = Array.isArray(obj.texts) ? obj.texts : DEFAULT_LIVE_MODE_CONFIG.texts;

  const texts: LiveOverlayText[] = rawTexts.slice(0, 10).map((item, idx) => {
    const t = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const rawSize = Number(t.fontSize);
    const fontSize = Number.isFinite(rawSize)
      ? Math.max(12, Math.min(48, Math.round(rawSize)))
      : 22;
    const rawDur = Number(t.durationSec);
    const durationSec = Number.isFinite(rawDur)
      ? Math.max(2, Math.min(60, Math.round(rawDur)))
      : 6;
    const position: LiveOverlayPosition =
      typeof t.position === 'string' && VALID_LIVE_POSITIONS.has(t.position as LiveOverlayPosition)
        ? (t.position as LiveOverlayPosition)
        : 'top_center';
    const fontFamily: LiveOverlayFontFamily =
      typeof t.fontFamily === 'string' && VALID_LIVE_FONTS.has(t.fontFamily as LiveOverlayFontFamily)
        ? (t.fontFamily as LiveOverlayFontFamily)
        : 'display';

    return {
      id: sanitizeSafeText(t.id, 32, `live_${idx + 1}`) || `live_${idx + 1}`,
      text: sanitizeSafeText(t.text, 80, 'AO VIVO!'),
      color: sanitizeHexColor(t.color, '#facc15'),
      fontSize,
      position,
      fontFamily,
      shadow: t.shadow !== false,
      durationSec,
      enabled: t.enabled !== false,
    };
  });

  return {
    enabled,
    texts,
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt
        ? obj.updatedAt
        : new Date().toISOString(),
  };
}

export async function repoGetPlayerLiveModeConfig(userId: string): Promise<PlayerLiveModeConfig> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const existing = db.playerLiveModeConfigs[userId];
    return existing ? normalizePlayerLiveModeConfig(existing) : { ...DEFAULT_LIVE_MODE_CONFIG };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(playerLiveModeConfigs)
    .where(eq(playerLiveModeConfigs.userId, userId))
    .limit(1);
  if (!rows[0]) return { ...DEFAULT_LIVE_MODE_CONFIG };
  return normalizePlayerLiveModeConfig(rows[0].configJson);
}

export async function repoUpdatePlayerLiveModeConfig(
  userId: string,
  rawConfig: unknown
): Promise<PlayerLiveModeConfig> {
  const normalized = normalizePlayerLiveModeConfig(rawConfig);
  normalized.updatedAt = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    db.playerLiveModeConfigs[userId] = normalized;
    saveLocalDb();
    return normalized;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db
    .insert(playerLiveModeConfigs)
    .values({
      userId,
      configJson: normalized,
      updatedAt: normalized.updatedAt,
    })
    .onConflictDoUpdate({
      target: playerLiveModeConfigs.userId,
      set: {
        configJson: normalized,
        updatedAt: normalized.updatedAt,
      },
    });
  return normalized;
}

// ============================================================
// SHOP & SKATES SYSTEM (ATOMIC BALANCES + CHARGES)
// ============================================================

export function computeAvailableCoins(
  walletStats: Pick<PlayerWalletStats, 'totalCoinsCollected' | 'spentCoins'>,
  userTotalCoins = 0
): number {
  const gross = Math.max(walletStats.totalCoinsCollected, userTotalCoins);
  return Math.max(0, gross - Math.max(0, walletStats.spentCoins || 0));
}

export async function repoGetPlayerSkateInventory(
  userId: string
): Promise<PlayerSkateInventoryItem[]> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    return [...(db.playerSkateInventory[userId] || [])];
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(playerSkateInventory)
    .where(eq(playerSkateInventory.userId, userId));
  return rows.map((r) => ({
    skateId: r.skateId,
    charges: r.charges,
    unlockedAt: r.unlockedAt,
    updatedAt: r.updatedAt,
  }));
}

export async function repoGetShopState(userId: string): Promise<{
  availableCoins: number;
  totalCoinsCollected: number;
  spentCoins: number;
  equippedSkateId: SkateId | null;
  inventory: PlayerSkateInventoryItem[];
}> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const u = db.users[userId];
    const wallet = db.playerWalletStats[userId];
    const totalCoinsCollected = Math.max(wallet?.totalCoinsCollected ?? 0, u?.totalCoins ?? 0);
    const spentCoins = wallet?.spentCoins ?? 0;
    const availableCoins = Math.max(0, totalCoinsCollected - spentCoins);
    return {
      availableCoins,
      totalCoinsCollected,
      spentCoins,
      equippedSkateId: u?.equippedSkateId ?? null,
      inventory: [...(db.playerSkateInventory[userId] || [])],
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const [userRows, walletRows, invRows] = await Promise.all([
    db
      .select({ totalCoins: users.totalCoins, equippedSkateId: users.equippedSkateId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db.select().from(playerWalletStats).where(eq(playerWalletStats.userId, userId)).limit(1),
    db.select().from(playerSkateInventory).where(eq(playerSkateInventory.userId, userId)),
  ]);

  const totalCoinsCollected = Math.max(
    walletRows[0]?.totalCoinsCollected ?? 0,
    userRows[0]?.totalCoins ?? 0
  );
  const spentCoins = walletRows[0]?.spentCoins ?? 0;
  const availableCoins = Math.max(0, totalCoinsCollected - spentCoins);
  return {
    availableCoins,
    totalCoinsCollected,
    spentCoins,
    equippedSkateId: userRows[0]?.equippedSkateId ?? null,
    inventory: invRows.map((r) => ({
      skateId: r.skateId,
      charges: r.charges,
      unlockedAt: r.unlockedAt,
      updatedAt: r.updatedAt,
    })),
  };
}

export async function repoBuySkate(params: {
  userId: string;
  skateId: SkateId;
  quantity?: number;
}): Promise<
  | {
      status: 'ok';
      availableCoins: number;
      spentCoins: number;
      equippedSkateId: SkateId | null;
      inventory: PlayerSkateInventoryItem[];
      purchased: PlayerSkateInventoryItem;
    }
  | { status: 'invalid_skate' | 'invalid_quantity' | 'user_not_found' }
  | { status: 'insufficient_coins'; availableCoins: number; requiredCoins: number }
> {
  const { userId, skateId } = params;
  if (!isValidSkateId(skateId)) {
    return { status: 'invalid_skate' };
  }
  const qty = Math.floor(Number(params.quantity ?? 1));
  if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
    return { status: 'invalid_quantity' };
  }

  const def = getSkateDefinition(skateId);
  const totalCost = def.price * qty;
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const u = db.users[userId];
    if (!u) return { status: 'user_not_found' };

    if (!db.playerWalletStats[userId]) {
      db.playerWalletStats[userId] = {
        userId,
        totalCoinsCollected: u.totalCoins,
        soloCoinsCollected: u.totalCoins,
        multiplayerCoinsCollected: 0,
        promoCoinsCollected: 0,
        spentCoins: 0,
        updatedAt: nowIso,
      };
    }
    const wallet = db.playerWalletStats[userId];
    const gross = Math.max(wallet.totalCoinsCollected, u.totalCoins);
    wallet.totalCoinsCollected = gross;
    const balanceBefore = Math.max(0, gross - wallet.spentCoins);
    if (balanceBefore < totalCost) {
      return {
        status: 'insufficient_coins',
        availableCoins: balanceBefore,
        requiredCoins: totalCost,
      };
    }

    wallet.spentCoins += totalCost;
    wallet.updatedAt = nowIso;
    const balanceAfter = balanceBefore - totalCost;

    const list = db.playerSkateInventory[userId] || [];
    let item = list.find((s) => s.skateId === skateId);
    if (!item) {
      item = {
        skateId,
        charges: qty,
        unlockedAt: nowIso,
        updatedAt: nowIso,
      };
      list.push(item);
    } else {
      item.charges += qty;
      item.updatedAt = nowIso;
    }
    db.playerSkateInventory[userId] = list;

    if (!u.equippedSkateId) {
      u.equippedSkateId = skateId;
    }

    db.shopTransactions.push({
      id: `stx_${generateToken(8)}`,
      userId,
      itemType: 'skate',
      itemId: skateId,
      quantity: qty,
      unitPrice: def.price,
      totalCost,
      balanceBefore,
      balanceAfter,
      createdAt: nowIso,
    });
    saveLocalDb();

    return {
      status: 'ok',
      availableCoins: balanceAfter,
      spentCoins: wallet.spentCoins,
      equippedSkateId: u.equippedSkateId ?? null,
      inventory: [...list],
      purchased: { ...item },
    };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userRes = await client.query<{ total_coins: number; equipped_skate_id: SkateId | null }>(
      `SELECT total_coins, equipped_skate_id FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { status: 'user_not_found' };
    }
    const uRow = userRes.rows[0];

    const walletRes = await client.query<{
      total_coins_collected: number;
      spent_coins: number;
    }>(
      `SELECT total_coins_collected, spent_coins FROM player_wallet_stats WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    const gross = Math.max(walletRes.rows[0]?.total_coins_collected ?? 0, uRow.total_coins ?? 0);
    const prevSpent = walletRes.rows[0]?.spent_coins ?? 0;
    const balanceBefore = Math.max(0, gross - prevSpent);

    if (balanceBefore < totalCost) {
      await client.query('ROLLBACK');
      return {
        status: 'insufficient_coins',
        availableCoins: balanceBefore,
        requiredCoins: totalCost,
      };
    }

    const nextSpent = prevSpent + totalCost;
    const balanceAfter = balanceBefore - totalCost;

    await client.query(
      `INSERT INTO player_wallet_stats (user_id, total_coins_collected, solo_coins_collected, multiplayer_coins_collected, promo_coins_collected, spent_coins, updated_at)
       VALUES ($1, $2, $2, 0, 0, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         total_coins_collected = GREATEST(player_wallet_stats.total_coins_collected, EXCLUDED.total_coins_collected),
         spent_coins = $3,
         updated_at = $4`,
      [userId, gross, nextSpent, nowIso]
    );

    const invRes = await client.query<{
      skate_id: SkateId;
      charges: number;
      unlocked_at: string;
      updated_at: string;
    }>(
      `INSERT INTO player_skate_inventory (id, user_id, skate_id, charges, unlocked_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (user_id, skate_id) DO UPDATE SET
         charges = player_skate_inventory.charges + EXCLUDED.charges,
         updated_at = EXCLUDED.updated_at
       RETURNING skate_id, charges, unlocked_at, updated_at`,
      [`skinv_${generateToken(8)}`, userId, skateId, qty, nowIso]
    );

    let equippedSkateId = uRow.equipped_skate_id;
    if (!equippedSkateId) {
      equippedSkateId = skateId;
      await client.query(`UPDATE users SET equipped_skate_id = $1 WHERE id = $2`, [
        equippedSkateId,
        userId,
      ]);
    }

    await client.query(
      `INSERT INTO shop_transactions (id, user_id, item_type, item_id, quantity, unit_price, total_cost, balance_before, balance_after, created_at)
       VALUES ($1, $2, 'skate', $3, $4, $5, $6, $7, $8, $9)`,
      [
        `stx_${generateToken(8)}`,
        userId,
        skateId,
        qty,
        def.price,
        totalCost,
        balanceBefore,
        balanceAfter,
        nowIso,
      ]
    );

    const allInvRes = await client.query<{
      skate_id: SkateId;
      charges: number;
      unlocked_at: string;
      updated_at: string;
    }>(
      `SELECT skate_id, charges, unlocked_at, updated_at FROM player_skate_inventory WHERE user_id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    const purchasedRow = invRes.rows[0];
    return {
      status: 'ok',
      availableCoins: balanceAfter,
      spentCoins: nextSpent,
      equippedSkateId,
      inventory: allInvRes.rows.map((r) => ({
        skateId: r.skate_id,
        charges: r.charges,
        unlockedAt: r.unlocked_at,
        updatedAt: r.updated_at,
      })),
      purchased: {
        skateId: purchasedRow.skate_id,
        charges: purchasedRow.charges,
        unlockedAt: purchasedRow.unlocked_at,
        updatedAt: purchasedRow.updated_at,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function repoEquipSkate(
  userId: string,
  skateId: SkateId | null
): Promise<{ ok: boolean; error?: string; equippedSkateId: SkateId | null }> {
  if (skateId !== null && !isValidSkateId(skateId)) {
    return { ok: false, error: 'Skate inválido.', equippedSkateId: null };
  }

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const u = db.users[userId];
    if (!u) return { ok: false, error: 'Jogador não encontrado.', equippedSkateId: null };
    if (skateId !== null) {
      const owned = (db.playerSkateInventory[userId] || []).find((i) => i.skateId === skateId);
      if (!owned) {
        return { ok: false, error: 'Compre este skate na loja antes de equipá-lo.', equippedSkateId: u.equippedSkateId ?? null };
      }
    }
    u.equippedSkateId = skateId;
    saveLocalDb();
    return { ok: true, equippedSkateId: skateId };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  if (skateId !== null) {
    const inv = await db
      .select()
      .from(playerSkateInventory)
      .where(and(eq(playerSkateInventory.userId, userId), eq(playerSkateInventory.skateId, skateId)))
      .limit(1);
    if (!inv[0]) {
      return { ok: false, error: 'Compre este skate na loja antes de equipá-lo.', equippedSkateId: null };
    }
  }
  await db.update(users).set({ equippedSkateId: skateId }).where(eq(users.id, userId));
  return { ok: true, equippedSkateId: skateId };
}

export async function repoConsumeMatchSkateUse(params: {
  userId: string;
  matchId: string;
  skateId: SkateId;
  mode: string;
  eventKey: string;
}): Promise<
  | { consumed: true; alreadyRecorded: boolean; remainingCharges: number; skateId: SkateId }
  | { consumed: false; reason: 'invalid_skate' | 'no_charges' }
> {
  const { userId, matchId, skateId, mode, eventKey } = params;
  if (!isValidSkateId(skateId)) {
    return { consumed: false, reason: 'invalid_skate' };
  }
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const list = db.playerSkateInventory[userId] || [];
    const item = list.find((i) => i.skateId === skateId);
    const existing = db.matchSkateUses.find((u) => u.eventKey === eventKey);
    if (existing) {
      return {
        consumed: true,
        alreadyRecorded: true,
        remainingCharges: item?.charges ?? 0,
        skateId,
      };
    }
    if (!item || item.charges < 1) {
      return { consumed: false, reason: 'no_charges' };
    }
    item.charges -= 1;
    item.updatedAt = nowIso;
    db.matchSkateUses.push({
      id: `msu_${generateToken(8)}`,
      eventKey,
      userId,
      matchId,
      skateId,
      mode,
      createdAt: nowIso,
    });
    saveLocalDb();
    return {
      consumed: true,
      alreadyRecorded: false,
      remainingCharges: item.charges,
      skateId,
    };
  }

  await ensureNeonSchema();
  const pool = getNeonPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const dupCheck = await client.query<{ id: string }>(
      `SELECT id FROM match_skate_uses WHERE event_key = $1 LIMIT 1`,
      [eventKey]
    );
    if (dupCheck.rows.length > 0) {
      const curInv = await client.query<{ charges: number }>(
        `SELECT charges FROM player_skate_inventory WHERE user_id = $1 AND skate_id = $2 LIMIT 1`,
        [userId, skateId]
      );
      await client.query('COMMIT');
      return {
        consumed: true,
        alreadyRecorded: true,
        remainingCharges: curInv.rows[0]?.charges ?? 0,
        skateId,
      };
    }

    const invRes = await client.query<{ id: string; charges: number }>(
      `SELECT id, charges FROM player_skate_inventory
       WHERE user_id = $1 AND skate_id = $2 FOR UPDATE`,
      [userId, skateId]
    );
    if (invRes.rows.length === 0 || invRes.rows[0].charges < 1) {
      await client.query('ROLLBACK');
      return { consumed: false, reason: 'no_charges' };
    }

    const nextCharges = invRes.rows[0].charges - 1;
    await client.query(
      `UPDATE player_skate_inventory SET charges = $1, updated_at = $2 WHERE id = $3`,
      [nextCharges, nowIso, invRes.rows[0].id]
    );
    await client.query(
      `INSERT INTO match_skate_uses (id, event_key, user_id, match_id, skate_id, mode, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`msu_${generateToken(8)}`, eventKey, userId, matchId, skateId, mode, nowIso]
    );

    await client.query('COMMIT');
    return {
      consumed: true,
      alreadyRecorded: false,
      remainingCharges: nextCharges,
      skateId,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// FRIENDS, ONLINE STATUS & PRIVATE CHAT
// ============================================================

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const ACTIVE_SOLO_MATCH_WINDOW_MS = 20 * 60 * 1000;

function computeStatus(
  userId: string,
  lastSeenAt: string,
  inMatchUserIds: Set<string>,
  nowMs: number
): PlayerOnlineStatus {
  const lastSeenMs = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > ONLINE_WINDOW_MS) {
    return 'offline';
  }
  if (inMatchUserIds.has(userId)) {
    return 'in_match';
  }
  return 'online';
}

async function getActiveMatchUserSet(userIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (userIds.length === 0) return result;
  const nowMs = Date.now();
  const minSoloStartedAt = nowMs - ACTIVE_SOLO_MATCH_WINDOW_MS;

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const idSet = new Set(userIds);
    for (const m of Object.values(db.activeMatches)) {
      if (!m.completed && m.startedAt >= minSoloStartedAt && idSet.has(m.userId)) {
        result.add(m.userId);
      }
    }
    for (const r of Object.values(db.multiplayerRooms)) {
      if (r.status === 'in_progress' || r.status === 'countdown') {
        if (idSet.has(r.hostUserId)) result.add(r.hostUserId);
        if (r.guestUserId && idSet.has(r.guestUserId)) result.add(r.guestUserId);
      }
    }
    return result;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const [soloRows, mpRows] = await Promise.all([
    db
      .select({ userId: activeMatches.userId })
      .from(activeMatches)
      .where(and(inArray(activeMatches.userId, userIds), eq(activeMatches.completed, false))),
    db
      .select({ hostUserId: multiplayerRooms.hostUserId, guestUserId: multiplayerRooms.guestUserId })
      .from(multiplayerRooms)
      .where(
        and(
          or(eq(multiplayerRooms.status, 'in_progress'), eq(multiplayerRooms.status, 'countdown')),
          or(
            inArray(multiplayerRooms.hostUserId, userIds),
            inArray(multiplayerRooms.guestUserId, userIds)
          )
        )
      ),
  ]);

  for (const r of soloRows) result.add(r.userId);
  const idSet = new Set(userIds);
  for (const r of mpRows) {
    if (idSet.has(r.hostUserId)) result.add(r.hostUserId);
    if (r.guestUserId && idSet.has(r.guestUserId)) result.add(r.guestUserId);
  }
  return result;
}

export async function repoSearchPlayersForFriends(
  requesterId: string,
  query: string
): Promise<FriendSearchResult[]> {
  const clean = query.trim().toLowerCase();
  if (clean.length < 1) return [];
  const nowMs = Date.now();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const matches = Object.values(db.users)
      .filter((u) => u.id !== requesterId && u.nicknameLower.includes(clean))
      .slice(0, 15);
    const matchIds = matches.map((m) => m.id);
    const [inMatchSet, inCallSet] = await Promise.all([
      getActiveMatchUserSet(matchIds),
      repoGetActiveVoiceCallUserIds(matchIds),
    ]);

    return matches.map((u) => {
      const [low, high] = makePairIds(requesterId, u.id);
      const ship = db.friendships.find((f) => f.userLowId === low && f.userHighId === high);
      let relation: FriendSearchResult['relation'] = 'none';
      if (ship?.status === 'accepted') relation = 'friend';
      else if (ship?.status === 'pending') {
        relation = ship.requestedByUserId === requesterId ? 'pending_outgoing' : 'pending_incoming';
      }
      return {
        id: u.id,
        nickname: u.nickname,
        equippedSkin: u.equippedSkin,
        status: computeStatus(u.id, u.lastSeenAt, inMatchSet, nowMs),
        inCall: inCallSet.has(u.id),
        relation,
      };
    });
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const escaped = clean.replace(/[\\%_]/g, '\\$&');
  const rows = await db
    .select({
      id: users.id,
      nickname: users.nickname,
      equippedSkin: users.equippedSkin,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(ilike(users.nicknameLower, `%${escaped}%`))
    .limit(18);

  const candidates = rows.filter((u) => u.id !== requesterId).slice(0, 15);
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((c) => c.id);
  const [ships, inMatchSet, inCallSet] = await Promise.all([
    db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userLowId, requesterId), eq(friendships.userHighId, requesterId))),
    getActiveMatchUserSet(candidateIds),
    repoGetActiveVoiceCallUserIds(candidateIds),
  ]);

  return candidates.map((u) => {
    const [low, high] = makePairIds(requesterId, u.id);
    const ship = ships.find((f) => f.userLowId === low && f.userHighId === high);
    let relation: FriendSearchResult['relation'] = 'none';
    if (ship?.status === 'accepted') relation = 'friend';
    else if (ship?.status === 'pending') {
      relation = ship.requestedByUserId === requesterId ? 'pending_outgoing' : 'pending_incoming';
    }
    return {
      id: u.id,
      nickname: u.nickname,
      equippedSkin: u.equippedSkin,
      status: computeStatus(u.id, u.lastSeenAt, inMatchSet, nowMs),
      inCall: inCallSet.has(u.id),
      relation,
    };
  });
}

export async function repoGetFriendsOverview(userId: string): Promise<FriendsOverviewPayload> {
  const nowMs = Date.now();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const myShips = db.friendships.filter(
      (f) =>
        (f.userLowId === userId || f.userHighId === userId) &&
        (f.status === 'accepted' || f.status === 'pending')
    );
    const peerIds = Array.from(
      new Set(myShips.map((f) => (f.userLowId === userId ? f.userHighId : f.userLowId)))
    );
    const [inMatchSet, inCallSet] = await Promise.all([
      getActiveMatchUserSet(peerIds),
      repoGetActiveVoiceCallUserIds(peerIds),
    ]);

    const friends: FriendEntry[] = [];
    const incomingRequests: FriendRequestEntry[] = [];
    const outgoingRequests: FriendRequestEntry[] = [];

    for (const f of myShips) {
      const peerId = f.userLowId === userId ? f.userHighId : f.userLowId;
      const peer = db.users[peerId];
      if (!peer) continue;

      if (f.status === 'accepted') {
        const unreadCount = db.friendMessages.filter(
          (m) => m.friendshipId === f.id && m.receiverUserId === userId && !m.read
        ).length;
        friends.push({
          friendshipId: f.id,
          userId: peer.id,
          nickname: peer.nickname,
          equippedSkin: peer.equippedSkin,
          status: computeStatus(peer.id, peer.lastSeenAt, inMatchSet, nowMs),
          inCall: inCallSet.has(peer.id),
          unreadCount,
          lastSeenAt: peer.lastSeenAt,
          since: f.acceptedAt || f.updatedAt,
        });
      } else if (f.status === 'pending') {
        const direction = f.requestedByUserId === userId ? 'outgoing' : 'incoming';
        const entry: FriendRequestEntry = {
          id: f.id,
          userId: peer.id,
          nickname: peer.nickname,
          equippedSkin: peer.equippedSkin,
          direction,
          createdAt: f.createdAt,
        };
        if (direction === 'incoming') incomingRequests.push(entry);
        else outgoingRequests.push(entry);
      }
    }

    const statusOrder: Record<PlayerOnlineStatus, number> = {
      in_match: 0,
      online: 1,
      offline: 2,
    };
    friends.sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        b.unreadCount - a.unreadCount ||
        a.nickname.localeCompare(b.nickname)
    );

    return {
      friends,
      incomingRequests,
      outgoingRequests,
      totalUnreadMessages: friends.reduce((acc, f) => acc + f.unreadCount, 0),
      pendingRequestsCount: incomingRequests.length,
    };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const myShips = await db
    .select()
    .from(friendships)
    .where(
      and(
        or(eq(friendships.userLowId, userId), eq(friendships.userHighId, userId)),
        or(eq(friendships.status, 'accepted'), eq(friendships.status, 'pending'))
      )
    );

  if (myShips.length === 0) {
    return {
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      totalUnreadMessages: 0,
      pendingRequestsCount: 0,
    };
  }

  const peerIds = Array.from(
    new Set(myShips.map((f) => (f.userLowId === userId ? f.userHighId : f.userLowId)))
  );

  const [peerRows, unreadRows, inMatchSet, inCallSet] = await Promise.all([
    db
      .select({
        id: users.id,
        nickname: users.nickname,
        equippedSkin: users.equippedSkin,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .where(inArray(users.id, peerIds)),
    db
      .select({
        friendshipId: friendMessages.friendshipId,
      })
      .from(friendMessages)
      .where(and(eq(friendMessages.receiverUserId, userId), eq(friendMessages.read, false))),
    getActiveMatchUserSet(peerIds),
    repoGetActiveVoiceCallUserIds(peerIds),
  ]);

  const peerMap = new Map(peerRows.map((p) => [p.id, p]));
  const unreadByShip = new Map<string, number>();
  for (const u of unreadRows) {
    unreadByShip.set(u.friendshipId, (unreadByShip.get(u.friendshipId) || 0) + 1);
  }

  const friends: FriendEntry[] = [];
  const incomingRequests: FriendRequestEntry[] = [];
  const outgoingRequests: FriendRequestEntry[] = [];

  for (const f of myShips) {
    const peerId = f.userLowId === userId ? f.userHighId : f.userLowId;
    const peer = peerMap.get(peerId);
    if (!peer) continue;

    if (f.status === 'accepted') {
      friends.push({
        friendshipId: f.id,
        userId: peer.id,
        nickname: peer.nickname,
        equippedSkin: peer.equippedSkin,
        status: computeStatus(peer.id, peer.lastSeenAt, inMatchSet, nowMs),
        inCall: inCallSet.has(peer.id),
        unreadCount: unreadByShip.get(f.id) || 0,
        lastSeenAt: peer.lastSeenAt,
        since: f.acceptedAt || f.updatedAt,
      });
    } else if (f.status === 'pending') {
      const direction = f.requestedByUserId === userId ? 'outgoing' : 'incoming';
      const entry: FriendRequestEntry = {
        id: f.id,
        userId: peer.id,
        nickname: peer.nickname,
        equippedSkin: peer.equippedSkin,
        direction,
        createdAt: f.createdAt,
      };
      if (direction === 'incoming') incomingRequests.push(entry);
      else outgoingRequests.push(entry);
    }
  }

  const statusOrder: Record<PlayerOnlineStatus, number> = {
    in_match: 0,
    online: 1,
    offline: 2,
  };
  friends.sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      b.unreadCount - a.unreadCount ||
      a.nickname.localeCompare(b.nickname)
  );

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    totalUnreadMessages: friends.reduce((acc, f) => acc + f.unreadCount, 0),
    pendingRequestsCount: incomingRequests.length,
  };
}

export async function repoGetUnreadAndPendingCounts(
  userId: string
): Promise<{ unreadMessages: number; pendingRequests: number }> {
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const unreadMessages = db.friendMessages.filter(
      (m) => m.receiverUserId === userId && !m.read
    ).length;
    const pendingRequests = db.friendships.filter(
      (f) =>
        f.status === 'pending' &&
        (f.userLowId === userId || f.userHighId === userId) &&
        f.requestedByUserId !== userId
    ).length;
    return { unreadMessages, pendingRequests };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const [unreadRows, pendingRows] = await Promise.all([
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(friendMessages)
      .where(and(eq(friendMessages.receiverUserId, userId), eq(friendMessages.read, false))),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'pending'),
          or(eq(friendships.userLowId, userId), eq(friendships.userHighId, userId)),
          sql`${friendships.requestedByUserId} <> ${userId}`
        )
      ),
  ]);

  return {
    unreadMessages: Number(unreadRows[0]?.cnt ?? 0),
    pendingRequests: Number(pendingRows[0]?.cnt ?? 0),
  };
}

export async function repoSendFriendRequest(params: {
  requesterId: string;
  requesterNickname: string;
  targetUserId?: string;
  targetNickname?: string;
}): Promise<
  | { status: 'ok' | 'auto_accepted'; friendshipId: string; targetNickname: string }
  | { status: 'not_found' | 'self_request' | 'already_friends' | 'already_pending' }
> {
  const { requesterId, requesterNickname, targetUserId, targetNickname } = params;
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const target = targetUserId
      ? db.users[targetUserId]
      : targetNickname
      ? Object.values(db.users).find(
          (u) => u.nicknameLower === targetNickname.trim().toLowerCase()
        )
      : undefined;
    if (!target) return { status: 'not_found' };
    if (target.id === requesterId) return { status: 'self_request' };

    const [low, high] = makePairIds(requesterId, target.id);
    const existing = db.friendships.find((f) => f.userLowId === low && f.userHighId === high);

    if (existing) {
      if (existing.status === 'accepted') return { status: 'already_friends' };
      if (existing.status === 'pending') {
        if (existing.requestedByUserId !== requesterId) {
          existing.status = 'accepted';
          existing.acceptedAt = nowIso;
          existing.updatedAt = nowIso;
          saveLocalDb();
          return {
            status: 'auto_accepted',
            friendshipId: existing.id,
            targetNickname: target.nickname,
          };
        }
        return { status: 'already_pending' };
      }
      existing.requestedByUserId = requesterId;
      existing.status = 'pending';
      existing.createdAt = nowIso;
      existing.updatedAt = nowIso;
      existing.acceptedAt = null;
      db.notificationHistory.unshift({
        id: `ntf_${generateToken(8)}`,
        userId: target.id,
        kind: 'system',
        title: 'Nova solicitação de amizade',
        message: `${requesterNickname} enviou um pedido de amizade para você.`,
        seen: false,
        createdAt: nowIso,
      });
      saveLocalDb();
      return { status: 'ok', friendshipId: existing.id, targetNickname: target.nickname };
    }

    const id = `fr_${generateToken(8)}`;
    db.friendships.push({
      id,
      userLowId: low,
      userHighId: high,
      requestedByUserId: requesterId,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
      acceptedAt: null,
    });
    db.notificationHistory.unshift({
      id: `ntf_${generateToken(8)}`,
      userId: target.id,
      kind: 'system',
      title: 'Nova solicitação de amizade',
      message: `${requesterNickname} enviou um pedido de amizade para você.`,
      seen: false,
      createdAt: nowIso,
    });
    saveLocalDb();
    return { status: 'ok', friendshipId: id, targetNickname: target.nickname };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const targetRows = targetUserId
    ? await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)
    : targetNickname
    ? await db
        .select()
        .from(users)
        .where(eq(users.nicknameLower, targetNickname.trim().toLowerCase()))
        .limit(1)
    : [];
  const target = targetRows[0];
  if (!target) return { status: 'not_found' };
  if (target.id === requesterId) return { status: 'self_request' };

  const [low, high] = makePairIds(requesterId, target.id);
  const existingRows = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)))
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    if (existing.status === 'accepted') return { status: 'already_friends' };
    if (existing.status === 'pending') {
      if (existing.requestedByUserId !== requesterId) {
        await db
          .update(friendships)
          .set({ status: 'accepted', acceptedAt: nowIso, updatedAt: nowIso })
          .where(eq(friendships.id, existing.id));
        return {
          status: 'auto_accepted',
          friendshipId: existing.id,
          targetNickname: target.nickname,
        };
      }
      return { status: 'already_pending' };
    }
    await db
      .update(friendships)
      .set({
        requestedByUserId: requesterId,
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
        acceptedAt: null,
      })
      .where(eq(friendships.id, existing.id));
    await db.insert(notificationHistory).values({
      id: `ntf_${generateToken(8)}`,
      userId: target.id,
      kind: 'system',
      title: 'Nova solicitação de amizade',
      message: `${requesterNickname} enviou um pedido de amizade para você.`,
      seen: false,
      createdAt: nowIso,
    });
    return { status: 'ok', friendshipId: existing.id, targetNickname: target.nickname };
  }

  const id = `fr_${generateToken(8)}`;
  await db.insert(friendships).values({
    id,
    userLowId: low,
    userHighId: high,
    requestedByUserId: requesterId,
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
    acceptedAt: null,
  });
  await db.insert(notificationHistory).values({
    id: `ntf_${generateToken(8)}`,
    userId: target.id,
    kind: 'system',
    title: 'Nova solicitação de amizade',
    message: `${requesterNickname} enviou um pedido de amizade para você.`,
    seen: false,
    createdAt: nowIso,
  });
  return { status: 'ok', friendshipId: id, targetNickname: target.nickname };
}

export async function repoRespondFriendRequest(params: {
  userId: string;
  friendshipId: string;
  action: 'accept' | 'decline' | 'cancel';
}): Promise<{ status: 'ok' | 'not_found' | 'forbidden' | 'invalid_state' }> {
  const { userId, friendshipId, action } = params;
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const f = db.friendships.find((item) => item.id === friendshipId);
    if (!f) return { status: 'not_found' };
    if (f.userLowId !== userId && f.userHighId !== userId) return { status: 'forbidden' };
    if (f.status !== 'pending') return { status: 'invalid_state' };

    if (action === 'cancel') {
      if (f.requestedByUserId !== userId) return { status: 'forbidden' };
      f.status = 'cancelled';
    } else {
      if (f.requestedByUserId === userId) return { status: 'forbidden' };
      f.status = action === 'accept' ? 'accepted' : 'declined';
      if (action === 'accept') f.acceptedAt = nowIso;
    }
    f.updatedAt = nowIso;
    saveLocalDb();
    return { status: 'ok' };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const rows = await db
    .select()
    .from(friendships)
    .where(eq(friendships.id, friendshipId))
    .limit(1);
  const f = rows[0];
  if (!f) return { status: 'not_found' };
  if (f.userLowId !== userId && f.userHighId !== userId) return { status: 'forbidden' };
  if (f.status !== 'pending') return { status: 'invalid_state' };

  if (action === 'cancel') {
    if (f.requestedByUserId !== userId) return { status: 'forbidden' };
    await db
      .update(friendships)
      .set({ status: 'cancelled', updatedAt: nowIso })
      .where(eq(friendships.id, f.id));
  } else {
    if (f.requestedByUserId === userId) return { status: 'forbidden' };
    await db
      .update(friendships)
      .set({
        status: action === 'accept' ? 'accepted' : 'declined',
        acceptedAt: action === 'accept' ? nowIso : null,
        updatedAt: nowIso,
      })
      .where(eq(friendships.id, f.id));
  }
  return { status: 'ok' };
}

export async function repoRemoveFriend(params: {
  userId: string;
  friendshipId: string;
}): Promise<{ ok: boolean }> {
  const { userId, friendshipId } = params;
  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const idx = db.friendships.findIndex(
      (f) => f.id === friendshipId && (f.userLowId === userId || f.userHighId === userId)
    );
    if (idx === -1) return { ok: false };
    db.friendships.splice(idx, 1);
    db.friendMessages = db.friendMessages.filter((m) => m.friendshipId !== friendshipId);
    saveLocalDb();
    return { ok: true };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const deleted = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.id, friendshipId),
        or(eq(friendships.userLowId, userId), eq(friendships.userHighId, userId))
      )
    )
    .returning({ id: friendships.id });
  return { ok: deleted.length > 0 };
}

export async function repoGetFriendMessages(params: {
  userId: string;
  friendUserId: string;
  limit?: number;
}): Promise<{ status: 'ok'; messages: FriendPrivateMessage[]; friendshipId: string } | { status: 'not_friends' }> {
  const { userId, friendUserId } = params;
  const limit = Math.max(10, Math.min(100, Math.floor(params.limit ?? 60)));
  const [low, high] = makePairIds(userId, friendUserId);

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const ship = db.friendships.find(
      (f) => f.userLowId === low && f.userHighId === high && f.status === 'accepted'
    );
    if (!ship) return { status: 'not_friends' };

    let marked = false;
    for (const m of db.friendMessages) {
      if (m.friendshipId === ship.id && m.receiverUserId === userId && !m.read) {
        m.read = true;
        marked = true;
      }
    }
    if (marked) saveLocalDb();

    const msgs = db.friendMessages
      .filter((m) => m.friendshipId === ship.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-limit);
    return { status: 'ok', messages: msgs, friendshipId: ship.id };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const ships = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.userLowId, low),
        eq(friendships.userHighId, high),
        eq(friendships.status, 'accepted')
      )
    )
    .limit(1);
  const ship = ships[0];
  if (!ship) return { status: 'not_friends' };

  await db
    .update(friendMessages)
    .set({ read: true })
    .where(
      and(
        eq(friendMessages.friendshipId, ship.id),
        eq(friendMessages.receiverUserId, userId),
        eq(friendMessages.read, false)
      )
    );

  const rows = await db
    .select()
    .from(friendMessages)
    .where(eq(friendMessages.friendshipId, ship.id))
    .orderBy(desc(friendMessages.createdAt))
    .limit(limit);

  return {
    status: 'ok',
    friendshipId: ship.id,
    messages: rows.reverse(),
  };
}

export async function repoSendFriendMessage(params: {
  senderUserId: string;
  receiverUserId: string;
  content: string;
}): Promise<
  | { status: 'ok'; message: FriendPrivateMessage }
  | { status: 'not_friends' | 'invalid_content' | 'self_message' }
> {
  const { senderUserId, receiverUserId, content } = params;
  if (senderUserId === receiverUserId) return { status: 'self_message' };
  const cleaned = content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!cleaned || cleaned.length > 500) {
    return { status: 'invalid_content' };
  }

  const [low, high] = makePairIds(senderUserId, receiverUserId);
  const nowIso = new Date().toISOString();

  if (!isNeonConfigured()) {
    const db = getLocalDb();
    const ship = db.friendships.find(
      (f) => f.userLowId === low && f.userHighId === high && f.status === 'accepted'
    );
    if (!ship) return { status: 'not_friends' };

    const msg: FriendPrivateMessage = {
      id: `fmsg_${generateToken(10)}`,
      friendshipId: ship.id,
      senderUserId,
      receiverUserId,
      content: cleaned,
      read: false,
      createdAt: nowIso,
    };
    db.friendMessages.push(msg);
    if (db.friendMessages.length > 10000) {
      db.friendMessages.splice(0, db.friendMessages.length - 10000);
    }
    saveLocalDb();
    return { status: 'ok', message: msg };
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  const ships = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.userLowId, low),
        eq(friendships.userHighId, high),
        eq(friendships.status, 'accepted')
      )
    )
    .limit(1);
  const ship = ships[0];
  if (!ship) return { status: 'not_friends' };

  const msg: FriendPrivateMessage = {
    id: `fmsg_${generateToken(10)}`,
    friendshipId: ship.id,
    senderUserId,
    receiverUserId,
    content: cleaned,
    read: false,
    createdAt: nowIso,
  };
  await db.insert(friendMessages).values(msg);
  return { status: 'ok', message: msg };
}
