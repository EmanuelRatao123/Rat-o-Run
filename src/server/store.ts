import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ALL_SKIN_IDS,
  AdminLogItem,
  GlobalMessage,
  MapId,
  SkinGiftItem,
  SkinId,
} from '../shared/constants.ts';
import { generateToken, hashPassword } from './crypto.ts';

export interface StoredUser {
  id: string;
  nickname: string;
  nicknameLower: string;
  passwordHash: string;
  recoveryHash: string | null;
  googleUid?: string;
  role: 'player' | 'admin';
  mustChangePassword: boolean;
  equippedSkin: SkinId;
  unlockedSkins: SkinId[];
  giftedSkins: SkinId[];
  bestNoCoinTimeMs: number;
  bestDistance: number;
  bestScore: number;
  totalMatches: number;
  totalCoins: number;
  favoriteSkin: SkinId;
  skinUsage: Record<string, number>;
  createdAt: string;
  lastSeenAt: string;
}

export interface StoredSession {
  token: string;
  userId: string;
  scope?: 'player' | 'admin';
  createdAt: number;
  expiresAt: number;
}

export interface ActiveMatchToken {
  matchId: string;
  userId: string;
  mapId: MapId;
  skinId: SkinId;
  startedAt: number;
  signature: string;
  completed: boolean;
}

export interface StoredMatch {
  id: string;
  userId: string;
  nickname: string;
  skinId: SkinId;
  mapId: MapId;
  noCoinTimeMs: number;
  collectedCoin: boolean;
  coins: number;
  distance: number;
  score: number;
  durationMs: number;
  createdAt: string;
}

export interface StoredPoll {
  id: string;
  title: string;
  options: string[];
  active: boolean;
  durationMinutes: number;
  createdAt: string;
  expiresAt: string;
  authorId: string;
}

export interface StoredVote {
  id: string;
  pollId: string;
  userId: string;
  optionIndex: number;
  createdAt: string;
}

export interface DatabaseState {
  users: Record<string, StoredUser>;
  sessions: Record<string, StoredSession>;
  activeMatches: Record<string, ActiveMatchToken>;
  matches: StoredMatch[];
  messages: GlobalMessage[];
  polls: StoredPoll[];
  votes: StoredVote[];
  gifts: SkinGiftItem[];
  adminLogs: AdminLogItem[];
  settings: {
    featuredMap: MapId;
    updatedAt: string;
  };
}

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ratao-run-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'ratao-db.json');

function createInitialState(): DatabaseState {
  return {
    users: {},
    sessions: {},
    activeMatches: {},
    matches: [],
    messages: [],
    polls: [],
    votes: [],
    gifts: [],
    adminLogs: [],
    settings: {
      featuredMap: 'brasil',
      updatedAt: new Date().toISOString(),
    },
  };
}

declare global {
  var _rataoDbState: DatabaseState | undefined;
  var _rataoAdminSeeded: boolean | undefined;
}

function loadFromDisk(): DatabaseState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseState>;
      return {
        ...createInitialState(),
        ...parsed,
      };
    }
  } catch (err) {
    console.error('Failed to load DB file, starting fresh:', err);
  }
  return createInitialState();
}

export function getDb(): DatabaseState {
  if (!global._rataoDbState) {
    global._rataoDbState = loadFromDisk();
  }
  return global._rataoDbState;
}

export function saveDb(): void {
  const db = getDb();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Failed to persist DB file:', err);
  }
}

export function findUserByNickname(nickname: string): StoredUser | undefined {
  const lower = nickname.trim().toLowerCase();
  const db = getDb();
  return Object.values(db.users).find((u) => u.nicknameLower === lower);
}

export function hasAdminAccount(): boolean {
  const db = getDb();
  return Object.values(db.users).some((u) => u.role === 'admin');
}

export async function ensureAdminFromEnv(): Promise<void> {
  if (global._rataoAdminSeeded) return;
  global._rataoAdminSeeded = true;

  const envUser = process.env.ADMIN_INITIAL_USERNAME?.trim();
  const envPass = process.env.ADMIN_INITIAL_PASSWORD;

  if (!envUser || !envPass) {
    return;
  }

  const db = getDb();
  const existingAdmin = Object.values(db.users).find((u) => u.role === 'admin');

  if (!existingAdmin) {
    const id = `adm_${generateToken(8)}`;
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(envPass);
    db.users[id] = {
      id,
      nickname: envUser,
      nicknameLower: envUser.toLowerCase(),
      passwordHash,
      recoveryHash: null,
      role: 'admin',
      mustChangePassword: true,
      equippedSkin: 'ratao',
      unlockedSkins: [...ALL_SKIN_IDS],
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
    };
    saveDb();
  }
}

export function cleanupExpiredSessions(): void {
  const db = getDb();
  const now = Date.now();
  let changed = false;
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.expiresAt < now) {
      delete db.sessions[token];
      changed = true;
    }
  }
  // Also prune active match tokens older than 2 hours
  for (const [matchId, m] of Object.entries(db.activeMatches)) {
    if (now - m.startedAt > 2 * 60 * 60 * 1000) {
      delete db.activeMatches[matchId];
      changed = true;
    }
  }
  if (changed) saveDb();
}
