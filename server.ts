import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  adminBootstrapHandler,
  adminBootstrapStatusHandler,
  adminLogoutHandler,
  adminSessionStatusHandler,
  attachAuth,
  changePasswordHandler,
  googleAuthHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  recoverAccountHandler,
  registerHandler,
  requireAdmin,
  requireAuth,
  secretAdminLoginHandler,
} from './src/server/auth.ts';
import {
  adminClosePollHandler,
  adminCreateMessageHandler,
  adminCreatePollHandler,
  adminDeleteMessageHandler,
  adminGiftSkinHandler,
  adminSearchPlayersHandler,
  adminStatsHandler,
  equipSkinHandler,
  finishMatchHandler,
  leaderboardHandler,
  markGiftsSeenHandler,
  publicProfileHandler,
  socialFeedHandler,
  startMatchHandler,
  votePollHandler,
} from './src/server/gameApi.ts';
import { ensureDbAndAdminReady } from './src/server/repository.ts';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use(attachAuth);

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('Unhandled route error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro interno do servidor.' });
      }
    });
  };

// Auth routes
app.post('/api/auth/register', wrap(registerHandler));
app.post('/api/auth/login', wrap(loginHandler));
app.post('/api/auth/google', wrap(googleAuthHandler));
app.post('/api/auth/logout', wrap(logoutHandler));
app.post('/api/auth/recover', wrap(recoverAccountHandler));
app.post('/api/auth/change-password', requireAuth, wrap(changePasswordHandler));
app.get('/api/auth/me', wrap(meHandler));

// Secret admin access & dedicated session routes
app.get('/api/admin/bootstrap-status', wrap(adminBootstrapStatusHandler));
app.post('/api/admin/bootstrap', wrap(adminBootstrapHandler));
app.post('/api/admin/secret-login', wrap(secretAdminLoginHandler));
app.get('/api/admin/session', wrap(adminSessionStatusHandler));
app.post('/api/admin/change-password', wrap(changePasswordHandler));
app.post('/api/admin/logout', wrap(adminLogoutHandler));

// Game & Social routes
app.post('/api/skins/equip', requireAuth, wrap(equipSkinHandler));
app.post('/api/match/start', requireAuth, wrap(startMatchHandler));
app.post('/api/match/finish', requireAuth, wrap(finishMatchHandler));
app.get('/api/leaderboard', wrap(leaderboardHandler));
app.get('/api/profile/:nickname', wrap(publicProfileHandler));
app.get('/api/social/feed', wrap(socialFeedHandler));
app.post('/api/gifts/seen', requireAuth, wrap(markGiftsSeenHandler));
app.post('/api/polls/:pollId/vote', requireAuth, wrap(votePollHandler));

// Protected Admin Panel routes
app.get('/api/admin/stats', requireAdmin, wrap(adminStatsHandler));
app.get('/api/admin/players', requireAdmin, wrap(adminSearchPlayersHandler));
app.post('/api/admin/messages', requireAdmin, wrap(adminCreateMessageHandler));
app.delete('/api/admin/messages/:id', requireAdmin, wrap(adminDeleteMessageHandler));
app.post('/api/admin/polls', requireAdmin, wrap(adminCreatePollHandler));
app.post('/api/admin/polls/:id/close', requireAdmin, wrap(adminClosePollHandler));
app.post('/api/admin/gift-skin', requireAdmin, wrap(adminGiftSkinHandler));

export default app;

async function startServer() {
  await ensureDbAndAdminReady();
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RATÃO RUN 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  void startServer();
}
