import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NextFunction, Request, Response } from 'express';
import { ALL_SKIN_IDS, UserProfile } from '../shared/constants.ts';
import {
  SlidingRateLimiter,
  generateToken,
  hashPassword,
  verifyPassword,
} from './crypto.ts';
import {
  ensureDbAndAdminReady,
  repoComputePlayerRank,
  repoCreateSession,
  repoCreateUser,
  repoDeleteSession,
  repoFindAdminAccount,
  repoFindUserByGoogleUid,
  repoFindUserByNickname,
  repoGetValidSessionUser,
  repoHasAdminAccount,
  repoRecordAdminLog,
  repoUpdateUserLastSeen,
  repoUpdateUserPassword,
} from './repository.ts';
import { StoredUser } from './store.ts';

export const SESSION_COOKIE_NAME = 'ratao_session';
export const ADMIN_SESSION_COOKIE_NAME = 'ratao_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;

const loginLimiter = new SlidingRateLimiter(8, 5 * 60 * 1000, 3 * 60 * 1000);
const adminSecretLimiter = new SlidingRateLimiter(6, 5 * 60 * 1000, 3 * 60 * 1000);
const registerLimiter = new SlidingRateLimiter(8, 10 * 60 * 1000, 5 * 60 * 1000);
const recoverLimiter = new SlidingRateLimiter(5, 10 * 60 * 1000, 5 * 60 * 1000);

export interface AuthedRequest extends Request {
  authUser?: StoredUser;
  authToken?: string;
  adminUser?: StoredUser;
  adminToken?: string;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

function setAdminSessionCookie(res: Response, token: string): void {
  res.cookie(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: ADMIN_SESSION_TTL_MS,
    path: '/',
  });
}

