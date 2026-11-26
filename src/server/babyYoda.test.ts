import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import type express from 'express';
import * as THREE from 'three';
import {
  ALL_SKINS,
  PUBLIC_CATALOG_SKINS,
  SECRET_EXCLUSIVE_SKINS,
  SECRET_EXCLUSIVE_SKIN_IDS,
  isGiftableSkinId,
} from '../shared/constants.ts';
import {
  CharacterAnimState,
  animateCharacterRig,
  createCharacterRig,
} from '../game/characters.ts';

const DB_FILE = path.resolve(process.cwd(), 'data', 'ratao-db.json');
const hadExistingDb = fs.existsSync(DB_FILE);
const originalDbSnapshot = hadExistingDb ? fs.readFileSync(DB_FILE, 'utf8') : null;

const PREV_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  RATAO_DISABLE_AUTOSTART: process.env.RATAO_DISABLE_AUTOSTART,
  ADMIN_INITIAL_USERNAME: process.env.ADMIN_INITIAL_USERNAME,
  ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD,
  ADMIN_SAMUKA_USERNAME: process.env.ADMIN_SAMUKA_USERNAME,
  ADMIN_SAMUKA_PASSWORD: process.env.ADMIN_SAMUKA_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

const RATAO_PASS = `RataoYoda_${crypto.randomBytes(6).toString('hex')}`;
const SAMUKA_PASS = `SamukaYoda_${crypto.randomBytes(6).toString('hex')}`;
const PLAYER_PASS = `PlayerYoda_${crypto.randomBytes(6).toString('hex')}`;

delete process.env.DATABASE_URL;
process.env.RATAO_DISABLE_AUTOSTART = '1';
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ADMIN_INITIAL_USERNAME = 'Ratão';
process.env.ADMIN_INITIAL_PASSWORD = RATAO_PASS;
process.env.ADMIN_SAMUKA_USERNAME = 'Samuka';
process.env.ADMIN_SAMUKA_PASSWORD = SAMUKA_PASS;

if (typeof globalThis.document === 'undefined') {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 64,
          height: 64,
          getContext: () => ({
            createRadialGradient: () => ({ addColorStop: () => {} }),
            fillRect: () => {},
            clearRect: () => {},
            fillStyle: '',
          }),
        };
      }
      return {};
    },
  };
}

