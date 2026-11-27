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
  ADMIN_DOLLYA_USERNAME: process.env.ADMIN_DOLLYA_USERNAME,
  ADMIN_DOLLYA_PASSWORD: process.env.ADMIN_DOLLYA_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

const RATAO_PASS = `RataoAdm_${crypto.randomBytes(6).toString('hex')}`;
const SAMUKA_PASS = `SamukaAdm_${crypto.randomBytes(6).toString('hex')}`;
const DOLLYA_INITIAL_PASS = `DollyaAdm_${crypto.randomBytes(6).toString('hex')}`;
const DOLLYA_UPDATED_PASS = `DollyaNew_${crypto.randomBytes(6).toString('hex')}`;
const PLAYER_PASS = `PlayerAdm_${crypto.randomBytes(6).toString('hex')}`;

delete process.env.DATABASE_URL;
process.env.RATAO_DISABLE_AUTOSTART = '1';
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ADMIN_INITIAL_USERNAME = 'Ratão';
process.env.ADMIN_INITIAL_PASSWORD = RATAO_PASS;
process.env.ADMIN_SAMUKA_USERNAME = 'Samuka';
process.env.ADMIN_SAMUKA_PASSWORD = SAMUKA_PASS;
process.env.ADMIN_DOLLYA_USERNAME = 'Dollya';
process.env.ADMIN_DOLLYA_PASSWORD = DOLLYA_INITIAL_PASS;

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