function clearAdminSessionCookie(res: Response): void {
  res.clearCookie(ADMIN_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

export function sanitizeUserProfile(user: StoredUser, rank: number | null = null): UserProfile {
  return {
    id: user.id,
    nickname: user.nickname,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    equippedSkin: user.equippedSkin,
    unlockedSkins: user.unlockedSkins,
    giftedSkins: user.giftedSkins,
    bestNoCoinTimeMs: user.bestNoCoinTimeMs,
    bestDistance: user.bestDistance,
    bestScore: user.bestScore,
    totalMatches: user.totalMatches,
    totalCoins: user.totalCoins,
    favoriteSkin: user.favoriteSkin,
    skinUsage: user.skinUsage,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    rank,
  };
}

async function createSessionForUser(
  userId: string,
  scope: 'player' | 'admin' = 'player'
): Promise<string> {
  const token = generateToken(32);
  const ttl = scope === 'admin' ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
  await repoCreateSession(token, userId, Date.now() + ttl, scope);
  return token;
}

function validateCsrfForCookie(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (req.headers.authorization?.startsWith('Bearer ')) return true;
  if (req.headers['x-admin-token']) return true;
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function attachAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDbAndAdminReady();

    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies?.[SESSION_COOKIE_NAME]) {
      token = String(req.cookies[SESSION_COOKIE_NAME]);
    }

    if (token) {
      const user = await repoGetValidSessionUser(token);
      if (user) {
        req.authUser = user;
        req.authToken = token;
      }
    }

    // Separate dedicated admin session (supports F8 overlay without replacing active player)
    const adminHeader = req.headers['x-admin-token'];
    let adminTok: string | undefined;
    if (typeof adminHeader === 'string' && adminHeader.trim()) {
      adminTok = adminHeader.trim();
    } else if (req.cookies?.[ADMIN_SESSION_COOKIE_NAME]) {
      adminTok = String(req.cookies[ADMIN_SESSION_COOKIE_NAME]);
    }

    if (adminTok) {
      const adm = await repoGetValidSessionUser(adminTok, 'admin');
      if (adm) {
        req.adminUser = adm;
        req.adminToken = adminTok;
      }
    } else if (req.authUser && req.authUser.role === 'admin') {
      req.adminUser = req.authUser;
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: 'Erro ao conectar ao serviço de dados.' });
      return;
    }
    next();
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!validateCsrfForCookie(req)) {
    res.status(403).json({ error: 'Falha na validação de origem da requisição.' });
    return;
  }
  if (!req.authUser) {
    res.status(401).json({ error: 'Sessão expirada ou não autenticado. Faça login novamente.' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!validateCsrfForCookie(req)) {
    res.status(403).json({ error: 'Falha na validação de origem da requisição.' });
    return;
  }
  const adm = req.adminUser;
  if (!adm || adm.role !== 'admin') {
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }
  if (adm.mustChangePassword) {
    res.status(403).json({ error: 'Altere sua senha inicial antes de acessar o painel.' });
    return;
  }
  next();
}

function validateNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return null;
  if (!/^[a-zA-Z0-9_\- ]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const ip = getClientIp(req);
  const rate = registerLimiter.check(`reg:${ip}`);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Muitas tentativas de cadastro. Aguarde ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const { nickname: rawNick, password, confirmPassword, recoveryCode } = req.body ?? {};
  const nickname = validateNickname(rawNick);
  if (!nickname) {
    res.status(400).json({
      error: 'Nickname inválido. Use de 3 a 20 caracteres (letras, números, _ ou -).',
    });
    return;
  }

  if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
    res.status(400).json({ error: 'A senha deve ter entre 6 e 100 caracteres.' });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: 'As senhas não coincidem.' });
    return;
  }

  const envAdminName = process.env.ADMIN_INITIAL_USERNAME?.trim().toLowerCase();
  if (envAdminName && nickname.toLowerCase() === envAdminName) {
    res.status(409).json({ error: 'Este nickname já está em uso.' });
    return;
  }

  if (await repoFindUserByNickname(nickname)) {
    res.status(409).json({ error: 'Este nickname já está cadastrado. Escolha outro.' });
    return;
  }

  const recoveryClean =
    typeof recoveryCode === 'string' && recoveryCode.trim().length >= 4
      ? recoveryCode.trim().slice(0, 64)
      : null;

  const passwordHash = await hashPassword(password);
  const recoveryHash = recoveryClean ? await hashPassword(recoveryClean) : null;
  const id = `usr_${generateToken(8)}`;
  const now = new Date().toISOString();

  const newUser: StoredUser = {
    id,
    nickname,
    nicknameLower: nickname.toLowerCase(),
    passwordHash,
    recoveryHash,
    role: 'player',
    mustChangePassword: false,
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

  try {
    await repoCreateUser(newUser);
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (code === '23505') {
      res.status(409).json({ error: 'Este nickname já está cadastrado. Escolha outro.' });
      return;
    }
    throw err;
  }
  const sessionToken = await createSessionForUser(id, 'player');
  setSessionCookie(res, sessionToken);

  res.status(201).json({
    user: sanitizeUserProfile(newUser, null),
    sessionToken,
  });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  await ensureDbAndAdminReady();

  const ip = getClientIp(req);
  const { nickname: rawNick, password } = req.body ?? {};
  const nickKey = typeof rawNick === 'string' ? rawNick.trim().toLowerCase() : '';

  const ipRate = loginLimiter.check(`ip:${ip}`);
  if (!ipRate.allowed) {
    res.status(429).json({
      error: `Muitas tentativas de login. Aguarde ${ipRate.retryAfterSec}s.`,
    });
    return;
  }

  if (nickKey) {
    const userRate = loginLimiter.check(`user:${nickKey}`);
    if (!userRate.allowed) {
      res.status(429).json({
        error: `Conta temporariamente bloqueada por excesso de tentativas. Aguarde ${userRate.retryAfterSec}s.`,
      });
      return;
    }
  }

  if (typeof rawNick !== 'string' || typeof password !== 'string' || !rawNick.trim() || !password) {
    res.status(400).json({ error: 'Preencha usuário e senha.' });
    return;
  }

  const user = await repoFindUserByNickname(rawNick);
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    return;
  }

  loginLimiter.reset(`ip:${ip}`);
  loginLimiter.reset(`user:${nickKey}`);

  const nowIso = new Date().toISOString();
  user.lastSeenAt = nowIso;
  await repoUpdateUserLastSeen(user.id, nowIso);
  const sessionToken = await createSessionForUser(user.id, user.role === 'admin' ? 'admin' : 'player');
  setSessionCookie(res, sessionToken);

  const rank = await repoComputePlayerRank(user.id);
  res.json({
    user: sanitizeUserProfile(user, rank),
    sessionToken,
  });
}

