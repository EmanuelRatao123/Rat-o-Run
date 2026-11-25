import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import type express from 'express';

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

// Runtime-only ephemeral test credentials (zero hardcoded production passwords)
const RATAO_PASS = `RataoSec_${crypto.randomBytes(6).toString('hex')}`;
const SAMUKA_PASS = `SamukaSec_${crypto.randomBytes(6).toString('hex')}`;
const PLAYER_PASS = `PlayerSec_${crypto.randomBytes(6).toString('hex')}`;
const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

// Configure isolated test environment BEFORE importing server.ts
delete process.env.DATABASE_URL;
process.env.RATAO_DISABLE_AUTOSTART = '1';
process.env.SESSION_SECRET = EPHEMERAL_SESSION_SECRET;
process.env.ADMIN_INITIAL_USERNAME = 'Ratão';
process.env.ADMIN_INITIAL_PASSWORD = RATAO_PASS;
process.env.ADMIN_SAMUKA_USERNAME = 'Samuka';
process.env.ADMIN_SAMUKA_PASSWORD = SAMUKA_PASS;

function createValid1x1PngBase64DataUrl(): string {
  // Minimal valid 1x1 transparent RGBA PNG
  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
      '0000000d49444154789c6360000000020001e221bc330000000049454e44ae426082',
    'hex'
  );
  return `data:image/png;base64,${pngBytes.toString('base64')}`;
}

async function rawHttp(
  baseUrl: string,
  route: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<{ status: number; headers: Headers; text: string; json: any }> {
  const resp = await fetch(`${baseUrl}${route}`, {
    method: opts.method || 'GET',
    headers: opts.headers,
    body: opts.body,
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: resp.status, headers: resp.headers, text, json };
}

async function apiReq<T = any>(
  baseUrl: string,
  route: string,
  opts: {
    method?: string;
    body?: unknown;
    token?: string;
    adminToken?: string;
    cookie?: string;
    extraHeaders?: Record<string, string>;
    omitXRequestedWith?: boolean;
  } = {}
): Promise<{ status: number; headers: Headers; data: T; rawText: string }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!opts.omitXRequestedWith) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }
  if (opts.adminToken) {
    headers['x-admin-token'] = opts.adminToken;
  }
  if (opts.cookie) {
    headers.Cookie = opts.cookie;
  }
  if (opts.extraHeaders) {
    Object.assign(headers, opts.extraHeaders);
  }

  const res = await rawHttp(baseUrl, route, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  return {
    status: res.status,
    headers: res.headers,
    data: (res.json ?? {}) as T,
    rawText: res.text,
  };
}

function extractCookiePair(headers: Headers, cookieName: string): string | null {
  const setCookieHeader =
    typeof (headers as any).getSetCookie === 'function'
      ? ((headers as any).getSetCookie() as string[])
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const entry of setCookieHeader) {
    const match = entry.match(new RegExp(`(?:^|,\\s*)${cookieName}=([^;]+)`));
    if (match) {
      return `${cookieName}=${match[1]}`;
    }
  }
  return null;
}