async function apiReq<T = any>(
  baseUrl: string,
  route: string,
  opts: {
    method?: string;
    body?: unknown;
    token?: string;
    adminToken?: string;
  } = {}
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.adminToken) headers['x-admin-token'] = opts.adminToken;

  const resp = await fetch(`${baseUrl}${route}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await resp.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: resp.status, data };
}

async function runTests() {
  // 1. Catalog exclusivity & 3D voxel geometry/animations checks
  assert.ok(SECRET_EXCLUSIVE_SKIN_IDS.includes('baby_yoda'), 'baby_yoda must be in SECRET_EXCLUSIVE_SKIN_IDS');
  assert.ok(
    SECRET_EXCLUSIVE_SKINS.some((s) => s.id === 'baby_yoda' && s.name === 'Baby Yoda' && s.exclusiveRule === 'admin'),
    'baby_yoda definition must exist in SECRET_EXCLUSIVE_SKINS'
  );
  assert.ok(
    !PUBLIC_CATALOG_SKINS.some((s) => s.id === 'baby_yoda'),
    'baby_yoda must NOT appear in PUBLIC_CATALOG_SKINS (neither unlocked nor locked)'
  );
  assert.equal(isGiftableSkinId('baby_yoda'), false, 'baby_yoda must never be giftable/promo-redeemable');
  assert.ok(ALL_SKINS.some((s) => s.id === 'baby_yoda'));

  const yodaRig = createCharacterRig('baby_yoda', false);
  let meshCount = 0;
  yodaRig.root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshCount += 1;
  });
  assert.ok(meshCount >= 20, `Baby Yoda 3D voxel model must be detailed (got ${meshCount} meshes)`);
  assert.ok(yodaRig.earLeftPivot && yodaRig.earRightPivot, 'Baby Yoda must have articulated left & right ears');
  const states: CharacterAnimState[] = ['idle', 'run', 'jump', 'slide', 'crash', 'victory', 'stumble', 'jetpack'];
  for (const state of states) {
    animateCharacterRig(yodaRig, state, 1.2, 0.016, 1.25);
    assert.ok(Number.isFinite(yodaRig.bodyPivot.position.y), `Baby Yoda ${state} position finite`);
    assert.ok(Number.isFinite(yodaRig.earLeftPivot!.rotation.z), `Baby Yoda ${state} ear rotation finite`);
  }
  for (let i = 0; i < 40; i++) {
    animateCharacterRig(yodaRig, 'victory', i * 0.05, 0.05, 1);
  }
  assert.ok(yodaRig.bodyPivot.position.y > 0.1, 'Baby Yoda victory animation levitates');
  yodaRig.dispose();

  // Reset local DB cleanly and start Express server
  const { default: app } = (await import('../../server.ts')) as { default: express.Express };
  const { ensureDbAndAdminReady } = await import('./repository.ts');
  const { getDb, saveDb } = await import('./store.ts');
  const db = getDb();
  db.users = {};
  db.sessions = {};
  db.activeMatches = {};
  db.matches = [];
  db.exclusiveSkinPermissions = [];
  db.adminLogs = [];
  db.multiplayerRooms = {};
  db.multiplayerParticipants = [];
  db.multiplayerInvites = [];
  saveDb();
  global._rataoAdminSeeded = false;
  global._rataoAdminSeededKey = undefined;
  await ensureDbAndAdminReady();

  const server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 2. Register 2 common players
    const p1Nick = `Jedi${crypto.randomBytes(3).toString('hex')}`;
    const p2Nick = `YodaPal${crypto.randomBytes(3).toString('hex')}`;
    const reg1 = await apiReq(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { nickname: p1Nick, password: PLAYER_PASS, confirmPassword: PLAYER_PASS },
    });
    assert.equal(reg1.status, 201, `reg1 failed: ${JSON.stringify(reg1.data)}`);
    const p1Token = reg1.data.sessionToken as string;
    const p1User = reg1.data.user;
    assert.ok(p1Token, 'reg1 must return sessionToken');

    const reg2 = await apiReq(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { nickname: p2Nick, password: PLAYER_PASS, confirmPassword: PLAYER_PASS },
    });
    assert.equal(reg2.status, 201, `reg2 failed: ${JSON.stringify(reg2.data)}`);
    const p2Token = reg2.data.sessionToken as string;
    assert.ok(p2Token, 'reg2 must return sessionToken');

    assert.ok(!p1User.allowedExclusiveSkins.includes('baby_yoda'), 'Common player must not have baby_yoda in allowedExclusiveSkins');
    assert.ok(!p1User.unlockedSkins.includes('baby_yoda'), 'Common player must not have baby_yoda in unlockedSkins');

    // 3. Unauthorized player forged requests must return 403
    const forgedEquip = await apiReq(baseUrl, '/api/skins/equip', {
      method: 'POST',
      token: p1Token,
      body: { skinId: 'baby_yoda' },
    });
    assert.equal(forgedEquip.status, 403, 'Unauthorized equip of baby_yoda must return 403');

    const forgedStart = await apiReq(baseUrl, '/api/match/start', {
      method: 'POST',
      token: p1Token,
      body: { mapId: 'brasil', mode: 'normal', skinId: 'baby_yoda' },
    });
    assert.equal(forgedStart.status, 403, 'Unauthorized match start with baby_yoda must return 403');

    const forgedAdminGrant = await apiReq(baseUrl, '/api/admin/skins/secret/grant', {
      method: 'POST',
      token: p1Token,
      body: { nickname: p1Nick, skinId: 'baby_yoda' },
    });
    assert.equal(forgedAdminGrant.status, 403, 'Non-admin cannot grant baby_yoda');

    // 4. Both Ratão & Samuka admins natively have baby_yoda, can equip, save & start match
    const rataoLogin = await apiReq(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { nickname: 'Ratão', password: RATAO_PASS },
    });
    assert.equal(rataoLogin.status, 200);
    const rataoToken = rataoLogin.data.sessionToken as string;
    assert.ok(rataoLogin.data.user.allowedExclusiveSkins.includes('baby_yoda'), 'Ratão must have native Baby Yoda access');
    assert.ok(rataoLogin.data.user.unlockedSkins.includes('baby_yoda'), 'Ratão unlockedSkins must include Baby Yoda');

    const samukaLogin = await apiReq(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { nickname: 'Samuka', password: SAMUKA_PASS },
    });
    assert.equal(samukaLogin.status, 200);
    const samukaToken = samukaLogin.data.sessionToken as string;
    assert.ok(samukaLogin.data.user.allowedExclusiveSkins.includes('baby_yoda'), 'Samuka must have native Baby Yoda access');
    assert.ok(samukaLogin.data.user.unlockedSkins.includes('baby_yoda'), 'Samuka unlockedSkins must include Baby Yoda');

    const samukaAdminLogin = await apiReq(baseUrl, '/api/admin/secret-login', {
      method: 'POST',
      body: { password: SAMUKA_PASS },
    });
    assert.equal(samukaAdminLogin.status, 200, `secret-login failed: ${JSON.stringify(samukaAdminLogin.data)}`);
    const samukaAdminToken = samukaAdminLogin.data.adminSessionToken as string;
    assert.ok(samukaAdminToken, 'secret-login must return adminSessionToken');

    const samukaEquip = await apiReq(baseUrl, '/api/skins/equip', {
      method: 'POST',
      token: samukaToken,
      body: { skinId: 'baby_yoda' },
    });
    assert.equal(samukaEquip.status, 200);
    assert.equal(samukaEquip.data.equippedSkin, 'baby_yoda');

    const samukaMe = await apiReq(baseUrl, '/api/auth/me', { token: samukaToken });
    assert.equal(samukaMe.status, 200);
    assert.equal(samukaMe.data.user.equippedSkin, 'baby_yoda', 'Equipped Baby Yoda persists across reload (/api/auth/me)');

    const rataoEquip = await apiReq(baseUrl, '/api/skins/equip', {
      method: 'POST',
      token: rataoToken,
      body: { skinId: 'baby_yoda' },
    });
    assert.equal(rataoEquip.status, 200);

    const rataoStartMatch = await apiReq(baseUrl, '/api/match/start', {
      method: 'POST',
      token: rataoToken,
      body: { mapId: 'brasil', mode: 'normal', skinId: 'baby_yoda' },
    });
    assert.equal(rataoStartMatch.status, 200, 'Ratão can start matches with Baby Yoda');

    // 5. Promo code, gift, and bulk grant must NEVER grant baby_yoda
    const promoAttempt = await apiReq(baseUrl, '/api/admin/promo-codes', {
      method: 'POST',
      adminToken: samukaAdminToken,
      body: {
        code: 'YODALEAK',
        rewardType: 'skin',
        rewardSkinId: 'baby_yoda',
        isInfinite: true,
      },
    });
    assert.equal(promoAttempt.status, 403, `Promo codes cannot use baby_yoda: ${JSON.stringify(promoAttempt.data)}`);

    const giftAttempt = await apiReq(baseUrl, '/api/admin/gift-skin', {
      method: 'POST',
      adminToken: samukaAdminToken,
      body: { nickname: p1Nick, skinId: 'baby_yoda' },
    });
    assert.equal(giftAttempt.status, 403, `Admin gift-skin cannot send baby_yoda: ${JSON.stringify(giftAttempt.data)}`);

    const bulkAttempt = await apiReq(baseUrl, '/api/admin/skins/grant-all', {
      method: 'POST',
      adminToken: samukaAdminToken,
      body: { nickname: p1Nick },
    });
    assert.equal(bulkAttempt.status, 200);
    assert.ok(!bulkAttempt.data.grantedSkins.includes('baby_yoda'), 'Bulk grant must NOT include baby_yoda');
    assert.ok(!bulkAttempt.data.summary.unlockedSkinIds.includes('baby_yoda'));

    const p1AfterBulk = await apiReq(baseUrl, '/api/auth/me', { token: p1Token });
    assert.ok(!p1AfterBulk.data.user.allowedExclusiveSkins.includes('baby_yoda'));

    // 6. Admin Samuka grants Baby Yoda to P1, verifies grantedBy === 'Samuka', P1 equips & replicates in multiplayer
    const grantRes = await apiReq(baseUrl, '/api/admin/skins/secret/grant', {
      method: 'POST',
      adminToken: samukaAdminToken,
      body: { nickname: p1Nick, skinId: 'baby_yoda' },
    });
    assert.equal(grantRes.status, 201);
    assert.equal(grantRes.data.owner.skinId, 'baby_yoda');
    assert.equal(grantRes.data.owner.grantedBy, 'Samuka', 'Must record which admin granted Baby Yoda');

    const ownersRes = await apiReq(baseUrl, '/api/admin/skins/secret?skinId=baby_yoda', {
      adminToken: samukaAdminToken,
    });
    assert.equal(ownersRes.status, 200);
    const p1Owner = ownersRes.data.owners.find((o: any) => o.userId === p1User.id);
    assert.ok(p1Owner, 'P1 must appear in Baby Yoda owners query');
    assert.equal(p1Owner.grantedBy, 'Samuka');

    const p1Equip = await apiReq(baseUrl, '/api/skins/equip', {
      method: 'POST',
      token: p1Token,
      body: { skinId: 'baby_yoda' },
    });
    assert.equal(p1Equip.status, 200);

    // Multiplayer replication check: P1 (with Baby Yoda) invites P2 -> room participants carry skinId: 'baby_yoda'
    const invRes = await apiReq(baseUrl, '/api/multiplayer/invites', {
      method: 'POST',
      token: p1Token,
      body: { targetNickname: p2Nick, mode: 'x1', mapId: 'brasil' },
    });
    assert.equal(invRes.status, 201, `mp invite failed: ${JSON.stringify(invRes.data)}`);
    const inviteId = invRes.data.invite.id as string;
    const roomId = invRes.data.room.id as string;
    const hostParticipant = invRes.data.participants.find((pt: any) => pt.userId === p1User.id);
    assert.equal(hostParticipant.skinId, 'baby_yoda', 'Multiplayer host participant replicates baby_yoda');

    const acceptRes = await apiReq(baseUrl, `/api/multiplayer/invites/${inviteId}/respond`, {
      method: 'POST',
      token: p2Token,
      body: { action: 'accept' },
    });
    assert.equal(acceptRes.status, 200);
    const roomViewP2 = await apiReq(baseUrl, `/api/multiplayer/rooms/${roomId}`, { token: p2Token });
    assert.equal(roomViewP2.status, 200);
    const p1SeenByP2 = roomViewP2.data.participants.find((pt: any) => pt.userId === p1User.id);
    assert.equal(p1SeenByP2.skinId, 'baby_yoda', 'Opponent sees baby_yoda skinId in multiplayer room');

    // Clean up room before revoking
    await apiReq(baseUrl, `/api/multiplayer/rooms/${roomId}/leave`, { method: 'POST', token: p1Token });
    await apiReq(baseUrl, `/api/multiplayer/rooms/${roomId}/leave`, { method: 'POST', token: p2Token });

    // 7. Revoking Baby Yoda from P1 resets equippedSkin to 'ratao' and blocks re-equipping; admins remain protected (409)
    const revokeAdminAttempt = await apiReq(baseUrl, '/api/admin/skins/secret/revoke', {
      method: 'POST',
      adminToken: samukaAdminToken,
      body: { userId: rataoLogin.data.user.id, skinId: 'baby_yoda' },
    });
    assert.equal(revokeAdminAttempt.status, 409, 'Native admin access to Baby Yoda cannot be revoked');

    const revokeP1 = await apiReq(baseUrl, '/api/admin/skins/secret/revoke', {
      method: 'POST',
      adminToken: samukaAdminToken,
      body: { userId: p1User.id, skinId: 'baby_yoda' },
    });
    assert.equal(revokeP1.status, 200);
    assert.equal(revokeP1.data.resetEquipped, true, 'Revoking Baby Yoda must reset equippedSkin to ratao');

    const p1AfterRevoke = await apiReq(baseUrl, '/api/auth/me', { token: p1Token });
    assert.equal(p1AfterRevoke.data.user.equippedSkin, 'ratao');
    assert.ok(!p1AfterRevoke.data.user.allowedExclusiveSkins.includes('baby_yoda'));

    const p1ReEquipAttempt = await apiReq(baseUrl, '/api/skins/equip', {
      method: 'POST',
      token: p1Token,
      body: { skinId: 'baby_yoda' },
    });
    assert.equal(p1ReEquipAttempt.status, 403, 'Revoked player cannot re-equip Baby Yoda');

    console.log('ALL_BABY_YODA_TESTS_PASSED');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, 'utf8');
    } else if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
    Object.entries(PREV_ENV).forEach(([k, v]) => {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
      else (process.env as Record<string, string | undefined>)[k] = v;
    });
  }
}

runTests().catch((err) => {
  console.error('BABY_YODA_TEST_FAILED:', err);
  process.exit(1);
});
