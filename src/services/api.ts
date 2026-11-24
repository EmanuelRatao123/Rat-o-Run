import {
  AdminExclusiveSkinOwner,
  AdminLogItem,
  AdminPlayerRecord,
  AdminStats,
  CoinsLeaderboardEntry,
  CustomCharacterConfig,
  GlobalMessage,
  LeaderboardCategory,
  LeaderboardEntry,
  MapId,
  MatchSummary,
  MultiplayerInvite,
  MultiplayerMatchRecord,
  MultiplayerMode,
  MultiplayerParticipant,
  MultiplayerRoom,
  ParticipantAnimState,
  PlayerCompetitiveStats,
  PlayerNotificationItem,
  PlayerSuggestion,
  PlayerWalletStats,
  PollItem,
  PromoCodeRecord,
  PromoCodeRedemptionRecord,
  PromoRewardType,
  PublicPlayerLookup,
  SkinGiftItem,
  SkinId,
  SoloGameMode,
  SuggestionStatus,
  SuggestionType,
  UserProfile,
  X1ResultRecord,
} from '../shared/constants.ts';

let memorySessionToken: string | null = null;
let memoryAdminToken: string | null = null;

export function setMemorySessionToken(token: string | null): void {
  memorySessionToken = token;
}

export function getMemorySessionToken(): string | null {
  return memorySessionToken;
}

export function setMemoryAdminToken(token: string | null): void {
  memoryAdminToken = token;
}

