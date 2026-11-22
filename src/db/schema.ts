import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { MapId, SkinId } from '../shared/constants.ts';

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
  (table) => [index('matches_user_best_idx').on(table.userId, table.noCoinTimeMs)]
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
