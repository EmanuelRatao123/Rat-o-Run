import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { AddressInfo } from 'node:net';
import {
  adminBootstrapHandler,
  adminBootstrapStatusHandler,
  adminLogoutHandler,
  adminSessionStatusHandler,
  attachAuth,
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  registerHandler,
  requireAdmin,
  requireAuth,
  secretAdminLoginHandler,
} from './auth.ts';
import {
  adminClosePollHandler,
  adminCreateMessageHandler,
  adminCreatePollHandler,
  adminDeleteMessageHandler,
  adminGetPlayerSkinsSummaryHandler,
  adminGiftSkinHandler,
  adminGrantAllSkinsHandler,
  adminGrantExclusiveSkinHandler,
  adminListExclusiveSkinOwnersHandler,
  adminListSkinGrantHistoryHandler,
  adminRevokeBulkSkinsHandler,
  adminRevokeExclusiveSkinHandler,
  adminSearchPlayersHandler,
  adminStatsHandler,
} from './gameApi.ts';
import {
  adminCreatePromoCodeHandler,
  adminListPromoCodesHandler,
  adminListSuggestionsHandler,
  adminUnlockKingSkinHandler,
} from './featureApi.ts';
import { ensureDbAndAdminReady } from './repository.ts';
import { getDb as getLocalDb, saveDb as saveLocalDb } from './store.ts';
import { createF8DoubleTapDetector } from '../utils/devtoolsGuard.ts';

const DB_FILE = path.resolve(process.cwd(), 'data', 'ratao-db.json');
const hadExistingDb = fs.existsSync(DB_FILE);
const originalDbSnapshot = hadExistingDb ? fs.readFileSync(DB_FILE, 'utf8') : null;

const PREV_ENV = {
  ADMIN_INITIAL_USERNAME: process.env.ADMIN_INITIAL_USERNAME,
  ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD,
  ADMIN_SAMUKA_USERNAME: process.env.ADMIN_SAMUKA_USERNAME,
  ADMIN_SAMUKA_PASSWORD: process.env.ADMIN_SAMUKA_PASSWORD,
  ADMIN_DOLLYA_USERNAME: process.env.ADMIN_DOLLYA_USERNAME,
  ADMIN_DOLLYA_PASSWORD: process.env.ADMIN_DOLLYA_PASSWORD,
};

function buildTestServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(attachAuth);

  app.post('/api/auth/register', (req, res, next) => {
    Promise.resolve(registerHandler(req, res)).catch(next);
  });
  app.post('/api/auth/login', (req, res, next) => {
    Promise.resolve(loginHandler(req, res)).catch(next);
  });
  app.post('/api/auth/logout', (req, res, next) => {
    Promise.resolve(logoutHandler(req, res)).catch(next);
  });
  app.get('/api/auth/me', (req, res, next) => {
    Promise.resolve(meHandler(req, res)).catch(next);
  });

  app.get('/api/admin/bootstrap-status', (req, res, next) => {
    Promise.resolve(adminBootstrapStatusHandler(req, res)).catch(next);
  });
  app.post('/api/admin/bootstrap', (req, res, next) => {
    Promise.resolve(adminBootstrapHandler(req, res)).catch(next);
  });
  app.post('/api/admin/secret-login', (req, res, next) => {
    Promise.resolve(secretAdminLoginHandler(req, res)).catch(next);
  });
  app.get('/api/admin/session', (req, res, next) => {
    Promise.resolve(adminSessionStatusHandler(req, res)).catch(next);
  });
  app.post('/api/admin/change-password', (req, res, next) => {
    Promise.resolve(changePasswordHandler(req, res)).catch(next);
  });
  app.post('/api/admin/logout', (req, res, next) => {
    Promise.resolve(adminLogoutHandler(req, res)).catch(next);
  });

  app.get('/api/admin/stats', requireAdmin, (req, res, next) => {
    Promise.resolve(adminStatsHandler(req, res)).catch(next);
  });
  app.get('/api/admin/players', requireAdmin, (req, res, next) => {
    Promise.resolve(adminSearchPlayersHandler(req, res)).catch(next);
  });
  app.post('/api/admin/unlock-king-skin', requireAdmin, (req, res, next) => {
    Promise.resolve(adminUnlockKingSkinHandler(req, res)).catch(next);
  });
  app.get('/api/admin/exclusive-skins/owners', requireAdmin, (req, res, next) => {
    Promise.resolve(adminListExclusiveSkinOwnersHandler(req, res)).catch(next);
  });
  app.post('/api/admin/exclusive-skins/grant', requireAdmin, (req, res, next) => {
    Promise.resolve(adminGrantExclusiveSkinHandler(req, res)).catch(next);
  });
  app.post('/api/admin/exclusive-skins/revoke', requireAdmin, (req, res, next) => {
    Promise.resolve(adminRevokeExclusiveSkinHandler(req, res)).catch(next);
  });
  app.get('/api/admin/skins/player-summary', requireAdmin, (req, res, next) => {
    Promise.resolve(adminGetPlayerSkinsSummaryHandler(req, res)).catch(next);
  });
  app.post('/api/admin/skins/grant-all', requireAdmin, (req, res, next) => {
    Promise.resolve(adminGrantAllSkinsHandler(req, res)).catch(next);
  });
  app.post('/api/admin/skins/revoke-bulk', requireAdmin, (req, res, next) => {
    Promise.resolve(adminRevokeBulkSkinsHandler(req, res)).catch(next);
  });
  app.get('/api/admin/skins/grant-history', requireAdmin, (req, res, next) => {
    Promise.resolve(adminListSkinGrantHistoryHandler(req, res)).catch(next);
  });
  app.post('/api/admin/messages', requireAdmin, (req, res, next) => {
    Promise.resolve(adminCreateMessageHandler(req, res)).catch(next);
  });
  app.delete('/api/admin/messages/:id', requireAdmin, (req, res, next) => {
    Promise.resolve(adminDeleteMessageHandler(req, res)).catch(next);
  });
  app.post('/api/admin/polls', requireAdmin, (req, res, next) => {
    Promise.resolve(adminCreatePollHandler(req, res)).catch(next);
  });
  app.post('/api/admin/polls/:id/close', requireAdmin, (req, res, next) => {
    Promise.resolve(adminClosePollHandler(req, res)).catch(next);
  });
  app.post('/api/admin/gift-skin', requireAdmin, (req, res, next) => {
    Promise.resolve(adminGiftSkinHandler(req, res)).catch(next);
  });
  app.get('/api/admin/suggestions', requireAdmin, (req, res, next) => {
    Promise.resolve(adminListSuggestionsHandler(req, res)).catch(next);
  });
  app.get('/api/admin/promo-codes', requireAdmin, (req, res, next) => {
    Promise.resolve(adminListPromoCodesHandler(req, res)).catch(next);
  });
  app.post('/api/admin/promo-codes', requireAdmin, (req, res, next) => {
    Promise.resolve(adminCreatePromoCodeHandler(req, res)).catch(next);
  });

  app.post('/api/player/profile-probe', requireAuth, (req, res) => {
    res.json({ ok: true });
  });

  return app;
}

async function jsonReq<T = any>(
  baseUrl: string,
  route: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    adminToken?: string;
  } = {}
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.adminToken) headers['x-admin-token'] = options.adminToken;

  const resp = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await resp.json().catch(() => ({}))) as T;
  return { status: resp.status, data };
}