export function getMemoryAdminToken(): string | null {
  return memoryAdminToken;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memorySessionToken) {
    headers.set('Authorization', `Bearer ${memorySessionToken}`);
  }
  if (memoryAdminToken) {
    headers.set('X-Admin-Token', memoryAdminToken);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro na requisição (${res.status})`);
  }
  return data as T;
}

export const api = {
  register: (payload: {
    nickname: string;
    password: string;
    confirmPassword: string;
    recoveryCode?: string;
  }) =>
    apiFetch<{ user: UserProfile; sessionToken: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { nickname: string; password: string }) =>
    apiFetch<{ user: UserProfile; sessionToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginWithGoogleToken: (idToken: string, preferredNickname?: string) =>
    apiFetch<{ user: UserProfile; sessionToken: string }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken, preferredNickname }),
    }),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => apiFetch<{ user: UserProfile }>('/api/auth/me'),

  recoverAccount: (payload: {
    nickname: string;
    recoveryCode: string;
    newPassword: string;
    confirmPassword: string;
  }) =>
    apiFetch<{ ok: boolean; message: string }>('/api/auth/recover', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) =>
    apiFetch<{ user: UserProfile }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAdminBootstrapStatus: () =>
    apiFetch<{ needsBootstrap: boolean }>('/api/admin/bootstrap-status'),

  bootstrapAdmin: (payload: {
    nickname: string;
    password: string;
    confirmPassword: string;
  }) =>
    apiFetch<{ user: UserProfile; sessionToken: string; adminSessionToken: string }>(
      '/api/admin/bootstrap',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  secretAdminLogin: (password: string) =>
    apiFetch<{
      admin: UserProfile;
      adminSessionToken: string;
      requiresPasswordChange: boolean;
      expiresAt: number;
    }>('/api/admin/secret-login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  getAdminSessionStatus: () =>
    apiFetch<{ admin: UserProfile; requiresPasswordChange: boolean }>('/api/admin/session'),

  adminChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) =>
    apiFetch<{ user: UserProfile }>('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminLogout: () => apiFetch<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),

  equipSkin: (skinId: SkinId) =>
    apiFetch<{ equippedSkin: SkinId }>('/api/skins/equip', {
      method: 'POST',
      body: JSON.stringify({ skinId }),
    }),

  startMatch: (mapId: MapId, skinId: SkinId, mode: SoloGameMode = 'no_coin') =>
    apiFetch<{ matchId: string; startedAt: number; signature: string; mode: SoloGameMode }>(
      '/api/match/start',
      {
        method: 'POST',
        body: JSON.stringify({ mapId, skinId, mode }),
      }
    ),

  finishMatch: (payload: {
    matchId: string;
    signature: string;
    noCoinTimeMs: number;
    collectedCoin: boolean;
    coins: number;
    distance: number;
    score: number;
    durationMs: number;
    endReason?: 'police' | 'coin';
  }) =>
    apiFetch<{ summary: MatchSummary }>('/api/match/finish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getLeaderboard: (params?: {
    category?: LeaderboardCategory;
    page?: number;
    pageSize?: number;
  }) => {
    const category = params?.category || 'no_coin';
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const qs = new URLSearchParams({
      category,
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<{
      category: LeaderboardCategory;
      entries: (LeaderboardEntry | CoinsLeaderboardEntry)[];
      totalRanked: number;
      page: number;
      pageSize: number;
      totalPages: number;
      currentUserEntry: LeaderboardEntry | CoinsLeaderboardEntry | null;
    }>(`/api/leaderboard?${qs.toString()}`);
  },

  getPublicProfile: (nickname: string) =>
    apiFetch<{
      profile: {
        id: string;
        nickname: string;
        equippedSkin: SkinId;
        createdAt: string;
        bestNoCoinTimeMs: number;
        bestDistance: number;
        bestScore: number;
        totalMatches: number;
        totalCoins: number;
        favoriteSkin: SkinId;
        rank: number | null;
        competitiveStats: PlayerCompetitiveStats;
        walletStats?: PlayerWalletStats;
        customCharacterConfig?: CustomCharacterConfig;
        recentX1: X1ResultRecord[];
      };
    }>(`/api/profile/${encodeURIComponent(nickname)}`),

  getSocialFeed: () =>
    apiFetch<{
      messages: GlobalMessage[];
      polls: PollItem[];
      unseenGifts: SkinGiftItem[];
      featuredMap: MapId;
      notifications?: PlayerNotificationItem[];
    }>('/api/social/feed'),

  markNotificationsSeen: () =>
    apiFetch<{ ok: boolean }>('/api/notifications/seen', { method: 'POST' }),

  createSuggestion: (payload: { type: SuggestionType; title: string; description: string }) =>
    apiFetch<{ suggestion: PlayerSuggestion }>('/api/suggestions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMySuggestions: () =>
    apiFetch<{ suggestions: PlayerSuggestion[] }>('/api/suggestions/mine'),

  redeemPromoCode: (code: string) =>
    apiFetch<{
      code: string;
      rewardType: PromoRewardType;
      rewardSkinId: SkinId | null;
      rewardAmount: number;
      rewardSummary: string;
      walletStats: PlayerWalletStats;
      totalCoins: number;
      unlockedSkins: SkinId[];
      allowedExclusiveSkins: SkinId[];
    }>('/api/promo-codes/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  getMyCustomCharacter: () =>
    apiFetch<{ config: CustomCharacterConfig; unlocked: boolean }>('/api/custom-character'),

  saveMyCustomCharacter: (config: CustomCharacterConfig) =>
    apiFetch<{ config: CustomCharacterConfig }>('/api/custom-character', {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),

  markGiftsSeen: () => apiFetch<{ ok: boolean }>('/api/gifts/seen', { method: 'POST' }),

  votePoll: (pollId: string, optionIndex: number) =>
    apiFetch<{ poll: PollItem }>(`/api/polls/${encodeURIComponent(pollId)}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionIndex }),
    }),

  // Admin APIs
  getAdminStats: () =>
    apiFetch<{
      stats: AdminStats;
      messages: GlobalMessage[];
      polls: PollItem[];
      gifts: SkinGiftItem[];
      logs: AdminLogItem[];
    }>('/api/admin/stats'),

  searchAdminPlayers: (q: string) =>
    apiFetch<{ players: AdminPlayerRecord[] }>(
      `/api/admin/players?q=${encodeURIComponent(q)}`
    ),

  createGlobalMessage: (payload: { title: string; content: string; durationMinutes: number }) =>
    apiFetch<{ message: GlobalMessage }>('/api/admin/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteGlobalMessage: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/messages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createPoll: (payload: { title: string; options: string[]; durationMinutes: number }) =>
    apiFetch<{ poll: PollItem }>('/api/admin/polls', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  closePoll: (id: string) =>
    apiFetch<{ poll: PollItem }>(`/api/admin/polls/${encodeURIComponent(id)}/close`, {
      method: 'POST',
    }),

  giftSkin: (payload: { nickname: string; skinId: SkinId }) =>
    apiFetch<{ gift: SkinGiftItem }>('/api/admin/gift-skin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminUnlockKingSkin: () =>
    apiFetch<{ alreadyUnlocked: boolean; allowedExclusiveSkins: SkinId[] }>(
      '/api/admin/unlock-king-skin',
      { method: 'POST' }
    ),

  adminListExclusiveSkinOwners: (skinId?: SkinId) =>
    apiFetch<{ owners: AdminExclusiveSkinOwner[] }>(
      skinId
        ? `/api/admin/exclusive-skins/owners?skinId=${encodeURIComponent(skinId)}`
        : '/api/admin/exclusive-skins/owners'
    ),

  adminGrantExclusiveSkin: (payload: { nickname: string; skinId: SkinId }) =>
    apiFetch<{ owner: AdminExclusiveSkinOwner }>('/api/admin/exclusive-skins/grant', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminRevokeExclusiveSkin: (payload: { userId: string; skinId: SkinId }) =>
    apiFetch<{ ok: boolean; targetNickname: string; resetEquipped: boolean }>(
      '/api/admin/exclusive-skins/revoke',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  adminListSuggestions: (params?: { search?: string; type?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.type && params.type !== 'all') qs.set('type', params.type);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<{ suggestions: PlayerSuggestion[] }>(`/api/admin/suggestions${suffix}`);
  },

  adminUpdateSuggestion: (
    id: string,
    payload: { status: SuggestionStatus; adminNote?: string | null }
  ) =>
    apiFetch<{ suggestion: PlayerSuggestion }>(`/api/admin/suggestions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  adminDeleteSuggestion: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/suggestions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  adminListPromoCodes: () =>
    apiFetch<{ promoCodes: PromoCodeRecord[] }>('/api/admin/promo-codes'),

  adminCreatePromoCode: (payload: {
    code: string;
    description: string;
    rewardType: PromoRewardType;
    rewardSkinId?: SkinId | null;
    rewardAmount?: number;
    rewardMetadata?: Record<string, unknown>;
    maxUses?: number | null;
    isInfinite: boolean;
    active: boolean;
    expiresAt?: string | null;
  }) =>
    apiFetch<{ promo: PromoCodeRecord }>('/api/admin/promo-codes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminUpdatePromoCode: (
    id: string,
    payload: {
      description?: string;
      rewardType?: PromoRewardType;
      rewardSkinId?: SkinId | null;
      rewardAmount?: number;
      rewardMetadata?: Record<string, unknown>;
      maxUses?: number | null;
      isInfinite?: boolean;
      active?: boolean;
      expiresAt?: string | null;
    }
  ) =>
    apiFetch<{ promo: PromoCodeRecord }>(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  adminDeletePromoCode: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  adminListPromoRedemptions: (id: string) =>
    apiFetch<{ redemptions: PromoCodeRedemptionRecord[] }>(
      `/api/admin/promo-codes/${encodeURIComponent(id)}/redemptions`
    ),

  multiplayer: {
    overview: () =>
      apiFetch<{
        incomingInvites: MultiplayerInvite[];
        outgoingInvites: MultiplayerInvite[];
        activeRoom: {
          room: MultiplayerRoom;
          participants: MultiplayerParticipant[];
          serverNow: number;
        } | null;
        competitiveStats: PlayerCompetitiveStats;
        recentMatches: MultiplayerMatchRecord[];
        recentX1: X1ResultRecord[];
      }>('/api/multiplayer/overview'),

    search: (nickname: string) =>
      apiFetch<{ players: PublicPlayerLookup[] }>(
        `/api/multiplayer/search?nickname=${encodeURIComponent(nickname)}`
      ),

    createInvite: (payload: {
      targetNickname: string;
      mode: MultiplayerMode;
      mapId: MapId;
    }) =>
      apiFetch<{
        invite: MultiplayerInvite;
        room: MultiplayerRoom;
        participants: MultiplayerParticipant[];
      }>('/api/multiplayer/invites', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    respondInvite: (inviteId: string, action: 'accept' | 'decline' | 'cancel') =>
      apiFetch<{
        ok: boolean;
        status: string;
        room?: MultiplayerRoom;
        participants?: MultiplayerParticipant[];
      }>(`/api/multiplayer/invites/${encodeURIComponent(inviteId)}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),

    getRoom: (roomId: string) =>
      apiFetch<{
        room: MultiplayerRoom;
        participants: MultiplayerParticipant[];
        serverNow: number;
      }>(`/api/multiplayer/rooms/${encodeURIComponent(roomId)}`),

    setReady: (roomId: string, ready: boolean, mapId?: MapId) =>
      apiFetch<{
        room: MultiplayerRoom;
        participants: MultiplayerParticipant[];
        serverNow: number;
      }>(`/api/multiplayer/rooms/${encodeURIComponent(roomId)}/ready`, {
        method: 'POST',
        body: JSON.stringify({ ready, mapId }),
      }),

    startRoom: (roomId: string) =>
      apiFetch<{
        room: MultiplayerRoom;
        participants: MultiplayerParticipant[];
        serverNow: number;
      }>(`/api/multiplayer/rooms/${encodeURIComponent(roomId)}/start`, {
        method: 'POST',
      }),

    syncRoom: (
      roomId: string,
      payload: {
        posX: number;
        posY: number;
        posZ: number;
        vx?: number;
        vy?: number;
        vz?: number;
        speed?: number;
        yaw?: number;
        seq?: number;
        clientTs?: number;
        pingMs?: number;
        lane: number;
        animState: ParticipantAnimState;
        distance: number;
        coins: number;
        score: number;
        noCoinTimeMs: number;
        durationMs: number;
        collisionCount: number;
        alive: boolean;
        hoverboard: boolean;
        jetpack: boolean;
        event?:
          | { type: 'coin_collected'; coinZ: number; coinLane: number }
          | { type: 'crashed' };
      }
    ) =>
      apiFetch<{
        room: MultiplayerRoom;
        participants: MultiplayerParticipant[];
        serverNow: number;
        echoClientTs?: number;
      }>(`/api/multiplayer/rooms/${encodeURIComponent(roomId)}/sync`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    leaveRoom: (roomId: string) =>
      apiFetch<{
        room: MultiplayerRoom;
        participants: MultiplayerParticipant[];
      }>(`/api/multiplayer/rooms/${encodeURIComponent(roomId)}/leave`, {
        method: 'POST',
      }),
  },
};
