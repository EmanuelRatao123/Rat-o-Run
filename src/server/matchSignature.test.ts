import assert from 'node:assert/strict';
import {
  getSigningSecretInfo,
  setClusterSigningSecret,
  signHmac,
} from './crypto.ts';
import {
  buildCanonicalMatchPayload,
  buildLegacyColonPayloads,
  signCanonicalMatchToken,
  verifyMatchSignature,
} from './matchSignature.ts';
import { ActiveMatchToken } from './store.ts';

const prevSessionSecret = process.env.SESSION_SECRET;
const prevMatchSecret = process.env.MATCH_SIGNING_SECRET;

try {
  // 1. Cluster secret continuity across simulated serverless cold starts (no env var)
  delete process.env.SESSION_SECRET;
  delete process.env.MATCH_SIGNING_SECRET;
  const clusterHex = 'a'.repeat(64);
  setClusterSigningSecret(clusterHex);
  assert.equal(getSigningSecretInfo().source, 'neon_cluster');

  const signed = signCanonicalMatchToken({
    matchId: 'm_test_1',
    userId: 'usr_1',
    startedAt: 1732480000123.9,
    mapId: 'brasil',
    skinId: 'ratao',
    mode: 'no_coin',
  });
  assert.equal(signed.startedAt, 1732480000123);

  const active: ActiveMatchToken = {
    matchId: 'm_test_1',
    userId: 'usr_1',
    mode: 'no_coin',
    mapId: 'brasil',
    skinId: 'ratao',
    startedAt: '1732480000123' as unknown as number,
    signature: signed.signature,
    completed: false,
  };

  // Simulate another serverless lambda reading the same cluster secret from Neon
  global._rataoClusterSecret = undefined;
  global._rataoSessionSecret = 'f'.repeat(64);
  setClusterSigningSecret(clusterHex);

  const okCheck = verifyMatchSignature({
    active,
    authenticatedUserId: 'usr_1',
    clientSignature: signed.signature.toUpperCase(),
  });
  assert.equal(okCheck.ok, true);
  assert.equal(okCheck.format, 'v1');
  assert.equal(okCheck.startedAtInt, 1732480000123);

  // 2. Short SESSION_SECRET must derive deterministically rather than falling back to random per-lambda secret
  process.env.SESSION_SECRET = 'short123';
  assert.equal(getSigningSecretInfo().source, 'env_derived');
  const shortSigned = signCanonicalMatchToken({
    matchId: 'm_short_1',
    userId: 'usr_1',
    startedAt: 1732480001000,
    mapId: 'tokyo',
    skinId: 'capivara',
    mode: 'no_coin',
  });
  const shortActive: ActiveMatchToken = {
    matchId: 'm_short_1',
    userId: 'usr_1',
    mode: 'no_coin',
    mapId: 'tokyo',
    skinId: 'capivara',
    startedAt: 1732480001000,
    signature: shortSigned.signature,
    completed: false,
  };
  const shortVerify = verifyMatchSignature({
    active: shortActive,
    authenticatedUserId: 'usr_1',
    clientSignature: shortSigned.signature,
  });
  assert.equal(shortVerify.ok, true);

  // 3. Legacy colon-delimited payloads remain verifiable
  process.env.SESSION_SECRET = 'super_secret_vercel_key_1234567890';
  const legacyPayloads = buildLegacyColonPayloads({
    matchId: 'm_legacy',
    userId: 'usr_1',
    startedAt: 1732480002000,
    mapId: 'brasil',
    skinId: 'ratao',
    mode: 'no_coin',
  });
  const legacySig = signHmac(legacyPayloads.v2);
  const legacyVerify = verifyMatchSignature({
    active: {
      matchId: 'm_legacy',
      userId: 'usr_1',
      mode: 'no_coin',
      mapId: 'brasil',
      skinId: 'ratao',
      startedAt: 1732480002000,
      signature: legacySig,
      completed: false,
    },
    authenticatedUserId: 'usr_1',
    clientSignature: legacySig,
  });
  assert.equal(legacyVerify.ok, true);
  assert.equal(legacyVerify.format, 'legacy_colon_v2');

  // 4. Reject signature from a different match, wrong user, tampered payload, or malformed hex
  const otherSigned = signCanonicalMatchToken({
    matchId: 'm_other',
    userId: 'usr_1',
    startedAt: 1732480003000,
    mapId: 'brasil',
    skinId: 'ratao',
    mode: 'no_coin',
  });
  const canonicalCurr = signCanonicalMatchToken({
    matchId: 'm_curr',
    userId: 'usr_1',
    startedAt: 1732480004000,
    mapId: 'brasil',
    skinId: 'ratao',
    mode: 'no_coin',
  });
  const currActive: ActiveMatchToken = {
    matchId: 'm_curr',
    userId: 'usr_1',
    mode: 'no_coin',
    mapId: 'brasil',
    skinId: 'ratao',
    startedAt: 1732480004000,
    signature: canonicalCurr.signature,
    completed: false,
  };

  assert.equal(
    verifyMatchSignature({
      active: currActive,
      authenticatedUserId: 'usr_1',
      clientSignature: otherSigned.signature,
    }).reason,
    'client_mismatch'
  );
  assert.equal(
    verifyMatchSignature({
      active: currActive,
      authenticatedUserId: 'usr_other',
      clientSignature: canonicalCurr.signature,
    }).reason,
    'user_mismatch'
  );
  assert.equal(
    verifyMatchSignature({
      active: currActive,
      authenticatedUserId: 'usr_1',
      clientSignature: 'not_hex_sig',
    }).reason,
    'invalid_format'
  );
  assert.equal(
    verifyMatchSignature({
      active: { ...currActive, mapId: 'tokyo' },
      authenticatedUserId: 'usr_1',
      clientSignature: canonicalCurr.signature,
    }).reason,
    'hmac_mismatch'
  );
  assert.equal(
    buildCanonicalMatchPayload({
      matchId: ' m_abc ',
      userId: ' usr_1 ',
      startedAt: 1732480004000.8,
      mapId: 'brasil',
      skinId: 'ratao',
      mode: 'no_coin',
    }),
    'v1|m_abc|usr_1|1732480004000|brasil|ratao|no_coin'
  );

  console.log('ALL_MATCH_SIGNATURE_TESTS_PASSED');
} finally {
  if (prevSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = prevSessionSecret;
  if (prevMatchSecret === undefined) delete process.env.MATCH_SIGNING_SECRET;
  else process.env.MATCH_SIGNING_SECRET = prevMatchSecret;
  global._rataoClusterSecret = undefined;
}
