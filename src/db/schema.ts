import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  CustomCharacterConfig,
  ExclusiveSkinId,
  LockedExclusiveSkinId,
  MapId,
  MultiplayerMode,
  PaintRegion,
  ParticipantAnimState,
  PromoRewardType,
  RoomStatus,
  SkinId,
  SoloGameMode,
  SpecialUnlockableSkinId,
  SuggestionStatus,
  SuggestionType,
} from '../shared/constants.ts';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    nickname: text('nickname').notNull(),
    nicknameLower: text('nickname_lower').notNull().unique(),
    passwordHash: text('password_hash').notNull().default(''),
    recoveryHash: text('recovery_hash'),
    googleUid: text('google_uid').unique(),
    role: text('role').$type<'player' | 'admin'>().notNull().default('player'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    equippedSkin: text('equipped_skin').$type<SkinId>().notNull().default('ratao'),
    unlockedSkins: jsonb('unlocked_skins').$type<SkinId[]>().notNull(),
    giftedSkins: jsonb('gifted_skins').$type<SkinId[]>().notNull(),
    bestNoCoinTimeMs: integer('best_no_coin_time_ms').notNull().default(0),
    bestDistance: integer('best_distance').notNull().default(0),
    bestScore: integer('best_score').notNull().default(0),
    totalMatches: integer('total_matches').notNull().default(0),
    totalCoins: integer('total_coins').notNull().default(0),
    favoriteSkin: text('favorite_skin').$type<SkinId>().notNull().default('ratao'),
    skinUsage: jsonb('skin_usage').$type<Record<string, number>>().notNull(),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (table) => [
    index('users_rank_idx').on(table.bestNoCoinTimeMs, table.bestDistance),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').$type<'player' | 'admin'>().notNull().default('player'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('sessions_expires_idx').on(table.expiresAt)]
);

export const activeMatches = pgTable(
  'active_matches',
  {
    matchId: text('match_id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: text('mode').$type<SoloGameMode>().notNull().default('no_coin'),
    mapId: text('map_id').$type<MapId>().notNull(),
    skinId: text('skin_id').$type<SkinId>().notNull(),
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    signature: text('signature').notNull(),
    completed: boolean('completed').notNull().default(false),
  },
  (table) => [index('active_matches_started_idx').on(table.startedAt)]
);

export const matches = pgTable(
  'matches',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    mode: text('mode').$type<SoloGameMode>().notNull().default('no_coin'),
    skinId: text('skin_id').$type<SkinId>().notNull(),
    mapId: text('map_id').$type<MapId>().notNull(),
    noCoinTimeMs: integer('no_coin_time_ms').notNull(),
    collectedCoin: boolean('collected_coin').notNull(),
    coins: integer('coins').notNull(),
    distance: integer('distance').notNull(),
    score: integer('score').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('matches_user_best_idx').on(table.userId, table.noCoinTimeMs),
    index('matches_user_mode_best_idx').on(table.userId, table.mode, table.noCoinTimeMs),
  ]
);

export const globalMessages = pgTable('global_messages', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  active: boolean('active').notNull().default(true),
});

export const polls = pgTable('polls', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  options: jsonb('options').$type<string[]>().notNull(),
  active: boolean('active').notNull().default(true),
  durationMinutes: integer('duration_minutes').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  authorId: text('author_id').notNull(),
});