async function runSamukaAdminTests() {
  let server: ReturnType<express.Express['listen']> | null = null;
  try {
    // Isolate test DB state cleanly
    const db = getLocalDb();
    db.users = {};
    db.sessions = {};
    db.adminLogs = [];
    db.messages = [];
    db.polls = [];
    db.votes = [];
    db.gifts = [];
    db.exclusiveSkinPermissions = [];
    db.skinGrantHistory = [];
    db.promoCodes = [];
    db.promoCodeRedemptions = [];
    saveLocalDb();

    // Runtime-only generated passwords (never hardcoded secrets)
    const rataoInitialPass = `Ratao_${crypto.randomBytes(6).toString('hex')}`;
    const rataoUpdatedPass = `RataoNew_${crypto.randomBytes(6).toString('hex')}`;
    const samukaInitialPass = `Samuka_${crypto.randomBytes(6).toString('hex')}`;
    const samukaUpdatedPass = `SamukaNew_${crypto.randomBytes(6).toString('hex')}`;
    const playerPass = `Player_${crypto.randomBytes(6).toString('hex')}`;

    process.env.ADMIN_INITIAL_USERNAME = 'Ratão';
    process.env.ADMIN_INITIAL_PASSWORD = rataoInitialPass;
    process.env.ADMIN_SAMUKA_USERNAME = 'Samuka';
    process.env.ADMIN_SAMUKA_PASSWORD = samukaInitialPass;
    delete process.env.ADMIN_DOLLYA_USERNAME;
    delete process.env.ADMIN_DOLLYA_PASSWORD;

    global._rataoAdminSeeded = false;
    global._rataoAdminSeededKey = undefined;
    await ensureDbAndAdminReady();
    // Calling a second time must be idempotent and NOT duplicate Samuka or Ratão
    global._rataoAdminSeeded = false;
    await ensureDbAndAdminReady();

    const adminsAfterSeed = Object.values(getLocalDb().users).filter((u) => u.role === 'admin');
    assert.equal(adminsAfterSeed.length, 2, 'Exactly 2 admins (Ratão and Samuka) should exist');
    const samukaRecord = adminsAfterSeed.find((u) => u.nicknameLower === 'samuka');
    assert.ok(samukaRecord, 'Samuka admin account must be provisioned');
    assert.ok(
      samukaRecord.passwordHash && !samukaRecord.passwordHash.includes(samukaInitialPass),
      'Password must be stored strictly as a hash'
    );

    const app = buildTestServer();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server!.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // TEST 1 & 2: Ratão login + F8 double-tap detector + secret-login + password change + F8 dashboard
    const f8 = createF8DoubleTapDetector(1000);
    assert.equal(f8.registerPress(1000), false);
    assert.equal(f8.registerPress(2500), false, 'Slow F8 presses >1000ms must not open panel');
    assert.equal(f8.registerPress(3000), true, 'Double F8 within 1000ms must trigger panel');

    const rataoLogin = await jsonReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        body: { nickname: 'Ratão', password: rataoInitialPass },
      }
    );
    assert.equal(rataoLogin.status, 200);
    assert.equal(rataoLogin.data.user.role, 'admin');
    assert.equal(
      rataoLogin.data.user.showAdminPanelButton,
      false,
      'Ratão must NOT see the PAINEL ADMIN button (keeps double-F8 flow)'
    );

    const rataoF8 = await jsonReq<{
      admin: any;
      adminSessionToken: string;
      requiresPasswordChange: boolean;
    }>(baseUrl, '/api/admin/secret-login', {
      method: 'POST',
      body: { password: rataoInitialPass },
    });
    assert.equal(rataoF8.status, 200, 'Ratão F8 secret-login must succeed even with 2 admins in DB');
    assert.equal(rataoF8.data.admin.nickname, 'Ratão');
    assert.equal(rataoF8.data.requiresPasswordChange, true);

    const rataoChangePass = await jsonReq<{ user: any }>(baseUrl, '/api/admin/change-password', {
      method: 'POST',
      adminToken: rataoF8.data.adminSessionToken,
      body: {
        currentPassword: rataoInitialPass,
        newPassword: rataoUpdatedPass,
        confirmPassword: rataoUpdatedPass,
      },
    });
    assert.equal(rataoChangePass.status, 200);
    assert.equal(rataoChangePass.data.user.mustChangePassword, false);

    const rataoStats = await jsonReq<{ stats: any }>(baseUrl, '/api/admin/stats', {
      adminToken: rataoF8.data.adminSessionToken,
    });
    assert.equal(rataoStats.status, 200);

    // TEST 7 & 8: Common player registration, reserved nickname block, button absence & 403 enforcement
    const regSamukaAttempt = await jsonReq(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        nickname: 'Samuka',
        password: playerPass,
        confirmPassword: playerPass,
      },
    });
    assert.equal(regSamukaAttempt.status, 409, 'Common player cannot register reserved nickname Samuka');

    const regPlayer = await jsonReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/register',
      {
        method: 'POST',
        body: {
          nickname: 'JogadorTeste',
          password: playerPass,
          confirmPassword: playerPass,
        },
      }
    );
    assert.equal(regPlayer.status, 201);
    assert.equal(regPlayer.data.user.role, 'player');
    assert.equal(
      regPlayer.data.user.showAdminPanelButton,
      false,
      'Common player must NEVER receive showAdminPanelButton=true'
    );

    const playerToken = regPlayer.data.sessionToken;
    for (const blocked of [
      { method: 'GET', route: '/api/admin/session' },
      { method: 'GET', route: '/api/admin/stats' },
      { method: 'POST', route: '/api/admin/messages', body: { title: 'x', content: 'y', durationMinutes: 5 } },
      { method: 'POST', route: '/api/admin/skins/grant-all', body: { nickname: 'JogadorTeste' } },
      { method: 'POST', route: '/api/admin/gift-skin', body: { nickname: 'JogadorTeste', skinId: 'homem_aranha' } },
      { method: 'POST', route: '/api/admin/unlock-king-skin' },
      { method: 'POST', route: '/api/admin/promo-codes', body: { code: 'HACK99', rewardType: 'coins', rewardAmount: 500 } },
    ]) {
      const resp = await jsonReq(baseUrl, blocked.route, {
        method: blocked.method,
        token: playerToken,
        body: blocked.body,
      });
      assert.ok(
        resp.status === 401 || resp.status === 403,
        `Common player must be blocked from ${blocked.route}, got ${resp.status}`
      );
    }

    // TEST 3, 4 & 5: Samuka login, PAINEL ADMIN visibility flag, and opening panel via button session
    const samukaLogin = await jsonReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        body: { nickname: 'Samuka', password: samukaInitialPass },
      }
    );
    assert.equal(samukaLogin.status, 200);
    assert.equal(samukaLogin.data.user.nickname, 'Samuka');
    assert.equal(samukaLogin.data.user.role, 'admin');
    assert.equal(samukaLogin.data.user.mustChangePassword, false);
    assert.equal(
      samukaLogin.data.user.showAdminPanelButton,
      true,
      'Verified Samuka admin must receive showAdminPanelButton=true'
    );

    const samukaToken = samukaLogin.data.sessionToken;

    // Opening AdminPortalModal via PAINEL ADMIN button validates /api/admin/session without F8
    const samukaSessionStatus = await jsonReq<{ admin: any; requiresPasswordChange: boolean }>(
      baseUrl,
      '/api/admin/session',
      { token: samukaToken }
    );
    assert.equal(samukaSessionStatus.status, 200);
    assert.equal(samukaSessionStatus.data.admin.nickname, 'Samuka');
    assert.equal(samukaSessionStatus.data.requiresPasswordChange, false);

    // TEST 6: All admin tools work for Samuka & audit logs clearly identify Samuka vs Ratão
    const msgRes = await jsonReq<{ message: { id: string } }>(baseUrl, '/api/admin/messages', {
      method: 'POST',
      token: samukaToken,
      body: { title: 'Aviso Samuka', content: 'Teste painel admin', durationMinutes: 30 },
    });
    assert.equal(msgRes.status, 201);

    const pollRes = await jsonReq<{ poll: { id: string } }>(baseUrl, '/api/admin/polls', {
      method: 'POST',
      token: samukaToken,
      body: { title: 'Enquete Samuka', options: ['Sim', 'Não'], durationMinutes: 30 },
    });
    assert.equal(pollRes.status, 201);
    const closePollRes = await jsonReq(baseUrl, `/api/admin/polls/${pollRes.data.poll.id}/close`, {
      method: 'POST',
      token: samukaToken,
    });
    assert.equal(closePollRes.status, 200);

    const giftRes = await jsonReq<{ gift: { grantedBy: string } }>(baseUrl, '/api/admin/gift-skin', {
      method: 'POST',
      token: samukaToken,
      body: { nickname: 'JogadorTeste', skinId: 'hacker' },
    });
    assert.equal(giftRes.status, 201);
    assert.equal(giftRes.data.gift.grantedBy, 'Samuka');

    const grantExclRes = await jsonReq(baseUrl, '/api/admin/exclusive-skins/grant', {
      method: 'POST',
      token: samukaToken,
      body: { nickname: 'JogadorTeste', skinId: 'homem_aranha' },
    });
    assert.equal(grantExclRes.status, 201);

    const grantAllRes = await jsonReq<{ summary: any; historyEntry: { adminNickname: string } }>(
      baseUrl,
      '/api/admin/skins/grant-all',
      {
        method: 'POST',
        token: samukaToken,
        body: { nickname: 'JogadorTeste' },
      }
    );
    assert.equal(grantAllRes.status, 200);
    assert.equal(grantAllRes.data.historyEntry.adminNickname, 'Samuka');
    assert.equal(
      grantAllRes.data.summary.protectedExclusiveOwned.length,
      0,
      'Grant all must not grant Ratão Rei or Top 1/2/3'
    );

    const revokeBulkRes = await jsonReq(baseUrl, '/api/admin/skins/revoke-bulk', {
      method: 'POST',
      token: samukaToken,
      body: { nickname: 'JogadorTeste' },
    });
    assert.equal(revokeBulkRes.status, 200);

    const revokeExclRes = await jsonReq(baseUrl, '/api/admin/exclusive-skins/revoke', {
      method: 'POST',
      token: samukaToken,
      body: { userId: regPlayer.data.user.id, skinId: 'homem_aranha' },
    });
    assert.equal(revokeExclRes.status, 200);

    const promoRes = await jsonReq(baseUrl, '/api/admin/promo-codes', {
      method: 'POST',
      token: samukaToken,
      body: {
        code: 'SAMUKA10',
        description: 'Promo teste',
        rewardType: 'coins',
        rewardAmount: 50,
        isInfinite: false,
        maxUses: 5,
      },
    });
    assert.equal(promoRes.status, 201);

    const kingUnlockRes = await jsonReq<{ allowedExclusiveSkins: string[] }>(
      baseUrl,
      '/api/admin/unlock-king-skin',
      { method: 'POST', token: samukaToken }
    );
    assert.equal(kingUnlockRes.status, 200);
    assert.ok(kingUnlockRes.data.allowedExclusiveSkins.includes('ratao_rei'));

    const delMsgRes = await jsonReq(baseUrl, `/api/admin/messages/${msgRes.data.message.id}`, {
      method: 'DELETE',
      token: samukaToken,
    });
    assert.equal(delMsgRes.status, 200);

    const playersRes = await jsonReq<{ players: any[] }>(
      baseUrl,
      '/api/admin/players?q=JogadorTeste',
      { token: samukaToken }
    );
    assert.equal(playersRes.status, 200);
    assert.equal(playersRes.data.players.length, 1);

    const grantHistoryRes = await jsonReq<{ history: { adminNickname: string }[] }>(
      baseUrl,
      '/api/admin/skins/grant-history',
      { token: samukaToken }
    );
    assert.equal(grantHistoryRes.status, 200);
    assert.ok(grantHistoryRes.data.history.some((h) => h.adminNickname === 'Samuka'));

    const samukaDashboard = await jsonReq<{ logs: { adminNickname: string; action: string }[] }>(
      baseUrl,
      '/api/admin/stats',
      { token: samukaToken }
    );
    assert.equal(samukaDashboard.status, 200);
    assert.ok(samukaDashboard.data.logs.some((l) => l.adminNickname === 'Samuka'));
    assert.ok(samukaDashboard.data.logs.some((l) => l.adminNickname === 'Ratão'));

    // TEST 9: Password change, logout, and persistence across re-login & re-seeding
    const samukaChangePass = await jsonReq<{ user: any }>(baseUrl, '/api/admin/change-password', {
      method: 'POST',
      token: samukaToken,
      body: {
        currentPassword: samukaInitialPass,
        newPassword: samukaUpdatedPass,
        confirmPassword: samukaUpdatedPass,
      },
    });
    assert.equal(samukaChangePass.status, 200);
    assert.equal(samukaChangePass.data.user.showAdminPanelButton, true);

    const samukaLogout = await jsonReq(baseUrl, '/api/auth/logout', {
      method: 'POST',
      token: samukaToken,
    });
    assert.equal(samukaLogout.status, 200);

    // Old session token must be invalid after logout
    const afterLogoutMe = await jsonReq(baseUrl, '/api/auth/me', { token: samukaToken });
    assert.equal(afterLogoutMe.status, 401);

    // Cold-start seeding check must NEVER overwrite Samuka's updated password
    global._rataoAdminSeeded = false;
    global._rataoAdminSeededKey = undefined;
    await ensureDbAndAdminReady();

    // Old initial password must now fail
    const oldPassLogin = await jsonReq(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { nickname: 'Samuka', password: samukaInitialPass },
    });
    assert.equal(oldPassLogin.status, 401);

    // New password succeeds and preserves admin role + PAINEL ADMIN flag
    const newPassLogin = await jsonReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        body: { nickname: 'Samuka', password: samukaUpdatedPass },
      }
    );
    assert.equal(newPassLogin.status, 200);
    assert.equal(newPassLogin.data.user.role, 'admin');
    assert.equal(newPassLogin.data.user.showAdminPanelButton, true);

    const persistedAdminStats = await jsonReq(baseUrl, '/api/admin/stats', {
      token: newPassLogin.data.sessionToken,
    });
    assert.equal(persistedAdminStats.status, 200);

    console.log('ALL SAMUKA ADMIN TESTS PASSED (9/9 scenarios verified).');
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    process.env.ADMIN_INITIAL_USERNAME = PREV_ENV.ADMIN_INITIAL_USERNAME;
    process.env.ADMIN_INITIAL_PASSWORD = PREV_ENV.ADMIN_INITIAL_PASSWORD;
    process.env.ADMIN_SAMUKA_USERNAME = PREV_ENV.ADMIN_SAMUKA_USERNAME;
    process.env.ADMIN_SAMUKA_PASSWORD = PREV_ENV.ADMIN_SAMUKA_PASSWORD;
    process.env.ADMIN_DOLLYA_USERNAME = PREV_ENV.ADMIN_DOLLYA_USERNAME;
    process.env.ADMIN_DOLLYA_PASSWORD = PREV_ENV.ADMIN_DOLLYA_PASSWORD;
    global._rataoAdminSeeded = false;
    global._rataoAdminSeededKey = undefined;
    global._rataoDbState = undefined;

    if (originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, 'utf8');
    } else if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  }
}

runSamukaAdminTests().catch((err) => {
  console.error('Samuka admin tests failed:', err);
  process.exit(1);
});