async function runDollyaAdminTests() {
  const { default: app } = (await import('../../server.ts')) as { default: express.Express };
  const { ensureDbAndAdminReady } = await import('./repository.ts');
  const { getDb, saveDb } = await import('./store.ts');

  let server: ReturnType<express.Express['listen']> | null = null;
  try {
    const db = getDb();
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
    saveDb();

    global._rataoAdminSeeded = false;
    global._rataoAdminSeededKey = undefined;
    await ensureDbAndAdminReady();
    // Second run must remain idempotent with zero duplicate accounts
    global._rataoAdminSeeded = false;
    await ensureDbAndAdminReady();

    const adminsAfterSeed = Object.values(getDb().users).filter((u) => u.role === 'admin');
    assert.equal(adminsAfterSeed.length, 3, 'Exactly 3 admins (Ratão, Samuka, Dollya) should exist');

    const dollyaRecord = adminsAfterSeed.find((u) => u.nicknameLower === 'dollya');
    assert.ok(dollyaRecord, 'Dollya admin account must be provisioned');
    assert.equal(dollyaRecord.nickname, 'Dollya');
    assert.equal(dollyaRecord.mustChangePassword, false);
    assert.ok(
      dollyaRecord.passwordHash && !dollyaRecord.passwordHash.includes(DOLLYA_INITIAL_PASS),
      'Dollya password must be stored strictly as a hash'
    );

    server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Reserved nickname check: common player cannot register Dollya
    const regReservedAttempt = await jsonReq(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        nickname: 'Dollya',
        password: PLAYER_PASS,
        confirmPassword: PLAYER_PASS,
      },
    });
    assert.equal(regReservedAttempt.status, 409, 'Common player cannot register reserved nickname Dollya');

    // Register normal test player
    const playerNick = `TestPly${crypto.randomBytes(3).toString('hex')}`;
    const regPlayer = await jsonReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/register',
      {
        method: 'POST',
        body: {
          nickname: playerNick,
          password: PLAYER_PASS,
          confirmPassword: PLAYER_PASS,
        },
      }
    );
    assert.equal(regPlayer.status, 201);
    assert.equal(regPlayer.data.user.showAdminPanelButton, false);

    // 2. Ratão keeps F8-only flow while Dollya & Samuka receive showAdminPanelButton=true
    const rataoLogin = await jsonReq<{ user: any }>(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { nickname: 'Ratão', password: RATAO_PASS },
    });
    assert.equal(rataoLogin.status, 200);
    assert.equal(rataoLogin.data.user.showAdminPanelButton, false);

    // 3. Dollya normal login + admin session + Baby Yoda native access
    const dollyaLogin = await jsonReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        body: { nickname: 'Dollya', password: DOLLYA_INITIAL_PASS },
      }
    );
    assert.equal(dollyaLogin.status, 200);
    assert.equal(dollyaLogin.data.user.nickname, 'Dollya');
    assert.equal(dollyaLogin.data.user.role, 'admin');
    assert.equal(dollyaLogin.data.user.mustChangePassword, false);
    assert.equal(
      dollyaLogin.data.user.showAdminPanelButton,
      true,
      'Dollya admin must receive showAdminPanelButton=true'
    );
    assert.ok(
      dollyaLogin.data.user.allowedExclusiveSkins.includes('baby_yoda'),
      'Dollya must have native Baby Yoda access'
    );

    const dollyaToken = dollyaLogin.data.sessionToken;

    const dollyaSessionStatus = await jsonReq<{ admin: any; requiresPasswordChange: boolean }>(
      baseUrl,
      '/api/admin/session',
      { token: dollyaToken }
    );
    assert.equal(dollyaSessionStatus.status, 200);
    assert.equal(dollyaSessionStatus.data.admin.nickname, 'Dollya');
    assert.equal(dollyaSessionStatus.data.requiresPasswordChange, false);

    // 4. Secret F8 login also recognizes Dollya's password
    const dollyaF8 = await jsonReq<{ admin: any; adminSessionToken: string }>(
      baseUrl,
      '/api/admin/secret-login',
      {
        method: 'POST',
        body: { password: DOLLYA_INITIAL_PASS },
      }
    );
    assert.equal(dollyaF8.status, 200);
    assert.equal(dollyaF8.data.admin.nickname, 'Dollya');
    assert.ok(dollyaF8.data.adminSessionToken);

    // 5. Dollya can execute full admin actions & audit logs identify Dollya
    const msgRes = await jsonReq<{ message: { id: string } }>(baseUrl, '/api/admin/messages', {
      method: 'POST',
      token: dollyaToken,
      body: { title: 'Aviso Dollya', content: 'Teste painel admin Dollya', durationMinutes: 30 },
    });
    assert.equal(msgRes.status, 201);

    const grantBabyYoda = await jsonReq<{ owner: { grantedBy: string } }>(
      baseUrl,
      '/api/admin/skins/secret/grant',
      {
        method: 'POST',
        token: dollyaToken,
        body: { nickname: playerNick, skinId: 'baby_yoda' },
      }
    );
    assert.equal(grantBabyYoda.status, 201);
    assert.equal(grantBabyYoda.data.owner.grantedBy, 'Dollya');

    // Protected admin access cannot be revoked
    const revokeSelfAttempt = await jsonReq(baseUrl, '/api/admin/skins/secret/revoke', {
      method: 'POST',
      token: dollyaToken,
      body: { userId: dollyaLogin.data.user.id, skinId: 'baby_yoda' },
    });
    assert.equal(revokeSelfAttempt.status, 409);

    const equipBabyYoda = await jsonReq<{ equippedSkin: string }>(baseUrl, '/api/skins/equip', {
      method: 'POST',
      token: dollyaToken,
      body: { skinId: 'baby_yoda' },
    });
    assert.equal(equipBabyYoda.status, 200);
    assert.equal(equipBabyYoda.data.equippedSkin, 'baby_yoda');

    const kingRes = await jsonReq<{ allowedExclusiveSkins: string[] }>(
      baseUrl,
      '/api/admin/unlock-king-skin',
      { method: 'POST', token: dollyaToken }
    );
    assert.equal(kingRes.status, 200);
    assert.ok(kingRes.data.allowedExclusiveSkins.includes('ratao_rei'));

    const statsRes = await jsonReq<{ logs: { adminNickname: string }[] }>(
      baseUrl,
      '/api/admin/stats',
      { token: dollyaToken }
    );
    assert.equal(statsRes.status, 200);
    assert.ok(statsRes.data.logs.some((l) => l.adminNickname === 'Dollya'));

    // 6. Password change + logout + cold-start persistence check
    const changePass = await jsonReq<{ user: any }>(baseUrl, '/api/admin/change-password', {
      method: 'POST',
      token: dollyaToken,
      body: {
        currentPassword: DOLLYA_INITIAL_PASS,
        newPassword: DOLLYA_UPDATED_PASS,
        confirmPassword: DOLLYA_UPDATED_PASS,
      },
    });
    assert.equal(changePass.status, 200);

    const logoutRes = await jsonReq(baseUrl, '/api/auth/logout', {
      method: 'POST',
      token: dollyaToken,
    });
    assert.equal(logoutRes.status, 200);

    const meAfterLogout = await jsonReq(baseUrl, '/api/auth/me', { token: dollyaToken });
    assert.equal(meAfterLogout.status, 401);

    // Cold-start seeding must NOT overwrite Dollya's updated password
    global._rataoAdminSeeded = false;
    global._rataoAdminSeededKey = undefined;
    await ensureDbAndAdminReady();

    const oldPassFail = await jsonReq(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { nickname: 'Dollya', password: DOLLYA_INITIAL_PASS },
    });
    assert.equal(oldPassFail.status, 401);

    const newPassOk = await jsonReq<{ user: any; sessionToken: string }>(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        body: { nickname: 'Dollya', password: DOLLYA_UPDATED_PASS },
      }
    );
    assert.equal(newPassOk.status, 200);
    assert.equal(newPassOk.data.user.role, 'admin');
    assert.equal(newPassOk.data.user.showAdminPanelButton, true);

    // 7. Secondary admin status & duplicate/unauthorized checks
    const secStatusAdmin = await jsonReq<{ accounts: { nickname: string; active: boolean }[] }>(
      baseUrl,
      '/api/admin/secondary-admins',
      { token: newPassOk.data.sessionToken }
    );
    assert.equal(secStatusAdmin.status, 200);
    assert.ok(secStatusAdmin.data.accounts.some((a) => a.nickname === 'Dollya' && a.active));

    const dupProvision = await jsonReq(baseUrl, '/api/admin/secondary-admins/provision', {
      method: 'POST',
      token: newPassOk.data.sessionToken,
      body: {
        nickname: 'Dollya',
        password: DOLLYA_UPDATED_PASS,
        confirmPassword: DOLLYA_UPDATED_PASS,
      },
    });
    assert.equal(dupProvision.status, 409);

    const playerProvisionBlocked = await jsonReq(baseUrl, '/api/admin/secondary-admins/provision', {
      method: 'POST',
      token: regPlayer.data.sessionToken,
      body: {
        nickname: 'Dollya',
        password: DOLLYA_UPDATED_PASS,
        confirmPassword: DOLLYA_UPDATED_PASS,
      },
    });
    assert.equal(playerProvisionBlocked.status, 403);

    console.log('ALL DOLLYAA ADMIN TESTS PASSED (9/9 scenarios verified).');
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    Object.entries(PREV_ENV).forEach(([k, v]) => {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
      else (process.env as Record<string, string | undefined>)[k] = v;
    });
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

runDollyaAdminTests().catch((err) => {
  console.error('Dollya admin tests failed:', err);
  process.exit(1);
});
