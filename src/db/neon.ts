import { Pool, neon } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema.ts';

declare global {
  var _rataoNeonDb: NeonHttpDatabase<typeof schema> | undefined;
  var _rataoNeonSql: ReturnType<typeof neon> | undefined;
  var _rataoNeonPool: Pool | undefined;
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

export function getNeonPool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (!global._rataoNeonPool) {
    global._rataoNeonPool = new Pool({ connectionString: url });
  }
  return global._rataoNeonPool;
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
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_skate_id TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_single_match_coins INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_single_match_coins_at TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_single_match_coins_skin TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_single_match_coins_map TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS users_best_coins_rank_idx ON users (best_single_match_coins DESC, best_distance DESC)`;

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
          mode TEXT NOT NULL DEFAULT 'no_coin',
          map_id TEXT NOT NULL,
          skin_id TEXT NOT NULL,
          started_at BIGINT NOT NULL,
          signature TEXT NOT NULL,
          completed BOOLEAN NOT NULL DEFAULT FALSE
        )
      `;
      await sql`ALTER TABLE active_matches ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'no_coin'`;
      await sql`ALTER TABLE active_matches ADD COLUMN IF NOT EXISTS summary_json JSONB`;
      await sql`CREATE INDEX IF NOT EXISTS active_matches_started_idx ON active_matches (started_at)`;

      await sql`
        CREATE TABLE IF NOT EXISTS matches (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          nickname TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'no_coin',
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
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'no_coin'`;
      await sql`CREATE INDEX IF NOT EXISTS matches_user_best_idx ON matches (user_id, no_coin_time_ms DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS matches_user_mode_best_idx ON matches (user_id, mode, no_coin_time_ms DESC)`;

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

      await sql`
        CREATE TABLE IF NOT EXISTS multiplayer_rooms (
          id TEXT PRIMARY KEY,
          mode TEXT NOT NULL,
          map_id TEXT NOT NULL,
          seed INTEGER NOT NULL,
          host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          guest_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'waiting_player',
          countdown_start_at BIGINT,
          started_at BIGINT,
          finished_at BIGINT,
          winner_user_id TEXT,
          loser_user_id TEXT,
          result_reason TEXT,
          max_duration_ms INTEGER NOT NULL DEFAULT 180000,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS mp_rooms_host_idx ON multiplayer_rooms (host_user_id, status)`;
      await sql`CREATE INDEX IF NOT EXISTS mp_rooms_guest_idx ON multiplayer_rooms (guest_user_id, status)`;

      await sql`
        CREATE TABLE IF NOT EXISTS multiplayer_participants (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          nickname TEXT NOT NULL,
          skin_id TEXT NOT NULL,
          role TEXT NOT NULL,
          ready BOOLEAN NOT NULL DEFAULT FALSE,
          connected BOOLEAN NOT NULL DEFAULT TRUE,
          last_heartbeat_at BIGINT NOT NULL,
          pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
          pos_y DOUBLE PRECISION NOT NULL DEFAULT 0,
          pos_z DOUBLE PRECISION NOT NULL DEFAULT 0,
          vx DOUBLE PRECISION NOT NULL DEFAULT 0,
          vy DOUBLE PRECISION NOT NULL DEFAULT 0,
          vz DOUBLE PRECISION NOT NULL DEFAULT 0,
          speed DOUBLE PRECISION NOT NULL DEFAULT 0,
          yaw DOUBLE PRECISION NOT NULL DEFAULT 0,
          seq INTEGER NOT NULL DEFAULT 0,
          client_ts BIGINT NOT NULL DEFAULT 0,
          ping_ms INTEGER NOT NULL DEFAULT 0,
          lane INTEGER NOT NULL DEFAULT 0,
          anim_state TEXT NOT NULL DEFAULT 'idle',
          distance INTEGER NOT NULL DEFAULT 0,
          coins INTEGER NOT NULL DEFAULT 0,
          score INTEGER NOT NULL DEFAULT 0,
          no_coin_time_ms INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          collision_count INTEGER NOT NULL DEFAULT 0,
          alive BOOLEAN NOT NULL DEFAULT TRUE,
          collected_first_coin BOOLEAN NOT NULL DEFAULT FALSE,
          finished_at BIGINT,
          hoverboard BOOLEAN NOT NULL DEFAULT FALSE,
          jetpack BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS vx DOUBLE PRECISION NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS vy DOUBLE PRECISION NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS vz DOUBLE PRECISION NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS speed DOUBLE PRECISION NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS yaw DOUBLE PRECISION NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS seq INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS client_ts BIGINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS ping_ms INTEGER NOT NULL DEFAULT 0`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS mp_participants_room_user_uidx ON multiplayer_participants (room_id, user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS mp_participants_room_idx ON multiplayer_participants (room_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS multiplayer_invites (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
          from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          from_nickname TEXT NOT NULL,
          from_skin_id TEXT NOT NULL,
          to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_nickname TEXT NOT NULL,
          mode TEXT NOT NULL,
          map_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          responded_at TEXT,
          expires_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS mp_invites_to_status_idx ON multiplayer_invites (to_user_id, status)`;
      await sql`CREATE INDEX IF NOT EXISTS mp_invites_from_status_idx ON multiplayer_invites (from_user_id, status)`;

      await sql`
        CREATE TABLE IF NOT EXISTS multiplayer_matches (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          map_id TEXT NOT NULL,
          seed INTEGER NOT NULL,
          host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          host_nickname TEXT NOT NULL,
          host_skin_id TEXT NOT NULL,
          guest_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          guest_nickname TEXT NOT NULL,
          guest_skin_id TEXT NOT NULL,
          winner_user_id TEXT,
          result_reason TEXT NOT NULL,
          host_distance INTEGER NOT NULL DEFAULT 0,
          host_duration_ms INTEGER NOT NULL DEFAULT 0,
          host_coins INTEGER NOT NULL DEFAULT 0,
          host_score INTEGER NOT NULL DEFAULT 0,
          guest_distance INTEGER NOT NULL DEFAULT 0,
          guest_duration_ms INTEGER NOT NULL DEFAULT 0,
          guest_coins INTEGER NOT NULL DEFAULT 0,
          guest_score INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS mp_matches_host_idx ON multiplayer_matches (host_user_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS mp_matches_guest_idx ON multiplayer_matches (guest_user_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS multiplayer_events (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS mp_events_room_idx ON multiplayer_events (room_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS x1_results (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          match_id TEXT NOT NULL,
          winner_user_id TEXT,
          winner_nickname TEXT,
          loser_user_id TEXT,
          loser_nickname TEXT,
          is_draw BOOLEAN NOT NULL DEFAULT FALSE,
          reason TEXT NOT NULL,
          map_id TEXT NOT NULL,
          winner_duration_ms INTEGER NOT NULL DEFAULT 0,
          loser_duration_ms INTEGER NOT NULL DEFAULT 0,
          winner_distance INTEGER NOT NULL DEFAULT 0,
          loser_distance INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS x1_results_winner_idx ON x1_results (winner_user_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS x1_results_loser_idx ON x1_results (loser_user_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS player_competitive_stats (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          x1_wins INTEGER NOT NULL DEFAULT 0,
          x1_losses INTEGER NOT NULL DEFAULT 0,
          x1_draws INTEGER NOT NULL DEFAULT 0,
          coop_matches INTEGER NOT NULL DEFAULT 0,
          coop_wins INTEGER NOT NULL DEFAULT 0,
          last_match_at TEXT,
          updated_at TEXT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS exclusive_skin_permissions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          skin_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          rank_position INTEGER,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          granted_at TEXT NOT NULL,
          revoked_at TEXT,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS excl_perm_user_active_idx ON exclusive_skin_permissions (user_id, active)`;
      await sql`CREATE INDEX IF NOT EXISTS excl_perm_skin_active_idx ON exclusive_skin_permissions (skin_id, active)`;

      await sql`
        CREATE TABLE IF NOT EXISTS player_suggestions (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          author_nickname TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'received',
          admin_note TEXT,
          reviewed_by TEXT,
          reviewed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS suggestions_user_idx ON player_suggestions (user_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS suggestions_status_idx ON player_suggestions (status, type)`;

      await sql`
        CREATE TABLE IF NOT EXISTS promo_codes (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          reward_type TEXT NOT NULL,
          reward_skin_id TEXT,
          reward_amount INTEGER NOT NULL DEFAULT 0,
          reward_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          max_uses INTEGER,
          is_infinite BOOLEAN NOT NULL DEFAULT FALSE,
          used_count INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          expires_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS promo_codes_active_idx ON promo_codes (active)`;

      await sql`
        CREATE TABLE IF NOT EXISTS promo_code_redemptions (
          id TEXT PRIMARY KEY,
          promo_code_id TEXT NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
          code TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          nickname TEXT NOT NULL,
          reward_type TEXT NOT NULL,
          reward_summary TEXT NOT NULL,
          redeemed_at TEXT NOT NULL
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_code_user_uidx ON promo_code_redemptions (promo_code_id, user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON promo_code_redemptions (promo_code_id, redeemed_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS player_wallet_stats (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          total_coins_collected INTEGER NOT NULL DEFAULT 0,
          solo_coins_collected INTEGER NOT NULL DEFAULT 0,
          multiplayer_coins_collected INTEGER NOT NULL DEFAULT 0,
          promo_coins_collected INTEGER NOT NULL DEFAULT 0,
          spent_coins INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS wallet_coins_rank_idx ON player_wallet_stats (total_coins_collected DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS coin_ledger_events (
          id TEXT PRIMARY KEY,
          event_key TEXT NOT NULL UNIQUE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source_type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS coin_ledger_user_idx ON coin_ledger_events (user_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS custom_character_configs (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          config_json JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS custom_character_textures (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          region TEXT NOT NULL,
          storage_url TEXT NOT NULL,
          data_base64 TEXT NOT NULL,
          content_type TEXT NOT NULL DEFAULT 'image/png',
          byte_size INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS custom_tex_user_region_uidx ON custom_character_textures (user_id, region)`;

      await sql`
        CREATE TABLE IF NOT EXISTS notification_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          seen BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS notif_user_seen_idx ON notification_history (user_id, seen, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS skin_grant_history (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          admin_user_id TEXT NOT NULL,
          admin_nickname TEXT NOT NULL,
          target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_nickname TEXT NOT NULL,
          skins_affected JSONB NOT NULL DEFAULT '[]'::jsonb,
          skins_count INTEGER NOT NULL DEFAULT 0,
          already_owned_count INTEGER NOT NULL DEFAULT 0,
          total_skins_after INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS skin_grant_hist_created_idx ON skin_grant_history (created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS skin_grant_hist_target_idx ON skin_grant_history (target_user_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS match_diagnostic_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          match_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          stage TEXT NOT NULL,
          status TEXT NOT NULL,
          detail TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS match_diag_user_idx ON match_diagnostic_logs (user_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS match_diag_match_idx ON match_diagnostic_logs (match_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS friendships (
          id TEXT PRIMARY KEY,
          user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          accepted_at TEXT
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uidx ON friendships (user_low_id, user_high_id)`;
      await sql`CREATE INDEX IF NOT EXISTS friendships_low_status_idx ON friendships (user_low_id, status)`;
      await sql`CREATE INDEX IF NOT EXISTS friendships_high_status_idx ON friendships (user_high_id, status)`;

      await sql`
        CREATE TABLE IF NOT EXISTS friend_messages (
          id TEXT PRIMARY KEY,
          friendship_id TEXT NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
          sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          receiver_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS friend_msg_ship_created_idx ON friend_messages (friendship_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS friend_msg_recv_read_idx ON friend_messages (receiver_user_id, read)`;

      await sql`
        CREATE TABLE IF NOT EXISTS player_capes (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          config_json JSONB NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS player_live_mode_configs (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          config_json JSONB NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS player_skate_inventory (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          skate_id TEXT NOT NULL,
          charges INTEGER NOT NULL DEFAULT 0,
          unlocked_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS skate_inv_user_skate_uidx ON player_skate_inventory (user_id, skate_id)`;
      await sql`CREATE INDEX IF NOT EXISTS skate_inv_user_idx ON player_skate_inventory (user_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS shop_transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_type TEXT NOT NULL,
          item_id TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price INTEGER NOT NULL,
          total_cost INTEGER NOT NULL,
          balance_before INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS shop_tx_user_idx ON shop_transactions (user_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS match_skate_uses (
          id TEXT PRIMARY KEY,
          event_key TEXT NOT NULL UNIQUE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          match_id TEXT NOT NULL,
          skate_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS match_skate_uses_user_idx ON match_skate_uses (user_id, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS server_runtime_secrets (
          id TEXT PRIMARY KEY,
          secret_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS voice_calls (
          id TEXT PRIMARY KEY,
          caller_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          caller_nickname TEXT NOT NULL,
          callee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          callee_nickname TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ringing',
          end_reason TEXT,
          created_at TEXT NOT NULL,
          answered_at TEXT,
          ended_at TEXT,
          expires_at TEXT NOT NULL,
          caller_heartbeat_at TEXT NOT NULL,
          callee_heartbeat_at TEXT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS voice_calls_caller_status_idx ON voice_calls (caller_user_id, status)`;
      await sql`CREATE INDEX IF NOT EXISTS voice_calls_callee_status_idx ON voice_calls (callee_user_id, status)`;
      await sql`CREATE INDEX IF NOT EXISTS voice_calls_status_created_idx ON voice_calls (status, created_at DESC)`;

      await sql`
        CREATE TABLE IF NOT EXISTS voice_call_signals (
          id TEXT PRIMARY KEY,
          seq SERIAL NOT NULL,
          call_id TEXT NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
          from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS voice_signals_call_to_seq_idx ON voice_call_signals (call_id, to_user_id, seq)`;

      await sql`
        CREATE TABLE IF NOT EXISTS security_audit_logs (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          category TEXT NOT NULL,
          severity TEXT NOT NULL,
          ip TEXT NOT NULL DEFAULT 'unknown',
          user_id TEXT,
          nickname TEXT,
          route TEXT,
          details TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS sec_audit_created_idx ON security_audit_logs (created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS sec_audit_sev_created_idx ON security_audit_logs (severity, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS sec_audit_ip_idx ON security_audit_logs (ip, created_at DESC)`;

      // One-time safe backfill of best_single_match_coins from historical normal matches
      await sql`
        UPDATE users u
        SET
          best_single_match_coins = sub.max_coins,
          best_single_match_coins_at = sub.created_at,
          best_single_match_coins_skin = sub.skin_id,
          best_single_match_coins_map = sub.map_id
        FROM (
          SELECT DISTINCT ON (user_id)
            user_id,
            coins AS max_coins,
            created_at,
            skin_id,
            map_id
          FROM matches
          WHERE mode = 'normal' AND coins > 0
          ORDER BY user_id, coins DESC, created_at ASC
        ) sub
        WHERE u.id = sub.user_id
          AND u.best_single_match_coins = 0
      `;
    })().catch((err) => {
      global._rataoNeonInitPromise = undefined;
      throw err;
    });
  }
  await global._rataoNeonInitPromise;
}