export const pollVotes = pgTable(
  'poll_votes',
  {
    id: text('id').primaryKey(),
    pollId: text('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    optionIndex: integer('option_index').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('poll_votes_unique_user_poll').on(table.pollId, table.userId)]
);

export const skinGifts = pgTable(
  'skin_gifts',
  {
    id: text('id').primaryKey(),
    targetUserId: text('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetNickname: text('target_nickname').notNull(),
    skinId: text('skin_id').$type<SkinId>().notNull(),
    grantedBy: text('granted_by').notNull(),
    createdAt: text('created_at').notNull(),
    seen: boolean('seen').notNull().default(false),
  },
  (table) => [index('skin_gifts_target_idx').on(table.targetUserId, table.seen)]
);

export const adminLogs = pgTable('admin_logs', {
  id: text('id').primaryKey(),
  adminNickname: text('admin_nickname').notNull(),
  action: text('action').notNull(),
  details: text('details').notNull(),
  createdAt: text('created_at').notNull(),
});

export const gameSettings = pgTable('game_settings', {
  id: text('id').primaryKey(),
  featuredMap: text('featured_map').$type<MapId>().notNull().default('brasil'),
  updatedAt: text('updated_at').notNull(),
});

export const multiplayerRooms = pgTable(
  'multiplayer_rooms',
  {
    id: text('id').primaryKey(),
    mode: text('mode').$type<MultiplayerMode>().notNull(),
    mapId: text('map_id').$type<MapId>().notNull(),
    seed: integer('seed').notNull(),
    hostUserId: text('host_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guestUserId: text('guest_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').$type<RoomStatus>().notNull().default('waiting_player'),
    countdownStartAt: bigint('countdown_start_at', { mode: 'number' }),
    startedAt: bigint('started_at', { mode: 'number' }),
    finishedAt: bigint('finished_at', { mode: 'number' }),
    winnerUserId: text('winner_user_id'),
    loserUserId: text('loser_user_id'),
    resultReason: text('result_reason'),
    maxDurationMs: integer('max_duration_ms').notNull().default(180000),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('mp_rooms_host_idx').on(table.hostUserId, table.status),
    index('mp_rooms_guest_idx').on(table.guestUserId, table.status),
  ]
);

export const multiplayerParticipants = pgTable(
  'multiplayer_participants',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => multiplayerRooms.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    skinId: text('skin_id').$type<SkinId>().notNull(),
    role: text('role').$type<'host' | 'guest'>().notNull(),
    ready: boolean('ready').notNull().default(false),
    connected: boolean('connected').notNull().default(true),
    lastHeartbeatAt: bigint('last_heartbeat_at', { mode: 'number' }).notNull(),
    posX: doublePrecision('pos_x').notNull().default(0),
    posY: doublePrecision('pos_y').notNull().default(0),
    posZ: doublePrecision('pos_z').notNull().default(0),
    vx: doublePrecision('vx').notNull().default(0),
    vy: doublePrecision('vy').notNull().default(0),
    vz: doublePrecision('vz').notNull().default(0),
    speed: doublePrecision('speed').notNull().default(0),
    yaw: doublePrecision('yaw').notNull().default(0),
    seq: integer('seq').notNull().default(0),
    clientTs: bigint('client_ts', { mode: 'number' }).notNull().default(0),
    pingMs: integer('ping_ms').notNull().default(0),
    lane: integer('lane').notNull().default(0),
    animState: text('anim_state').$type<ParticipantAnimState>().notNull().default('idle'),
    distance: integer('distance').notNull().default(0),
    coins: integer('coins').notNull().default(0),
    score: integer('score').notNull().default(0),
    noCoinTimeMs: integer('no_coin_time_ms').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    collisionCount: integer('collision_count').notNull().default(0),
    alive: boolean('alive').notNull().default(true),
    collectedFirstCoin: boolean('collected_first_coin').notNull().default(false),
    finishedAt: bigint('finished_at', { mode: 'number' }),
    hoverboard: boolean('hoverboard').notNull().default(false),
    jetpack: boolean('jetpack').notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('mp_participants_room_user_uidx').on(table.roomId, table.userId),
    index('mp_participants_room_idx').on(table.roomId),
  ]
);

export const multiplayerInvites = pgTable(
  'multiplayer_invites',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => multiplayerRooms.id, { onDelete: 'cascade' }),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromNickname: text('from_nickname').notNull(),
    fromSkinId: text('from_skin_id').$type<SkinId>().notNull(),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toNickname: text('to_nickname').notNull(),
    mode: text('mode').$type<MultiplayerMode>().notNull(),
    mapId: text('map_id').$type<MapId>().notNull(),
    status: text('status')
      .$type<'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'>()
      .notNull()
      .default('pending'),
    createdAt: text('created_at').notNull(),
    respondedAt: text('responded_at'),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    index('mp_invites_to_status_idx').on(table.toUserId, table.status),
    index('mp_invites_from_status_idx').on(table.fromUserId, table.status),
  ]
);

export const multiplayerMatches = pgTable(
  'multiplayer_matches',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    mode: text('mode').$type<MultiplayerMode>().notNull(),
    mapId: text('map_id').$type<MapId>().notNull(),
    seed: integer('seed').notNull(),
    hostUserId: text('host_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hostNickname: text('host_nickname').notNull(),
    hostSkinId: text('host_skin_id').$type<SkinId>().notNull(),
    guestUserId: text('guest_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guestNickname: text('guest_nickname').notNull(),
    guestSkinId: text('guest_skin_id').$type<SkinId>().notNull(),
    winnerUserId: text('winner_user_id'),
    resultReason: text('result_reason').notNull(),
    hostDistance: integer('host_distance').notNull().default(0),
    hostDurationMs: integer('host_duration_ms').notNull().default(0),
    hostCoins: integer('host_coins').notNull().default(0),
    hostScore: integer('host_score').notNull().default(0),
    guestDistance: integer('guest_distance').notNull().default(0),
    guestDurationMs: integer('guest_duration_ms').notNull().default(0),
    guestCoins: integer('guest_coins').notNull().default(0),
    guestScore: integer('guest_score').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('mp_matches_host_idx').on(table.hostUserId, table.createdAt),
    index('mp_matches_guest_idx').on(table.guestUserId, table.createdAt),
  ]
);

export const multiplayerEvents = pgTable(
  'multiplayer_events',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => multiplayerRooms.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('mp_events_room_idx').on(table.roomId, table.createdAt)]
);

export const x1Results = pgTable(
  'x1_results',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    matchId: text('match_id').notNull(),
    winnerUserId: text('winner_user_id'),
    winnerNickname: text('winner_nickname'),
    loserUserId: text('loser_user_id'),
    loserNickname: text('loser_nickname'),
    isDraw: boolean('is_draw').notNull().default(false),
    reason: text('reason').notNull(),
    mapId: text('map_id').$type<MapId>().notNull(),
    winnerDurationMs: integer('winner_duration_ms').notNull().default(0),
    loserDurationMs: integer('loser_duration_ms').notNull().default(0),
    winnerDistance: integer('winner_distance').notNull().default(0),
    loserDistance: integer('loser_distance').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('x1_results_winner_idx').on(table.winnerUserId, table.createdAt),
    index('x1_results_loser_idx').on(table.loserUserId, table.createdAt),
  ]
);

