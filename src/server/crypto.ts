import crypto from 'crypto';

declare global {
  var _rataoSessionSecret: string | undefined;
  var _rataoClusterSecret: string | undefined;
}

export type SigningSecretSource = 'env' | 'env_derived' | 'neon_cluster' | 'memory';

export function hasEnvSigningSecret(): boolean {
  return Boolean(
    process.env.SESSION_SECRET?.trim() || process.env.MATCH_SIGNING_SECRET?.trim()
  );
}

export function setClusterSigningSecret(secretHex: string): void {
  const clean = secretHex.trim();
  if (clean.length >= 32) {
    global._rataoClusterSecret = clean;
  }
}

export function getSigningSecretInfo(): { source: SigningSecretSource; secret: string } {
  const rawEnvSecret =
    process.env.SESSION_SECRET?.trim() || process.env.MATCH_SIGNING_SECRET?.trim() || '';
  if (rawEnvSecret.length >= 16) {
    return { source: 'env', secret: rawEnvSecret };
  }
  if (rawEnvSecret.length > 0) {
    // Deterministically stretch shorter configured secrets so all serverless instances share the exact same key
    const derived = crypto
      .createHash('sha256')
      .update(`ratao_match_key_v1:${rawEnvSecret}`)
      .digest('hex');
    return { source: 'env_derived', secret: derived };
  }
  if (global._rataoClusterSecret && global._rataoClusterSecret.length >= 32) {
    return { source: 'neon_cluster', secret: global._rataoClusterSecret };
  }
  if (!global._rataoSessionSecret) {
    global._rataoSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return { source: 'memory', secret: global._rataoSessionSecret };
}

function getSigningSecret(): string {
  return getSigningSecretInfo().secret;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, hexKey] = parts;
  const expected = Buffer.from(hexKey, 'hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

export function safeTimingEqualHex(expectedHex: string, candidateHex: string): boolean {
  if (typeof expectedHex !== 'string' || typeof candidateHex !== 'string') {
    return false;
  }
  const normA = expectedHex.trim().toLowerCase();
  const normB = candidateHex.trim().toLowerCase();
  if (
    normA.length === 0 ||
    normA.length !== normB.length ||
    normA.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(normA) ||
    !/^[0-9a-f]+$/.test(normB)
  ) {
    return false;
  }
  const a = Buffer.from(normA, 'hex');
  const b = Buffer.from(normB, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signHmac(data: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(data).digest('hex');
}

export function verifyHmac(data: string, signature: string): boolean {
  if (typeof signature !== 'string') return false;
  const expected = signHmac(data);
  return safeTimingEqualHex(expected, signature);
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

interface RateBucket {
  timestamps: number[];
  lockedUntil?: number;
}

export class SlidingRateLimiter {
  private buckets = new Map<string, RateBucket>();

  constructor(
    private maxAttempts: number,
    private windowMs: number,
    private lockoutMs: number = 0
  ) {}

  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    if (bucket.lockedUntil && bucket.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((bucket.lockedUntil - now) / 1000),
      };
    }

    bucket.timestamps = bucket.timestamps.filter((t) => now - t < this.windowMs);

    if (bucket.timestamps.length >= this.maxAttempts) {
      if (this.lockoutMs > 0) {
        bucket.lockedUntil = now + this.lockoutMs;
      }
      const oldest = bucket.timestamps[0] ?? now;
      const retryAfterMs = this.lockoutMs > 0 ? this.lockoutMs : this.windowMs - (now - oldest);
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    bucket.timestamps.push(now);
    return { allowed: true, retryAfterSec: 0 };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
