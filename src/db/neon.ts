import { neon } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema.ts';

declare global {
  var _rataoNeonDb: NeonHttpDatabase<typeof schema> | undefined;
  var _rataoNeonSql: ReturnType<typeof neon> | undefined;
  var _rataoNeonInitPromise: Promise<void> | undefined;
}

export function isNeonConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && /^postgres(ql)?:\/\//i.test(url));
}

export function getNeonDb(): NeonHttpDatabase<typeof schema> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (!global._rataoNeonSql) {
    global._rataoNeonSql = neon(url);
  }
  if (!global._rataoNeonDb) {
    global._rataoNeonDb = drizzle(global._rataoNeonSql, { schema });
  }
  return global._rataoNeonDb;
}

export async function ensureNeonSchema(): Promise<void> {
  if (!isNeonConfigured()) return;
  if (!global._rataoNeonInitPromise) {
    global._rataoNeonInitPromise = (async () => {
      const url = process.env.DATABASE_URL!.trim();
      const sql = global._rataoNeonSql ?? neon(url);
      global._rataoNeonSql = sql;

      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          nickname TEXT NOT NULL,
          nickname_lower TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL DEFAULT '',
          recovery_hash TEXT,
          google_uid TEXT UNIQUE,
          role TEXT NOT NULL DEFAULT 'player',
          must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
          equipped_skin TEXT NOT NULL DEFAULT 'ratao',
          unlocked_skins JSONB NOT NULL DEFAULT '[]'::jsonb,
          gifted_skins JSONB NOT NULL DEFAULT '[]'::jsonb,
          best_no_coin_time_ms INTEGER NOT NULL DEFAULT 0,
          best_distance INTEGER NOT NULL DEFAULT 0,
          best_score INTEGER NOT NULL DEFAULT 0,
          total_matches INTEGER NOT NULL DEFAULT 0,
          total_coins INTEGER NOT NULL DEFAULT 0,
          favorite_skin TEXT NOT NULL DEFAULT 'ratao',
          skin_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS users_rank_idx ON users (best_no_coin_time_ms DESC, best_distance DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL DEFAULT 'player',
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        )
      `;
      await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'player'`;
      await sql`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`;

      await sql`
        CREATE TABLE IF NOT EXISTS active_matches (
          match_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          map_id TEXT NOT NULL,
          skin_id TEXT NOT NULL,
          started_at BIGINT NOT NULL,
          signature TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT FALSE
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS active_matches_started_idx ON active_matches (started_at)`;

      await sql`
        CREATE TABLE IF NOT EXISTS matches (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          nickname TEXT NOT NULL,
          skin_id TEXT NOT NULL,
          map_id TEXT NOT NULL,
          no_coin_time_ms INTEGER NOT NULL,
          collected_coin BOOLEAN NOT NULL,
          coins INTEGER NOT NULL,
          distance INTEGER NOT NULL,
          score INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS matches_user_best_idx ON matches (user_id, no_coin_time_ms DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS global_messages (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS polls (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          options JSONB NOT NULL DEFAULT '[]'::jsonb,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          duration_minutes INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          author_id TEXT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS poll_votes (
          id TEXT PRIMARY KEY,
          poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          option_index INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_unique_user_poll ON poll_votes (poll_id, user_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS skin_gifts (
          id TEXT PRIMARY KEY,
          target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_nickname TEXT NOT NULL,
          skin_id TEXT NOT NULL,
          granted_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          seen BOOLEAN NOT NULL DEFAULT FALSE
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS skin_gifts_target_idx ON skin_gifts (target_user_id, seen)`;

      await sql`
        CREATE TABLE IF NOT EXISTS admin_logs (
          id TEXT PRIMARY KEY,
          admin_nickname TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS game_settings (
          id TEXT PRIMARY KEY,
          featured_map TEXT NOT NULL DEFAULT 'brasil',
          updated_at TEXT NOT NULL
        )
      `;
    })().catch((err) => {
      global._rataoNeonInitPromise = undefined;
      throw err;
    });
  }
  await global._rataoNeonInitPromise;
}