export const playerCompetitiveStats = pgTable('player_competitive_stats', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  x1Wins: integer('x1_wins').notNull().default(0),
  x1Losses: integer('x1_losses').notNull().default(0),
  x1Draws: integer('x1_draws').notNull().default(0),
  coopMatches: integer('coop_matches').notNull().default(0),
  coopWins: integer('coop_wins').notNull().default(0),
  lastMatchAt: text('last_match_at'),
  updatedAt: text('updated_at').notNull(),
});

export const exclusiveSkinPermissions = pgTable(
  'exclusive_skin_permissions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skinId: text('skin_id')
      .$type<ExclusiveSkinId | SpecialUnlockableSkinId | LockedExclusiveSkinId>()
      .notNull(),
    reason: text('reason')
      .$type<'admin' | 'top1' | 'top2' | 'top3' | 'promo_code' | 'admin_gift' | 'special_rule'>()
      .notNull(),
    rankPosition: integer('rank_position'),
    active: boolean('active').notNull().default(true),
    grantedAt: text('granted_at').notNull(),
    revokedAt: text('revoked_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('excl_perm_user_active_idx').on(table.userId, table.active),
    index('excl_perm_skin_active_idx').on(table.skinId, table.active),
  ]
);

export const playerSuggestions = pgTable(
  'player_suggestions',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorNickname: text('author_nickname').notNull(),
    type: text('type').$type<SuggestionType>().notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status').$type<SuggestionStatus>().notNull().default('received'),
    adminNote: text('admin_note'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('suggestions_user_idx').on(table.userId, table.createdAt),
    index('suggestions_status_idx').on(table.status, table.type),
  ]
);

export const promoCodes = pgTable(
  'promo_codes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    description: text('description').notNull().default(''),
    rewardType: text('reward_type').$type<PromoRewardType>().notNull(),
    rewardSkinId: text('reward_skin_id').$type<SkinId>(),
    rewardAmount: integer('reward_amount').notNull().default(0),
    rewardMetadata: jsonb('reward_metadata').$type<Record<string, unknown>>().notNull(),
    maxUses: integer('max_uses'),
    isInfinite: boolean('is_infinite').notNull().default(false),
    usedCount: integer('used_count').notNull().default(0),
    active: boolean('active').notNull().default(true),
    expiresAt: text('expires_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('promo_codes_active_idx').on(table.active)]
);

export const promoCodeRedemptions = pgTable(
  'promo_code_redemptions',
  {
    id: text('id').primaryKey(),
    promoCodeId: text('promo_code_id')
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    rewardType: text('reward_type').$type<PromoRewardType>().notNull(),
    rewardSummary: text('reward_summary').notNull(),
    redeemedAt: text('redeemed_at').notNull(),
  },
  (table) => [
    uniqueIndex('promo_redemptions_code_user_uidx').on(table.promoCodeId, table.userId),
    index('promo_redemptions_code_idx').on(table.promoCodeId, table.redeemedAt),
  ]
);

export const playerWalletStats = pgTable(
  'player_wallet_stats',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    totalCoinsCollected: integer('total_coins_collected').notNull().default(0),
    soloCoinsCollected: integer('solo_coins_collected').notNull().default(0),
    multiplayerCoinsCollected: integer('multiplayer_coins_collected').notNull().default(0),
    promoCoinsCollected: integer('promo_coins_collected').notNull().default(0),
    spentCoins: integer('spent_coins').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('wallet_coins_rank_idx').on(table.totalCoinsCollected)]
);

export const coinLedgerEvents = pgTable(
  'coin_ledger_events',
  {
    id: text('id').primaryKey(),
    eventKey: text('event_key').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').$type<'solo' | 'coop' | 'x1' | 'promo'>().notNull(),
    amount: integer('amount').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('coin_ledger_user_idx').on(table.userId, table.createdAt)]
);

export const customCharacterConfigs = pgTable('custom_character_configs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  configJson: jsonb('config_json').$type<CustomCharacterConfig>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const customCharacterTextures = pgTable(
  'custom_character_textures',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    region: text('region').$type<PaintRegion>().notNull(),
    storageUrl: text('storage_url').notNull(),
    dataBase64: text('data_base64').notNull(),
    contentType: text('content_type').notNull().default('image/png'),
    byteSize: integer('byte_size').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('custom_tex_user_region_uidx').on(table.userId, table.region)]
);

export const notificationHistory = pgTable(
  'notification_history',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'suggestion_status' | 'promo' | 'system'>().notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    seen: boolean('seen').notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('notif_user_seen_idx').on(table.userId, table.seen, table.createdAt)]
);