async function runSecurityAuditTests() {
  const { default: app } = (await import('../../server.ts')) as { default: express.Express };
  const { ensureDbAndAdminReady } = await import('./repository.ts');
  const { getDb, saveDb } = await import('./store.ts');
  const { repoSendFriendRequest, repoRespondFriendRequest } = await import(
    './socialShopRepository.ts'
  );

  let server: ReturnType<express.Express['listen']> | null = null;

  try {
    // Clean isolated DB state
    const db = getDb();
    db.users = {};
    db.sessions = {};
    db.adminLogs = [];
    db.securityAuditLogs = [];
    db.matches = [];
    db.activeMatches = {};
    db.playerWalletStats = {};
    db.playerCompetitiveStats = {};
    db.playerSkateInventory = {};
    db.shopTransactions = [];
    db.matchSkateUses = [];
    db.coinLedgerEvents = [];
    db.friendships = [];
    db.friendMessages = [];
    db.voiceCalls = [];
    db.voiceCallSignals = [];
    db.multiplayerInvites = [];
    db.multiplayerRooms = {};
    db.multiplayerParticipants = [];
    db.multiplayerEvents = [];
    db.promoCodes = [];
    db.promoCodeRedemptions = [];
    db.customCharacterConfigs = {};
    db.customCharacterTextures = [];
    db.exclusiveSkinPermissions = [];
    saveDb();

    global._rataoAdminSeeded = false;
    global._rataoAdminSeededKey = undefined;
    await ensureDbAndAdminReady();

    server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const hostHeader = `127.0.0.1:${port}`;

    // =========================================================================
    // SCENARIO 1: Unauthenticated access blocked on protected routes (401)
    // =========================================================================
    for (const check of [
      { method: 'GET', route: '/api/auth/me' },
      { method: 'POST', route: '/api/match/start', body: { mapId: 'brasil', mode: 'no_coin' } },
      { method: 'POST', route: '/api/shop/buy', body: { skateId: 'skate_classico', quantity: 1 } },
      { method: 'GET', route: '/api/friends' },
      { method: 'GET', route: '/api/calls/state' },
      { method: 'GET', route: '/api/multiplayer/overview' },
      { method: 'GET', route: '/api/custom-character' },
      { method: 'PUT', route: '/api/custom-character', body: {} },
    ]) {
      const r = await apiReq(baseUrl, check.route, {
        method: check.method,
        body: check.body,
      });
      assert.equal(r.status, 401, `Unauthenticated ${check.method} ${check.route} must return 401`);
    }

    // Register Players 1, 2, 3 cleanly via real API + verify mass-assignment immunity
    const regP1 = await apiReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/register',
      {
        method: 'POST',
        body: {
          nickname: 'SecPlayer1',
          password: PLAYER_PASS,
          confirmPassword: PLAYER_PASS,
          recoveryCode: 'rec_p1_secret_99',
          // Mass-assignment attack attempt:
          role: 'admin',
          unlockedSkins: ['ratao_rei', 'top1', 'shrek'],
          totalCoins: 999999,
          availableCoins: 999999,
        },
      }
    );
    assert.equal(regP1.status, 201);
    assert.equal(regP1.data.user.role, 'player', 'Registration must never honor client-supplied role');
    assert.equal(regP1.data.user.totalCoins, 0);
    assert.ok(!regP1.data.user.unlockedSkins.includes('ratao_rei'));
    assert.ok(!regP1.data.user.unlockedSkins.includes('shrek'));

    const p1Cookie = extractCookiePair(regP1.headers, 'ratao_session');
    assert.ok(p1Cookie, 'Register response must issue HttpOnly ratao_session cookie');
    const p1Token = regP1.data.sessionToken;
    const p1UserId = regP1.data.user.id;

    const regP2 = await apiReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/register',
      {
        method: 'POST',
        body: {
          nickname: 'SecPlayer2',
          password: PLAYER_PASS,
          confirmPassword: PLAYER_PASS,
        },
      }
    );
    assert.equal(regP2.status, 201);
    const p2Token = regP2.data.sessionToken;
    const p2UserId = regP2.data.user.id;

    const regP3 = await apiReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/register',
      {
        method: 'POST',
        body: {
          nickname: 'SecPlayer3',
          password: PLAYER_PASS,
          confirmPassword: PLAYER_PASS,
        },
      }
    );
    assert.equal(regP3.status, 201);
    const p3Token = regP3.data.sessionToken;
    const p3UserId = regP3.data.user.id;

    // Login Samuka (preserving PAINEL ADMIN flow)
    const samukaLogin = await apiReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        body: { nickname: 'Samuka', password: SAMUKA_PASS },
      }
    );
    assert.equal(samukaLogin.status, 200);
    assert.equal(samukaLogin.data.user.role, 'admin');
    assert.equal(samukaLogin.data.user.showAdminPanelButton, true);
    const samukaToken = samukaLogin.data.sessionToken;

    // =========================================================================
    // SCENARIO 2: Common player attempting admin actions blocked (403)
    // =========================================================================
    for (const admCheck of [
      { method: 'GET', route: '/api/admin/stats' },
      { method: 'GET', route: '/api/admin/security-logs' },
      { method: 'POST', route: '/api/admin/skins/grant-all', body: { nickname: 'SecPlayer1' } },
      {
        method: 'POST',
        route: '/api/admin/promo-codes',
        body: { code: 'EVIL999', rewardType: 'coins', rewardAmount: 50000 },
      },
      { method: 'POST', route: '/api/admin/unlock-king-skin' },
    ]) {
      const r = await apiReq(baseUrl, admCheck.route, {
        method: admCheck.method,
        token: p1Token,
        body: admCheck.body,
      });
      assert.equal(r.status, 403, `Player must receive 403 on ${admCheck.route}`);
    }

    // =========================================================================
    // SCENARIO 3: Equipping/starting with locked, exclusive, secret or admin skin (403)
    // =========================================================================
    for (const lockedSkin of ['homem_aranha', 'shrek', 'ratao_rei', 'plankton', 'lenda_suprema']) {
      const eqRes = await apiReq(baseUrl, '/api/skins/equip', {
        method: 'POST',
        token: p1Token,
        body: { skinId: lockedSkin },
      });
      assert.equal(eqRes.status, 403, `Equip locked skin ${lockedSkin} must return 403`);

      const stRes = await apiReq(baseUrl, '/api/match/start', {
        method: 'POST',
        token: p1Token,
        body: { mapId: 'brasil', skinId: lockedSkin, mode: 'no_coin' },
      });
      assert.equal(stRes.status, 403, `startMatch locked skin ${lockedSkin} must return 403`);
    }

    // =========================================================================
    // SCENARIO 4: NO COIN match forgery, cross-user matchId, and tamper rejection
    // =========================================================================
    const p1Start = await apiReq<{
      matchId: string;
      startedAt: number;
      signature: string;
      mode: string;
    }>(baseUrl, '/api/match/start', {
      method: 'POST',
      token: p1Token,
      body: { mapId: 'brasil', skinId: 'ratao', mode: 'no_coin' },
    });
    assert.equal(p1Start.status, 200);
    assert.equal(p1Start.data.mode, 'no_coin');

    // Forged signature rejected with 403
    const forgedSigRes = await apiReq(baseUrl, '/api/match/finish', {
      method: 'POST',
      token: p1Token,
      body: {
        matchId: p1Start.data.matchId,
        signature: 'deadbeef'.repeat(8),
        noCoinTimeMs: 1200,
        collectedCoin: false,
        coins: 0,
        distance: 20,
        score: 40,
        durationMs: 1200,
      },
    });
    assert.equal(forgedSigRes.status, 403);

    // Cross-user matchId submission rejected with 403
    const crossUserRes = await apiReq(baseUrl, '/api/match/finish', {
      method: 'POST',
      token: p2Token,
      body: {
        matchId: p1Start.data.matchId,
        signature: p1Start.data.signature,
        noCoinTimeMs: 1200,
        collectedCoin: false,
        coins: 0,
        distance: 20,
        score: 40,
        durationMs: 1200,
      },
    });
    assert.equal(crossUserRes.status, 403);

    // Implausible durationMs (> wall elapsed + margin) rejected with 422
    const durationTamperRes = await apiReq(baseUrl, '/api/match/finish', {
      method: 'POST',
      token: p1Token,
      body: {
        matchId: p1Start.data.matchId,
        signature: p1Start.data.signature,
        noCoinTimeMs: 500000,
        collectedCoin: false,
        coins: 0,
        distance: 500,
        score: 1000,
        durationMs: 500000,
      },
    });
    assert.equal(durationTamperRes.status, 422);

    // Implausible distance (> physical cap) rejected with 422
    const distTamperRes = await apiReq(baseUrl, '/api/match/finish', {
      method: 'POST',
      token: p1Token,
      body: {
        matchId: p1Start.data.matchId,
        signature: p1Start.data.signature,
        noCoinTimeMs: 1500,
        collectedCoin: false,
        coins: 0,
        distance: 999999,
        score: 100,
        durationMs: 1500,
      },
    });
    assert.equal(distTamperRes.status, 422);

    // =========================================================================
    // SCENARIO 5 & 12: Coin manipulation (solo + Co-op + X1) & unauthorized MP rooms
    // =========================================================================
    // Solo normal match coin injection rejected
    const p1NormalStart = await apiReq<{ matchId: string; signature: string }>(
      baseUrl,
      '/api/match/start',
      {
        method: 'POST',
        token: p1Token,
        body: { mapId: 'tokyo', skinId: 'ratao', mode: 'normal' },
      }
    );
    assert.equal(p1NormalStart.status, 200);
    const soloCoinSpike = await apiReq(baseUrl, '/api/match/finish', {
      method: 'POST',
      token: p1Token,
      body: {
        matchId: p1NormalStart.data.matchId,
        signature: p1NormalStart.data.signature,
        noCoinTimeMs: 0,
        collectedCoin: true,
        coins: 50000,
        distance: 20,
        score: 100,
        durationMs: 1000,
      },
    });
    assert.equal(soloCoinSpike.status, 422);

    // Setup Co-op room P1 <-> P2 and verify coin/duration/distance tamper + P3 non-participant denial
    const mpInvite = await apiReq<{ invite: { id: string }; room: { id: string } }>(
      baseUrl,
      '/api/multiplayer/invites',
      {
        method: 'POST',
        token: p1Token,
        body: { targetNickname: 'SecPlayer2', mode: 'coop', mapId: 'brasil' },
      }
    );
    assert.equal(mpInvite.status, 201);
    const coopRoomId = mpInvite.data.room.id;
    const coopInviteId = mpInvite.data.invite.id;

    // P3 trying to accept P2's invite -> 403
    const p3AcceptInvite = await apiReq(baseUrl, `/api/multiplayer/invites/${coopInviteId}/respond`, {
      method: 'POST',
      token: p3Token,
      body: { action: 'accept' },
    });
    assert.equal(p3AcceptInvite.status, 403);

    // P2 accepts invite
    const p2AcceptInvite = await apiReq(baseUrl, `/api/multiplayer/invites/${coopInviteId}/respond`, {
      method: 'POST',
      token: p2Token,
      body: { action: 'accept' },
    });
    assert.equal(p2AcceptInvite.status, 200);

    // Scenario 12: Non-participant P3 trying to read/sync/leave Co-op room -> 404
    assert.equal(
      (await apiReq(baseUrl, `/api/multiplayer/rooms/${coopRoomId}`, { token: p3Token })).status,
      404
    );
    assert.equal(
      (
        await apiReq(baseUrl, `/api/multiplayer/rooms/${coopRoomId}/sync`, {
          method: 'POST',
          token: p3Token,
          body: { distance: 10, coins: 0 },
        })
      ).status,
      404
    );
    assert.equal(
      (
        await apiReq(baseUrl, `/api/multiplayer/rooms/${coopRoomId}/leave`, {
          method: 'POST',
          token: p3Token,
        })
      ).status,
      404
    );

    // Ready & start Co-op match
    assert.equal(
      (
        await apiReq(baseUrl, `/api/multiplayer/rooms/${coopRoomId}/ready`, {
          method: 'POST',
          token: p1Token,
          body: { ready: true },
        })
      ).status,
      200
    );
    assert.equal(
      (
        await apiReq(baseUrl, `/api/multiplayer/rooms/${coopRoomId}/ready`, {
          method: 'POST',
          token: p2Token,
          body: { ready: true },
        })
      ).status,
      200
    );
    const mpStartRes = await apiReq<{ room: { startedAt: number } }>(
      baseUrl,
      `/api/multiplayer/rooms/${coopRoomId}/start`,
      {
        method: 'POST',
        token: p1Token,
      }
    );
    assert.equal(mpStartRes.status, 200);

    // Co-op coin injection (coins: 50000 at t=0) -> 422 + zero coins credited
    const coopCoinTamper = await apiReq(baseUrl, `/api/multiplayer/rooms/${coopRoomId}/sync`, {
      method: 'POST',
      token: p1Token,
      body: {
        coins: 50000,
        distance: 10,
        durationMs: 1000,
        alive: false,
      },
    });
    assert.equal(coopCoinTamper.status, 422, 'Fake Co-op coins must be rejected with 422');

    // Cleanly leave Co-op room before testing X1
    await apiReq(baseUrl, `/api/multiplayer/rooms/${coopRoomId}/leave`, {
      method: 'POST',
      token: p1Token,
    });

    // Setup X1 room P1 <-> P2 and verify X1 coin telemetry > 0 is rejected (422)
    const x1Invite = await apiReq<{ invite: { id: string }; room: { id: string } }>(
      baseUrl,
      '/api/multiplayer/invites',
      {
        method: 'POST',
        token: p1Token,
        body: { targetNickname: 'SecPlayer2', mode: 'x1', mapId: 'brasil' },
      }
    );
    assert.equal(x1Invite.status, 201);
    const x1RoomId = x1Invite.data.room.id;
    await apiReq(baseUrl, `/api/multiplayer/invites/${x1Invite.data.invite.id}/respond`, {
      method: 'POST',
      token: p2Token,
      body: { action: 'accept' },
    });
    await apiReq(baseUrl, `/api/multiplayer/rooms/${x1RoomId}/ready`, {
      method: 'POST',
      token: p1Token,
      body: { ready: true },
    });
    await apiReq(baseUrl, `/api/multiplayer/rooms/${x1RoomId}/ready`, {
      method: 'POST',
      token: p2Token,
      body: { ready: true },
    });
    await apiReq(baseUrl, `/api/multiplayer/rooms/${x1RoomId}/start`, {
      method: 'POST',
      token: p1Token,
    });

    const x1CoinTamper = await apiReq(baseUrl, `/api/multiplayer/rooms/${x1RoomId}/sync`, {
      method: 'POST',
      token: p1Token,
      body: {
        coins: 15,
        distance: 25,
        durationMs: 1500,
        alive: true,
      },
    });
    assert.equal(x1CoinTamper.status, 422, 'X1 mode reporting collected coins without coin death must return 422');

    await apiReq(baseUrl, `/api/multiplayer/rooms/${x1RoomId}/leave`, {
      method: 'POST',
      token: p1Token,
    });

    // Verify P1 wallet still has 0 coins after all rejected exploits
    const p1ShopZero = await apiReq<{ availableCoins: number }>(baseUrl, '/api/shop', {
      token: p1Token,
    });
    assert.equal(p1ShopZero.data.availableCoins, 0, 'Wallet must remain at 0 after tamper attempts');

    // =========================================================================
    // SCENARIO 6: Skate consumption without valid active matchId / zero uses
    // =========================================================================
    // Try buying skate with 0 coins -> 409
    const buyBrokeRes = await apiReq(baseUrl, '/api/shop/buy', {
      method: 'POST',
      token: p1Token,
      body: { skateId: 'skate_classico', quantity: 1 },
    });
    assert.equal(buyBrokeRes.status, 409);

    // Grant promo coins legitimately via Samuka admin promo code so P1 can buy 1 skate
    const coinPromoCreate = await apiReq(baseUrl, '/api/admin/promo-codes', {
      method: 'POST',
      token: samukaToken,
      body: {
        code: 'SECSKATE50',
        description: 'Moedas teste skate',
        rewardType: 'coins',
        rewardAmount: 120,
        isInfinite: false,
        maxUses: 5,
      },
    });
    assert.equal(coinPromoCreate.status, 201);

    const redeemCoinsRes = await apiReq(baseUrl, '/api/promo-codes/redeem', {
      method: 'POST',
      token: p1Token,
      body: { code: 'SECSKATE50' },
    });
    assert.equal(redeemCoinsRes.status, 200);

    const buySkateRes = await apiReq(baseUrl, '/api/shop/buy', {
      method: 'POST',
      token: p1Token,
      body: { skateId: 'skate_classico', quantity: 1 },
    });
    assert.equal(buySkateRes.status, 201);

    // Arbitrary fake matchId -> 403 invalid_match (must NOT decrement charges)
    const fakeSkateConsume = await apiReq<{ reason: string }>(
      baseUrl,
      '/api/match/skate/use',
      {
        method: 'POST',
        token: p1Token,
        body: {
          matchId: 'm_forged_unowned_123',
          skateId: 'skate_classico',
          mode: 'no_coin',
          eventKey: 'evt_forged_1',
        },
      }
    );
    assert.equal(fakeSkateConsume.status, 403);
    assert.equal(fakeSkateConsume.data.reason, 'invalid_match');

    // Consuming with P1's real active matchId succeeds ONCE (consuming 1 charge)
    const realSkateConsume = await apiReq<{ consumed: boolean; remainingCharges: number }>(
      baseUrl,
      '/api/match/skate/use',
      {
        method: 'POST',
        token: p1Token,
        body: {
          matchId: p1Start.data.matchId,
          skateId: 'skate_classico',
          mode: 'no_coin',
          eventKey: 'evt_real_1',
        },
      }
    );
    assert.equal(realSkateConsume.status, 200);
    assert.equal(realSkateConsume.data.consumed, true);
    assert.equal(realSkateConsume.data.remainingCharges, 0);

    // Attempting second consumption when remainingUses=0 -> 409
    const emptySkateConsume = await apiReq(baseUrl, '/api/match/skate/use', {
      method: 'POST',
      token: p1Token,
      body: {
        matchId: p1Start.data.matchId,
        skateId: 'skate_classico',
        mode: 'no_coin',
        eventKey: 'evt_real_2',
      },
    });
    assert.equal(emptySkateConsume.status, 409);

    // =========================================================================
    // SCENARIO 15 (Part A): Legitimate NO COIN match completion -> leaderboard
    // =========================================================================
    await new Promise((r) => setTimeout(r, 120));
    const legitFinish = await apiReq<{ summary: { confirmedByServer: boolean } }>(
      baseUrl,
      '/api/match/finish',
      {
        method: 'POST',
        token: p1Token,
        body: {
          matchId: p1Start.data.matchId,
          signature: p1Start.data.signature,
          noCoinTimeMs: 100,
          collectedCoin: false,
          coins: 0,
          distance: 12,
          score: 25,
          durationMs: 100,
          endReason: 'police',
        },
      }
    );
    assert.equal(legitFinish.status, 200);
    assert.equal(legitFinish.data.summary.confirmedByServer, true);

    const lbRes = await apiReq<{ entries: { nickname: string; noCoinTimeMs: number }[] }>(
      baseUrl,
      '/api/leaderboard?category=no_coin'
    );
    assert.equal(lbRes.status, 200);
    assert.ok(lbRes.data.entries.some((e) => e.nickname === 'SecPlayer1' && e.noCoinTimeMs >= 100));

    // =========================================================================
    // SCENARIO 9: Non-friend chat, non-friend calls & third-party call hijacking (403)
    // =========================================================================
    // P1 and P2 are NOT friends
    const chatReadDenied = await apiReq(baseUrl, `/api/friends/messages/${p2UserId}`, {
      token: p1Token,
    });
    assert.equal(chatReadDenied.status, 403);

    const chatSendDenied = await apiReq(baseUrl, `/api/friends/messages/${p2UserId}`, {
      method: 'POST',
      token: p1Token,
      body: { content: 'Oi estranho!' },
    });
    assert.equal(chatSendDenied.status, 403);

    const callNonFriend = await apiReq(baseUrl, '/api/calls/invite', {
      method: 'POST',
      token: p1Token,
      body: { targetUserId: p2UserId },
    });
    assert.equal(callNonFriend.status, 403);

    // Make P1 <-> P2 friends so P1 can invite P2 to a call, then P3 tries hijacking
    const frReq = await repoSendFriendRequest({
      requesterId: p1UserId,
      requesterNickname: 'SecPlayer1',
      targetUserId: p2UserId,
    });
    assert.equal(frReq.status, 'ok');
    if (frReq.status !== 'ok') throw new Error('Expected friend request');
    await repoRespondFriendRequest({
      userId: p2UserId,
      friendshipId: frReq.friendshipId,
      action: 'accept',
    });

    const callInv = await apiReq<{ call: { id: string } }>(baseUrl, '/api/calls/invite', {
      method: 'POST',
      token: p1Token,
      body: { targetUserId: p2UserId },
    });
    assert.equal(callInv.status, 201);
    const activeCallId = callInv.data.call.id;

    // P2 accepts call
    assert.equal(
      (
        await apiReq(baseUrl, `/api/calls/${activeCallId}/respond`, {
          method: 'POST',
          token: p2Token,
          body: { action: 'accept' },
        })
      ).status,
      200
    );

    // Third-party P3 trying to inject SDP signal or hang up P1<->P2 call -> 403
    const callSignalHijack = await apiReq(baseUrl, `/api/calls/${activeCallId}/signal`, {
      method: 'POST',
      token: p3Token,
      body: { type: 'offer', payload: { sdp: 'evil-sdp' } },
    });
    assert.equal(callSignalHijack.status, 403);

    const callEndHijack = await apiReq(baseUrl, `/api/calls/${activeCallId}/end`, {
      method: 'POST',
      token: p3Token,
      body: { reason: 'hangup' },
    });
    assert.equal(callEndHijack.status, 403);

    // P1 ends call cleanly
    assert.equal(
      (
        await apiReq(baseUrl, `/api/calls/${activeCallId}/end`, {
          method: 'POST',
          token: p1Token,
          body: { reason: 'hangup' },
        })
      ).status,
      200
    );

    // =========================================================================
    // SCENARIO 10: Promo code brute force blocked (429)
    // =========================================================================
    let saw404Promo = false;
    let saw429Promo = false;
    for (let i = 0; i < 12; i++) {
      const badPromo = await apiReq(baseUrl, '/api/promo-codes/redeem', {
        method: 'POST',
        token: p2Token,
        body: { code: `INVALID_${i}` },
      });
      if (badPromo.status === 404) saw404Promo = true;
      if (badPromo.status === 429) {
        saw429Promo = true;
        break;
      }
      assert.equal(badPromo.status, 404);
    }
    assert.ok(saw404Promo, 'Non-existent promo code must return 404 before rate lockout');
    assert.ok(saw429Promo, 'Promo code brute force must hit 429');

    // =========================================================================
    // SCENARIO 11: Invalid Meu Ratão uploads (SVG, bad PNG, corrupted IHDR) + traversal
    // =========================================================================
    // Before unlock -> 403
    const lockedCustom = await apiReq(baseUrl, '/api/custom-character', {
      method: 'PUT',
      token: p1Token,
      body: { hairStyle: 'short' },
    });
    assert.equal(lockedCustom.status, 403);

    // Admin grants Meu Ratão via grant-all (preserving Ratão Rei / Top 1..3 restriction)
    const grantAllP1 = await apiReq(baseUrl, '/api/admin/skins/grant-all', {
      method: 'POST',
      token: samukaToken,
      body: { nickname: 'SecPlayer1' },
    });
    assert.equal(grantAllP1.status, 200);

    // SVG / script XSS attempt -> 400
    const svgUpload = await apiReq(baseUrl, '/api/custom-character', {
      method: 'PUT',
      token: p1Token,
      body: {
        paintTextures: {
          head: `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}`,
        },
      },
    });
    assert.equal(svgUpload.status, 400);

    // Non-PNG bytes disguised with image/png mime -> 400
    const fakePngUpload = await apiReq(baseUrl, '/api/custom-character', {
      method: 'PUT',
      token: p1Token,
      body: {
        paintTextures: {
          head: `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`,
        },
      },
    });
    assert.equal(fakePngUpload.status, 400);

    // Corrupted PNG IHDR dimensions (width = 99999 px) -> 400
    const bogusPng = Buffer.from(
      '89504e470d0a1a0a0000000d494844520001869f00000001080600000000000000',
      'hex'
    );
    const badIhdrUpload = await apiReq(baseUrl, '/api/custom-character', {
      method: 'PUT',
      token: p1Token,
      body: {
        paintTextures: {
          head: `data:image/png;base64,${bogusPng.toString('base64')}`,
        },
      },
    });
    assert.equal(badIhdrUpload.status, 400);

    // Path traversal attempt on texture route -> 404
    const traversalGet = await rawHttp(
      baseUrl,
      '/api/custom-character/textures/..%2F..%2Fpackage.json'
    );
    assert.equal(traversalGet.status, 404);

    // Legitimate 1x1 PNG upload succeeds & serves strictly as image/png + nosniff
    const validUpload = await apiReq<{ config: { paintTextures: { head?: string } } }>(
      baseUrl,
      '/api/custom-character',
      {
        method: 'PUT',
        token: p1Token,
        body: {
          hairStyle: 'spiky',
          paintTextures: { head: createValid1x1PngBase64DataUrl() },
        },
      }
    );
    assert.equal(validUpload.status, 200);
    assert.ok(validUpload.data.config.paintTextures.head?.startsWith('/api/custom-character/textures/'));

    const texResp = await rawHttp(baseUrl, validUpload.data.config.paintTextures.head!);
    assert.equal(texResp.status, 200);
    assert.equal(texResp.headers.get('content-type')?.split(';')[0], 'image/png');
    assert.equal(texResp.headers.get('x-content-type-options'), 'nosniff');

    // =========================================================================
    // SCENARIO 13: Cross-origin CSRF blocked even WITH X-Requested-With header
    // =========================================================================
    const csrfBadOriginEquip = await apiReq(baseUrl, '/api/skins/equip', {
      method: 'POST',
      cookie: p1Cookie!,
      body: { skinId: 'capivara' },
      extraHeaders: {
        Host: hostHeader,
        Origin: 'https://evil.attacker.example',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    assert.equal(csrfBadOriginEquip.status, 403, 'Cross-origin POST with cookie must be blocked even with X-Requested-With');

    const csrfBadOriginLogout = await apiReq(baseUrl, '/api/auth/logout', {
      method: 'POST',
      cookie: p1Cookie!,
      extraHeaders: {
        Host: hostHeader,
        Origin: 'https://evil.attacker.example',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    assert.equal(csrfBadOriginLogout.status, 403);

    // Same-origin CSRF validation succeeds cleanly
    const sameOriginEquip = await apiReq(baseUrl, '/api/skins/equip', {
      method: 'POST',
      cookie: p1Cookie!,
      body: { skinId: 'capivara' },
      extraHeaders: {
        Host: hostHeader,
        Origin: `http://${hostHeader}`,
      },
    });
    assert.equal(sameOriginEquip.status, 200);

    // Account recovery does not enumerate users & invalidates prior sessions
    const recNotFound = await apiReq<{ error: string }>(baseUrl, '/api/auth/recover', {
      method: 'POST',
      body: {
        nickname: 'NaoExisteUser99',
        recoveryCode: 'wrong_code',
        newPassword: 'NewPass1234',
        confirmPassword: 'NewPass1234',
      },
    });
    const recWrongCode = await apiReq<{ error: string }>(baseUrl, '/api/auth/recover', {
      method: 'POST',
      body: {
        nickname: 'SecPlayer1',
        recoveryCode: 'wrong_code',
        newPassword: 'NewPass1234',
        confirmPassword: 'NewPass1234',
      },
    });
    assert.equal(recNotFound.status, 401);
    assert.equal(recWrongCode.status, 401);
    assert.equal(
      recNotFound.data.error,
      recWrongCode.data.error,
      'Recovery errors must not leak whether nickname exists or has a code'
    );

    // =========================================================================
    // SCENARIO 14: Malformed JSON, security headers, no stack traces / no x-powered-by
    // =========================================================================
    const malformedJson = await rawHttp(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: '{"nickname": "broken',
    });
    assert.equal(malformedJson.status, 400);
    assert.ok(malformedJson.json?.error);
    assert.ok(!malformedJson.text.includes('SyntaxError:'), 'Must not leak JS SyntaxError stack');
    assert.ok(!malformedJson.text.includes('node_modules'), 'Must not leak filesystem paths');

    // Verify HTTP security headers on responses
    assert.equal(malformedJson.headers.get('x-powered-by'), null);
    assert.equal(malformedJson.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(
      malformedJson.headers.get('referrer-policy'),
      'strict-origin-when-cross-origin'
    );
    assert.ok(
      malformedJson.headers.get('permissions-policy')?.includes('microphone=(self)'),
      'Permissions-Policy must preserve microphone=(self) for WebRTC voice calls'
    );
    assert.ok(
      malformedJson.headers.get('content-security-policy')?.includes("object-src 'none'"),
      'CSP header must be present with object-src none'
    );

    // =========================================================================
    // SCENARIO 7: Login brute force locked (429) & spoofed X-Forwarded-For does NOT bypass
    // =========================================================================
    for (let i = 0; i < 8; i++) {
      const failLogin = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { nickname: 'SecPlayer3', password: `WrongPass_${i}` },
      });
      assert.equal(failLogin.status, 401);
    }
    const loginLocked = await apiReq(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { nickname: 'SecPlayer3', password: 'WrongPass_9' },
    });
    assert.equal(loginLocked.status, 429, 'Login brute force must lock with 429');

    // Attempt IP-limiter bypass via spoofed X-Forwarded-For with a DIFFERENT nickname
    const spoofedBypassAttempt = await apiReq(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { nickname: 'SecPlayer2', password: 'WrongPass_Spoof' },
      extraHeaders: {
        'X-Forwarded-For': '203.0.113.250',
        'X-Real-IP': '203.0.113.250',
      },
    });
    assert.equal(
      spoofedBypassAttempt.status,
      429,
      'Spoofed X-Forwarded-For must NOT bypass IP login rate limiter'
    );

    // =========================================================================
    // SCENARIO 8: Secret admin password brute force locked (429)
    // =========================================================================
    for (let i = 0; i < 6; i++) {
      const failAdm = await apiReq(baseUrl, '/api/admin/secret-login', {
        method: 'POST',
        body: { password: `WrongAdm_${i}` },
      });
      assert.equal(failAdm.status, 401);
    }
    const admLocked = await apiReq(baseUrl, '/api/admin/secret-login', {
      method: 'POST',
      body: { password: 'WrongAdm_7' },
    });
    assert.equal(admLocked.status, 429, 'Secret admin brute force must lock with 429');

    // =========================================================================
    // SCENARIO 15 (Part B): Admin Security Audit Logs & Anomaly Escalation + Zero Secret Leaks
    // =========================================================================
    // Wait briefly so async void recordSecurityEvent microtasks flush to store
    await new Promise((r) => setTimeout(r, 80));

    const secLogsRes = await apiReq<{
      logs: { eventType: string; category: string; severity: string; details: string }[];
      summary: {
        totalEvents: number;
        criticalCount: number;
        highCount: number;
        blockedAttemptsCount: number;
      };
    }>(baseUrl, '/api/admin/security-logs', {
      token: samukaToken,
    });
    assert.equal(secLogsRes.status, 200);
    assert.ok(secLogsRes.data.summary.totalEvents >= 10, 'Security audit must have logged attack probes');
    assert.ok(secLogsRes.data.summary.blockedAttemptsCount >= 5);

    const eventTypes = new Set(secLogsRes.data.logs.map((l) => l.eventType));
    for (const expectedType of [
      'ADMIN_UNAUTHORIZED_ACCESS',
      'UNAUTHORIZED_SKIN_EQUIP',
      'MATCH_SIGNATURE_INVALID',
      'MATCH_USER_MISMATCH',
      'MATCH_DURATION_TAMPER',
      'MP_COIN_INJECTION',
      'SKATE_INVALID_MATCH_CONSUME',
      'CSRF_VALIDATION_FAILED',
      'FRIEND_CHAT_READ_DENIED',
      'CALL_NON_FRIEND_DENIED',
      'CALL_SIGNAL_HIJACK_DENIED',
      'PROMO_BRUTE_FORCE_BLOCKED',
      'LOGIN_IP_RATE_LIMITED',
      'ADMIN_SECRET_RATE_LIMITED',
      'REPEATED_ANOMALY_ALERT',
    ]) {
      assert.ok(
        eventTypes.has(expectedType),
        `Expected security audit event ${expectedType} to be recorded`
      );
    }

    // Confirm zero leaked credentials, tokens, or recovery codes in serialized audit logs
    const serializedAudit = JSON.stringify(secLogsRes.data);
    assert.ok(!serializedAudit.includes(RATAO_PASS));
    assert.ok(!serializedAudit.includes(SAMUKA_PASS));
    assert.ok(!serializedAudit.includes(PLAYER_PASS));
    assert.ok(!serializedAudit.includes(EPHEMERAL_SESSION_SECRET));
    assert.ok(!serializedAudit.includes(p1Token));
    assert.ok(!serializedAudit.includes('rec_p1_secret_99'));

    console.log('ALL_SECURITY_AUDIT_TESTS_PASSED (15/15 SCENARIOS VERIFIED)');
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }

    if (PREV_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = PREV_ENV.DATABASE_URL;

    if (PREV_ENV.RATAO_DISABLE_AUTOSTART === undefined) delete process.env.RATAO_DISABLE_AUTOSTART;
    else process.env.RATAO_DISABLE_AUTOSTART = PREV_ENV.RATAO_DISABLE_AUTOSTART;

    if (PREV_ENV.ADMIN_INITIAL_USERNAME === undefined) delete process.env.ADMIN_INITIAL_USERNAME;
    else process.env.ADMIN_INITIAL_USERNAME = PREV_ENV.ADMIN_INITIAL_USERNAME;

    if (PREV_ENV.ADMIN_INITIAL_PASSWORD === undefined) delete process.env.ADMIN_INITIAL_PASSWORD;
    else process.env.ADMIN_INITIAL_PASSWORD = PREV_ENV.ADMIN_INITIAL_PASSWORD;

    if (PREV_ENV.ADMIN_SAMUKA_USERNAME === undefined) delete process.env.ADMIN_SAMUKA_USERNAME;
    else process.env.ADMIN_SAMUKA_USERNAME = PREV_ENV.ADMIN_SAMUKA_USERNAME;

    if (PREV_ENV.ADMIN_SAMUKA_PASSWORD === undefined) delete process.env.ADMIN_SAMUKA_PASSWORD;
    else process.env.ADMIN_SAMUKA_PASSWORD = PREV_ENV.ADMIN_SAMUKA_PASSWORD;

    if (PREV_ENV.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = PREV_ENV.SESSION_SECRET;

    global._rataoAdminSeeded = false;
    global._rataoAdminSeededKey = undefined;
    global._rataoDbState = undefined;
    global._rataoSecurityAnomalyTracker = undefined;

    if (hadExistingDb && originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, { mode: 0o600 });
    } else if (!hadExistingDb && fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  }
}

runSecurityAuditTests().catch((err) => {
  console.error('SECURITY_AUDIT_TESTS_FAILED:', err);
  process.exit(1);
});
