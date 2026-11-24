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
  adminGrantExclusiveSkinHandler,
  adminListExclusiveSkinOwnersHandler,
  adminRevokeExclusiveSkinHandler,
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
import {
  adminCreatePromoCodeHandler,
  adminDeletePromoCodeHandler,
  adminDeleteSuggestionHandler,
  adminListPromoCodesHandler,
  adminListPromoRedemptionsHandler,
  adminListSuggestionsHandler,
  adminUnlockKingSkinHandler,
  adminUpdatePromoCodeHandler,
  adminUpdateSuggestionHandler,
  createSuggestionHandler,
  getCustomTextureHandler,
  getMyCustomCharacterHandler,
  getUserCustomCharacterPublicHandler,
  listMySuggestionsHandler,
  markNotificationsSeenHandler,
  redeemPromoCodeHandler,
  saveMyCustomCharacterHandler,
} from './src/server/featureApi.ts';
import {
  mpCreateInviteHandler,
  mpGetRoomHandler,
  mpLeaveRoomHandler,
  mpOverviewHandler,
  mpReadyRoomHandler,
  mpRespondInviteHandler,
  mpSearchPlayersHandler,
  mpStartRoomHandler,
  mpSyncRoomHandler,
} from './src/server/multiplayerApi.ts';
import { ensureDbAndAdminReady } from './src/server/repository.ts';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const jsonSmall = express.json({ limit: '64kb' });
const jsonCustomCharacter = express.json({ limit: '384kb' });
app.use((req, res, next) => {
  if (req.path.startsWith('/api/custom-character')) {
    return jsonCustomCharacter(req, res, next);
  }
  return jsonSmall(req, res, next);
});
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

// Multiplayer & X1 routes
app.get('/api/multiplayer/overview', requireAuth, wrap(mpOverviewHandler));
app.get('/api/multiplayer/search', requireAuth, wrap(mpSearchPlayersHandler));
app.post('/api/multiplayer/invites', requireAuth, wrap(mpCreateInviteHandler));
app.post('/api/multiplayer/invites/:inviteId/respond', requireAuth, wrap(mpRespondInviteHandler));
app.get('/api/multiplayer/rooms/:roomId', requireAuth, wrap(mpGetRoomHandler));
app.post('/api/multiplayer/rooms/:roomId/ready', requireAuth, wrap(mpReadyRoomHandler));
app.post('/api/multiplayer/rooms/:roomId/start', requireAuth, wrap(mpStartRoomHandler));
app.post('/api/multiplayer/rooms/:roomId/sync', requireAuth, wrap(mpSyncRoomHandler));
app.post('/api/multiplayer/rooms/:roomId/leave', requireAuth, wrap(mpLeaveRoomHandler));

// Suggestions, Promo Codes, Notifications & Custom Character ("Meu Ratão") routes
app.post('/api/notifications/seen', requireAuth, wrap(markNotificationsSeenHandler));
app.post('/api/suggestions', requireAuth, wrap(createSuggestionHandler));
app.get('/api/suggestions/mine', requireAuth, wrap(listMySuggestionsHandler));
app.post('/api/promo-codes/redeem', requireAuth, wrap(redeemPromoCodeHandler));
app.get('/api/custom-character', requireAuth, wrap(getMyCustomCharacterHandler));
app.put('/api/custom-character', requireAuth, wrap(saveMyCustomCharacterHandler));
app.get('/api/custom-character/textures/:textureId', wrap(getCustomTextureHandler));
app.get('/api/custom-character/user/:userId', wrap(getUserCustomCharacterPublicHandler));

// Protected Admin Panel routes
app.get('/api/admin/stats', requireAdmin, wrap(adminStatsHandler));
app.get('/api/admin/players', requireAdmin, wrap(adminSearchPlayersHandler));
app.post('/api/admin/unlock-king-skin', requireAdmin, wrap(adminUnlockKingSkinHandler));
app.get(
  '/api/admin/exclusive-skins/owners',
  requireAdmin,
  wrap(adminListExclusiveSkinOwnersHandler)
);
app.post(
  '/api/admin/exclusive-skins/grant',
  requireAdmin,
  wrap(adminGrantExclusiveSkinHandler)
);
app.post(
  '/api/admin/exclusive-skins/revoke',
  requireAdmin,
  wrap(adminRevokeExclusiveSkinHandler)
);
app.post('/api/admin/messages', requireAdmin, wrap(adminCreateMessageHandler));
app.delete('/api/admin/messages/:id', requireAdmin, wrap(adminDeleteMessageHandler));
app.post('/api/admin/polls', requireAdmin, wrap(adminCreatePollHandler));
app.post('/api/admin/polls/:id/close', requireAdmin, wrap(adminClosePollHandler));
app.post('/api/admin/gift-skin', requireAdmin, wrap(adminGiftSkinHandler));
app.get('/api/admin/suggestions', requireAdmin, wrap(adminListSuggestionsHandler));
app.patch('/api/admin/suggestions/:id', requireAdmin, wrap(adminUpdateSuggestionHandler));
app.delete('/api/admin/suggestions/:id', requireAdmin, wrap(adminDeleteSuggestionHandler));
app.get('/api/admin/promo-codes', requireAdmin, wrap(adminListPromoCodesHandler));
app.post('/api/admin/promo-codes', requireAdmin, wrap(adminCreatePromoCodeHandler));
app.patch('/api/admin/promo-codes/:id', requireAdmin, wrap(adminUpdatePromoCodeHandler));
app.delete('/api/admin/promo-codes/:id', requireAdmin, wrap(adminDeletePromoCodeHandler));
app.get('/api/admin/promo-codes/:id/redemptions', requireAdmin, wrap(adminListPromoRedemptionsHandler));

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