export async function secretAdminLoginHandler(req: Request, res: Response): Promise<void> {
  await ensureDbAndAdminReady();

  if (!validateCsrfForCookie(req)) {
    res.status(403).json({ error: 'Falha na validação de origem da requisição.' });
    return;
  }

  const ip = getClientIp(req);
  const rate = adminSecretLimiter.check(`adm:${ip}`);
  if (!rate.allowed) {
    await repoRecordAdminLog(
      'SEGURANÇA',
      'ADMIN_BLOQUEIO',
      `Excesso de tentativas administrativas bloqueadas (IP ${ip})`
    );
    res.status(429).json({
      error: `Muitas tentativas. Aguarde ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const { password } = req.body ?? {};
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'Informe a senha administrativa.' });
    return;
  }

  const admin = await repoFindAdminAccount();
  if (!admin || !admin.passwordHash) {
    res.status(404).json({ error: 'Conta administrativa inicial ainda não configurada.' });
    return;
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    await repoRecordAdminLog(
      'SEGURANÇA',
      'ADMIN_ACESSO_NEGADO',
      `Tentativa com senha incorreta via acesso secreto (IP ${ip})`
    );
    res.status(401).json({ error: 'Senha incorreta.' });
    return;
  }

  adminSecretLimiter.reset(`adm:${ip}`);
  const nowIso = new Date().toISOString();
  admin.lastSeenAt = nowIso;
  await repoUpdateUserLastSeen(admin.id, nowIso);

  const adminSessionToken = await createSessionForUser(admin.id, 'admin');
  setAdminSessionCookie(res, adminSessionToken);

  await repoRecordAdminLog(
    admin.nickname,
    'ADMIN_ACESSO_OK',
    `Sessão administrativa iniciada com sucesso (IP ${ip})`
  );

  res.json({
    admin: sanitizeUserProfile(admin, null),
    adminSessionToken,
    requiresPasswordChange: admin.mustChangePassword,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
}

export function adminSessionStatusHandler(req: AuthedRequest, res: Response): void {
  const adm = req.adminUser;
  if (!adm || adm.role !== 'admin') {
    res.status(401).json({ error: 'Sessão administrativa inativa ou expirada.' });
    return;
  }
  res.json({
    admin: sanitizeUserProfile(adm, null),
    requiresPasswordChange: adm.mustChangePassword,
  });
}

export async function adminLogoutHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!validateCsrfForCookie(req)) {
    res.status(403).json({ error: 'Falha na validação de origem da requisição.' });
    return;
  }

  const adm = req.adminUser;
  if (req.adminToken) {
    await repoDeleteSession(req.adminToken);
  }
  if (adm) {
    await repoRecordAdminLog(
      adm.nickname,
      'ADMIN_LOGOUT',
      'Sessão administrativa encerrada manualmente'
    );
  }
  clearAdminSessionCookie(res);
  res.json({ ok: true });
}

export async function changePasswordHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!validateCsrfForCookie(req)) {
    res.status(403).json({ error: 'Falha na validação de origem da requisição.' });
    return;
  }
  const targetUser = req.adminUser ?? req.authUser;
  if (!targetUser) {
    res.status(401).json({ error: 'Sessão expirada ou não autenticado.' });
    return;
  }

  const { currentPassword, newPassword, confirmPassword } = req.body ?? {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Preencha a senha atual e a nova senha.' });
    return;
  }

  if (newPassword.length < 6 || newPassword.length > 100) {
    res.status(400).json({ error: 'A nova senha deve ter entre 6 e 100 caracteres.' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'A confirmação da nova senha não confere.' });
    return;
  }

  const valid = await verifyPassword(currentPassword, targetUser.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Senha atual incorreta.' });
    return;
  }

  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'Escolha uma nova senha diferente da inicial.' });
    return;
  }

  const newHash = await hashPassword(newPassword);
  targetUser.passwordHash = newHash;
  targetUser.mustChangePassword = false;
  await repoUpdateUserPassword(targetUser.id, newHash, false);

  if (targetUser.role === 'admin') {
    await repoRecordAdminLog(
      targetUser.nickname,
      'ADMIN_SENHA_ALTERADA',
      'Senha inicial administrativa atualizada com sucesso'
    );
  }

  const rank = await repoComputePlayerRank(targetUser.id);
  res.json({
    user: sanitizeUserProfile(targetUser, rank),
  });
}

export async function recoverAccountHandler(req: Request, res: Response): Promise<void> {
  const ip = getClientIp(req);
  const rate = recoverLimiter.check(`rec:${ip}`);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Muitas tentativas de recuperação. Aguarde ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const { nickname, recoveryCode, newPassword, confirmPassword } = req.body ?? {};
  if (
    typeof nickname !== 'string' ||
    typeof recoveryCode !== 'string' ||
    typeof newPassword !== 'string'
  ) {
    res.status(400).json({ error: 'Preencha nickname, código de recuperação e nova senha.' });
    return;
  }

  if (newPassword.length < 6 || newPassword.length > 100 || newPassword !== confirmPassword) {
    res.status(400).json({ error: 'Nova senha inválida ou não coincide.' });
    return;
  }

  const user = await repoFindUserByNickname(nickname);
  if (!user || user.role === 'admin' || !user.recoveryHash) {
    res.status(400).json({ error: 'Não foi possível validar os dados de recuperação.' });
    return;
  }

  const validCode = await verifyPassword(recoveryCode.trim(), user.recoveryHash);
  if (!validCode) {
    res.status(401).json({ error: 'Código de recuperação incorreto.' });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await repoUpdateUserPassword(user.id, newHash, user.mustChangePassword);

  res.json({ ok: true, message: 'Senha redefinida com sucesso. Faça login!' });
}

export async function logoutHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (req.authToken) {
    await repoDeleteSession(req.authToken);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}

export async function meHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.authUser) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  const rank = await repoComputePlayerRank(req.authUser.id);
  res.json({
    user: sanitizeUserProfile(req.authUser, rank),
  });
}

export async function adminBootstrapStatusHandler(_req: Request, res: Response): Promise<void> {
  await ensureDbAndAdminReady();
  const envConfigured = Boolean(
    process.env.ADMIN_INITIAL_USERNAME?.trim() && process.env.ADMIN_INITIAL_PASSWORD
  );
  const hasAdmin = await repoHasAdminAccount();
  res.json({
    needsBootstrap: !envConfigured && !hasAdmin,
  });
}

export async function adminBootstrapHandler(req: Request, res: Response): Promise<void> {
  await ensureDbAndAdminReady();
  const envConfigured = Boolean(
    process.env.ADMIN_INITIAL_USERNAME?.trim() && process.env.ADMIN_INITIAL_PASSWORD
  );
  const hasAdmin = await repoHasAdminAccount();
  if (envConfigured || hasAdmin) {
    res.status(403).json({ error: 'Administrador já configurado.' });
    return;
  }

  const { nickname: rawNick, password, confirmPassword } = req.body ?? {};
  const nickname = validateNickname(rawNick);
  if (!nickname) {
    res.status(400).json({ error: 'Nome de usuário inválido.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6 || password !== confirmPassword) {
    res.status(400).json({ error: 'Senha inválida ou não coincide (mín. 6 caracteres).' });
    return;
  }
  if (await repoFindUserByNickname(nickname)) {
    res.status(409).json({ error: 'Este nome já pertence a outro usuário.' });
    return;
  }

  const id = `adm_${generateToken(8)}`;
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const adminUser: StoredUser = {
    id,
    nickname,
    nicknameLower: nickname.toLowerCase(),
    passwordHash,
    recoveryHash: null,
    role: 'admin',
    mustChangePassword: false,
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
  await repoCreateUser(adminUser);
  const adminSessionToken = await createSessionForUser(id, 'admin');
  setAdminSessionCookie(res, adminSessionToken);

  await repoRecordAdminLog(
    adminUser.nickname,
    'ADMIN_BOOTSTRAP',
    'Conta administrativa inicial configurada'
  );

  res.status(201).json({
    user: sanitizeUserProfile(adminUser, null),
    sessionToken: adminSessionToken,
    adminSessionToken,
  });
}

let cachedFirebaseProjectId: string | null = null;

function getFirebaseProjectId(): string {
  if (cachedFirebaseProjectId !== null) {
    return cachedFirebaseProjectId;
  }

  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../firebase-applet-config.json'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
          projectId?: unknown;
        };
        if (typeof parsed.projectId === 'string' && parsed.projectId.trim()) {
          cachedFirebaseProjectId = parsed.projectId.trim();
          return cachedFirebaseProjectId;
        }
      }
    } catch (err) {
      console.error(`Failed to read Firebase config from ${filePath}:`, err);
    }
  }

  const envProjectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    '';
  cachedFirebaseProjectId = envProjectId;
  return cachedFirebaseProjectId;
}

let cachedGoogleCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (cachedGoogleCerts && cachedGoogleCerts.expiresAt > Date.now()) {
    return cachedGoogleCerts.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Falha ao obter certificados públicos do Google.');
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cc = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cc.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedGoogleCerts = { certs, expiresAt: Date.now() + maxAgeSec * 1000 };
  return certs;
}

async function verifyFirebaseJwt(idToken: string): Promise<{ uid: string; name?: string; email?: string }> {
  const projectId = getFirebaseProjectId();
  if (!projectId) {
    throw new Error('Configuração do Firebase ausente no servidor.');
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Token inválido.');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Algoritmo JWT inválido.');
  }
  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Certificado de assinatura não encontrado.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const signatureValid = verifier.verify(cert, Buffer.from(sigB64, 'base64url'));
  if (!signatureValid) {
    throw new Error('Assinatura do token Firebase inválida.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error('Audience inválida.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Issuer inválido.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('UID ausente.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Token expirado.');
  }

  return {
    uid: payload.sub,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}

export async function googleAuthHandler(req: Request, res: Response): Promise<void> {
  const { idToken, preferredNickname } = req.body ?? {};
  if (typeof idToken !== 'string' || !idToken) {
    res.status(400).json({ error: 'Token Google ausente.' });
    return;
  }

  try {
    const claims = await verifyFirebaseJwt(idToken);
    let user = await repoFindUserByGoogleUid(claims.uid);

    if (!user) {
      const baseNameRaw =
        (typeof preferredNickname === 'string' && preferredNickname.trim()) ||
        claims.name ||
        (claims.email ? claims.email.split('@')[0] : 'Corredor');
      let candidate = baseNameRaw.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 16);
      if (candidate.length < 3) candidate = `Ratao_${claims.uid.slice(0, 4)}`;
      while (await repoFindUserByNickname(candidate)) {
        candidate = `${candidate.slice(0, 14)}_${Math.floor(10 + Math.random() * 89)}`;
      }

      const id = `usr_${generateToken(8)}`;
      const now = new Date().toISOString();
      user = {
        id,
        nickname: candidate,
        nicknameLower: candidate.toLowerCase(),
        passwordHash: '',
        recoveryHash: null,
        googleUid: claims.uid,
        role: 'player',
        mustChangePassword: false,
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
      await repoCreateUser(user);
    } else {
      const nowIso = new Date().toISOString();
      user.lastSeenAt = nowIso;
      await repoUpdateUserLastSeen(user.id, nowIso);
    }

    const sessionToken = await createSessionForUser(user.id, 'player');
    setSessionCookie(res, sessionToken);

    const rank = await repoComputePlayerRank(user.id);
    res.json({
      user: sanitizeUserProfile(user, rank),
      sessionToken,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Falha ao validar login Google.' });
  }
}
