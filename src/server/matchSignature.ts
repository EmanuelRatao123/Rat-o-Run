import { MapId, SkinId, SoloGameMode } from '../shared/constants.ts';
import { getSigningSecretInfo, safeTimingEqualHex, signHmac, verifyHmac } from './crypto.ts';
import { ActiveMatchToken } from './store.ts';

export interface CanonicalMatchTokenInput {
  matchId: string;
  userId: string;
  startedAt: number | string;
  mapId: MapId | string;
  skinId: SkinId | string;
  mode: SoloGameMode | string;
}

export type SignatureFormat = 'v1' | 'legacy_colon_v2' | 'legacy_colon_v1' | 'none';

export type SignatureVerifyReason =
  | 'ok'
  | 'invalid_format'
  | 'user_mismatch'
  | 'client_mismatch'
  | 'hmac_mismatch';

export function normalizeMatchStartedAt(startedAt: number | string): number {
  const numeric = typeof startedAt === 'number' ? startedAt : Number(String(startedAt).trim());
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.trunc(numeric);
}

export function normalizeMatchMode(mode: SoloGameMode | string | undefined): SoloGameMode {
  return mode === 'normal' ? 'normal' : 'no_coin';
}

export function buildCanonicalMatchPayload(input: CanonicalMatchTokenInput): string {
  const matchId = String(input.matchId).trim();
  const userId = String(input.userId).trim();
  const startedAtInt = normalizeMatchStartedAt(input.startedAt);
  const mapId = String(input.mapId).trim();
  const skinId = String(input.skinId).trim();
  const mode = normalizeMatchMode(input.mode);
  return `v1|${matchId}|${userId}|${startedAtInt}|${mapId}|${skinId}|${mode}`;
}

export function buildLegacyColonPayloads(input: CanonicalMatchTokenInput): {
  v2: string;
  v1: string;
} {
  const matchId = String(input.matchId).trim();
  const userId = String(input.userId).trim();
  const startedAtInt = normalizeMatchStartedAt(input.startedAt);
  const mapId = String(input.mapId).trim();
  const skinId = String(input.skinId).trim();
  const mode = normalizeMatchMode(input.mode);
  return {
    v2: `${matchId}:${userId}:${startedAtInt}:${mapId}:${skinId}:${mode}`,
    v1: `${matchId}:${userId}:${startedAtInt}:${mapId}:${skinId}`,
  };
}

export function signCanonicalMatchToken(input: CanonicalMatchTokenInput): {
  startedAt: number;
  mode: SoloGameMode;
  payload: string;
  signature: string;
} {
  const startedAt = normalizeMatchStartedAt(input.startedAt);
  const mode = normalizeMatchMode(input.mode);
  const payload = buildCanonicalMatchPayload({
    ...input,
    startedAt,
    mode,
  });
  const signature = signHmac(payload);
  return { startedAt, mode, payload, signature };
}

export function verifyMatchSignature(params: {
  active: ActiveMatchToken;
  authenticatedUserId: string;
  clientSignature: string;
}): {
  ok: boolean;
  reason: SignatureVerifyReason;
  format: SignatureFormat;
  secretSource: string;
  startedAtInt: number;
} {
  const { active, authenticatedUserId, clientSignature } = params;
  const { source: secretSource } = getSigningSecretInfo();
  const startedAtInt = normalizeMatchStartedAt(active.startedAt);

  if (active.userId !== authenticatedUserId) {
    return {
      ok: false,
      reason: 'user_mismatch',
      format: 'none',
      secretSource,
      startedAtInt,
    };
  }

  const normalizedClientSig = typeof clientSignature === 'string' ? clientSignature.trim().toLowerCase() : '';
  const normalizedStoredSig = typeof active.signature === 'string' ? active.signature.trim().toLowerCase() : '';

  if (
    !normalizedClientSig ||
    !normalizedStoredSig ||
    normalizedClientSig.length !== 64 ||
    !/^[0-9a-f]{64}$/.test(normalizedClientSig)
  ) {
    return {
      ok: false,
      reason: 'invalid_format',
      format: 'none',
      secretSource,
      startedAtInt,
    };
  }

  if (!safeTimingEqualHex(normalizedStoredSig, normalizedClientSig)) {
    return {
      ok: false,
      reason: 'client_mismatch',
      format: 'none',
      secretSource,
      startedAtInt,
    };
  }

  const canonical = buildCanonicalMatchPayload({
    matchId: active.matchId,
    userId: authenticatedUserId,
    startedAt: startedAtInt,
    mapId: active.mapId,
    skinId: active.skinId,
    mode: active.mode,
  });
  if (verifyHmac(canonical, normalizedClientSig)) {
    return {
      ok: true,
      reason: 'ok',
      format: 'v1',
      secretSource,
      startedAtInt,
    };
  }

  const legacy = buildLegacyColonPayloads({
    matchId: active.matchId,
    userId: authenticatedUserId,
    startedAt: startedAtInt,
    mapId: active.mapId,
    skinId: active.skinId,
    mode: active.mode,
  });
  if (verifyHmac(legacy.v2, normalizedClientSig)) {
    return {
      ok: true,
      reason: 'ok',
      format: 'legacy_colon_v2',
      secretSource,
      startedAtInt,
    };
  }
  if (verifyHmac(legacy.v1, normalizedClientSig)) {
    return {
      ok: true,
      reason: 'ok',
      format: 'legacy_colon_v1',
      secretSource,
      startedAtInt,
    };
  }

  return {
    ok: false,
    reason: 'hmac_mismatch',
    format: 'none',
    secretSource,
    startedAtInt,
  };
}
