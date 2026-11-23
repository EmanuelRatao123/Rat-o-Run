export type CommonSkinId =
  | 'ratao'
  | 'capivara'
  | 'macaco'
  | 'neymar_2011'
  | 'lamine_yamal'
  | 'tartaruga'
  | 'cachorro'
  | 'superman'
  | 'homem_de_ferro'
  | 'galo_doido';

export type ExclusiveSkinId =
  | 'ratao_rei'
  | 'lenda_suprema'
  | 'campeao_prata'
  | 'guerreiro_bronze';

export type SpecialUnlockableSkinId = 'meu_ratao';

export type SkinId = CommonSkinId | ExclusiveSkinId | SpecialUnlockableSkinId;

export type MapId = 'brasil' | 'tokyo' | 'futebol' | 'capivara';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type SoloGameMode = 'normal' | 'no_coin';

export type LeaderboardCategory = 'no_coin' | 'coins';

export type PowerUpType = 'magnet' | 'jetpack' | 'super_jump' | 'multiplier' | 'hoverboard';

export type ExclusiveRule = 'admin' | 'top1' | 'top2' | 'top3' | 'unlockable';

export interface SkinDefinition {
  id: SkinId;
  name: string;
  subtitle: string;
  primaryColor: string;
  accentColor: string;
  badgeText: string;
  prototypeNote?: string;
  isExclusive?: boolean;
  exclusiveRule?: ExclusiveRule;
  unlockConditionText?: string;
}

export const SKINS: SkinDefinition[] = [
  {
    id: 'ratao',
    name: 'Ratão',
    subtitle: 'Mascote urbano das ruas voxel',
    primaryColor: '#64748b',
    accentColor: '#f43f5e',
    badgeText: 'ORIGINAL',
  },
  {
    id: 'capivara',
    name: 'Capivara',
    subtitle: 'Mestre da tranquilidade na reserva',
    primaryColor: '#92400e',
    accentColor: '#22c55e',
    badgeText: 'CHILL',
  },
  {
    id: 'macaco',
    name: 'Macaco',
    subtitle: 'Agasalho vermelho e banana turbo',
    primaryColor: '#dc2626',
    accentColor: '#facc15',
    badgeText: 'ÁGIL',
  },
  {
    id: 'neymar_2011',
    name: 'Neymar 2011',
    subtitle: 'Moicano clássico, drible e ousadia #11',
    primaryColor: '#06b6d4',
    accentColor: '#facc15',
    badgeText: 'PROTÓTIPO',
    prototypeNote: 'Conteúdo de protótipo — requer autorização de imagem antes de publicação comercial.',
  },
  {
    id: 'lamine_yamal',
    name: 'Lamine Yamal',
    subtitle: 'Jovem prodígio veloz #19',
    primaryColor: '#1d4ed8',
    accentColor: '#be123c',
    badgeText: 'PROTÓTIPO',
    prototypeNote: 'Conteúdo de protótipo — requer autorização de imagem antes de publicação comercial.',
  },
  {
    id: 'tartaruga',
    name: 'Tartaruga',
    subtitle: 'Camisa verde com coração e capacete',
    primaryColor: '#16a34a',
    accentColor: '#ef4444',
    badgeText: 'CASCO',
  },
  {
    id: 'cachorro',
    name: 'Cachorro',
    subtitle: 'Jaqueta azul com emblema de moto',
    primaryColor: '#2563eb',
    accentColor: '#f97316',
    badgeText: 'TURBO',
  },
  {
    id: 'superman',
    name: 'Superman',
    subtitle: 'Capa vermelha e voo supersônico',
    primaryColor: '#1e40af',
    accentColor: '#dc2626',
    badgeText: 'PROTÓTIPO',
    prototypeNote: 'Conteúdo de protótipo — requer licença de marca antes de publicação comercial.',
  },
  {
    id: 'homem_de_ferro',
    name: 'Homem de Ferro',
    subtitle: 'Armadura rubi-ouro com reator Arc',
    primaryColor: '#b91c1c',
    accentColor: '#fbbf24',
    badgeText: 'PROTÓTIPO',
    prototypeNote: 'Conteúdo de protótipo — requer licença de marca antes de publicação comercial.',
  },
  {
    id: 'galo_doido',
    name: 'Galo Doido',
    subtitle: 'Mascote alvinegro #13 cheio de raça',
    primaryColor: '#18181b',
    accentColor: '#f8fafc',
    badgeText: 'PROTÓTIPO',
    prototypeNote: 'Conteúdo de protótipo — requer autorização de marca antes de publicação comercial.',
  },
];

export const EXCLUSIVE_SKINS: SkinDefinition[] = [
  {
    id: 'ratao_rei',
    name: 'Ratão Rei',
    subtitle: 'Coroa dourada, manto real e escolta de 5 ratinhos',
    primaryColor: '#eab308',
    accentColor: '#7e22ce',
    badgeText: 'EXCLUSIVA ADMIN',
    isExclusive: true,
    exclusiveRule: 'admin',
    unlockConditionText: 'Exclusiva para Administradores do jogo',
  },
  {
    id: 'lenda_suprema',
    name: 'Lenda Suprema',
    subtitle: 'Armadura dourada, coroa especial e aura de campeão #1',
    primaryColor: '#f59e0b',
    accentColor: '#fef08a',
    badgeText: 'TOP 1 GLOBAL',
    isExclusive: true,
    exclusiveRule: 'top1',
    unlockConditionText: 'Conquiste o #1 lugar no Ranking Sem Moedas',
  },
  {
    id: 'campeao_prata',
    name: 'Campeão de Prata',
    subtitle: 'Armadura prateada metálica com aura estelar do Top 2',
    primaryColor: '#cbd5e1',
    accentColor: '#38bdf8',
    badgeText: 'TOP 2 GLOBAL',
    isExclusive: true,
    exclusiveRule: 'top2',
    unlockConditionText: 'Conquiste o #2 lugar no Ranking Sem Moedas',
  },
  {
    id: 'guerreiro_bronze',
    name: 'Guerreiro de Bronze',
    subtitle: 'Armadura de bronze forjada e elmo do Top 3',
    primaryColor: '#b45309',
    accentColor: '#fb923c',
    badgeText: 'TOP 3 GLOBAL',
    isExclusive: true,
    exclusiveRule: 'top3',
    unlockConditionText: 'Conquiste o #3 lugar no Ranking Sem Moedas',
  },
];

export const SPECIAL_UNLOCKABLE_SKINS: SkinDefinition[] = [
  {
    id: 'meu_ratao',
    name: 'Meu Ratão',
    subtitle: 'Skin totalmente personalizável: cores, cabelo voxel, roupas, acessórios e pintura 3D',
    primaryColor: '#38bdf8',
    accentColor: '#f43f5e',
    badgeText: 'PERSONALIZÁVEL',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Desbloqueie por Código Promocional ou presente do Administrador',
  },
];

export const ALL_SKINS: SkinDefinition[] = [
  ...SKINS,
  ...EXCLUSIVE_SKINS,
  ...SPECIAL_UNLOCKABLE_SKINS,
];
export const COMMON_SKIN_IDS: CommonSkinId[] = SKINS.map((s) => s.id as CommonSkinId);
export const EXCLUSIVE_SKIN_IDS: ExclusiveSkinId[] = EXCLUSIVE_SKINS.map(
  (s) => s.id as ExclusiveSkinId
);
export const SPECIAL_UNLOCKABLE_SKIN_IDS: SpecialUnlockableSkinId[] = SPECIAL_UNLOCKABLE_SKINS.map(
  (s) => s.id as SpecialUnlockableSkinId
);
export const ALL_SKIN_IDS: SkinId[] = ALL_SKINS.map((s) => s.id);

export function isCommonSkinId(val: unknown): val is CommonSkinId {
  return typeof val === 'string' && (COMMON_SKIN_IDS as string[]).includes(val);
}

export function isExclusiveSkinId(val: unknown): val is ExclusiveSkinId {
  return typeof val === 'string' && (EXCLUSIVE_SKIN_IDS as string[]).includes(val);
}

export function isSpecialUnlockableSkinId(val: unknown): val is SpecialUnlockableSkinId {
  return typeof val === 'string' && (SPECIAL_UNLOCKABLE_SKIN_IDS as string[]).includes(val);
}

export function isGiftableSkinId(val: unknown): val is CommonSkinId | SpecialUnlockableSkinId {
  return isCommonSkinId(val) || isSpecialUnlockableSkinId(val);
}

export function isValidAnySkinId(val: unknown): val is SkinId {
  return typeof val === 'string' && (ALL_SKIN_IDS as string[]).includes(val);
}

export function getSkinDefinition(skinId: SkinId): SkinDefinition {
  return ALL_SKINS.find((s) => s.id === skinId) || SKINS[0];
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  skyHex: string;
  accentHex: string;
  badge: string;
  highlights: string[];
}

export const MAPS: MapDefinition[] = [
  {
    id: 'brasil',
    name: 'BRASIL',
    subtitle: 'Calçadão Tropical & Metrô',
    description: 'Ruas ensolaradas, casas coloridas, palmeiras, bandeiras do Brasil e trens urbanos.',
    skyHex: '#38bdf8',
    accentHex: '#22c55e',
    badge: 'TROPICAL',
    highlights: ['Calçadão em ondas', 'Casas coloridas', 'Palmeiras & Bandeiras', 'Metrô expresso'],
  },
  {
    id: 'tokyo',
    name: 'TOKYO',
    subtitle: 'Distrito Neon Noturno',
    description: 'Arranha-céus iluminados, letreiros neon, lanternas japonesas e trem-bala veloz.',
    skyHex: '#1e1b4b',
    accentHex: '#ec4899',
    badge: 'NEON',
    highlights: ['Letreiros luminosos', 'Lanternas Chochin', 'Trem-bala noturno', 'Lojas voxel'],
  },
  {
    id: 'futebol',
    name: 'FUTEBOL',
    subtitle: 'Arena Gigante Lotada',
    description: 'Gramado clássico, arquibancadas animadas, telões, traves e bolas gigantes no caminho.',
    skyHex: '#0284c7',
    accentHex: '#10b981',
    badge: 'ESTÁDIO',
    highlights: ['Torcida animada', 'Telões & Refletores', 'Traves & Bolas 3D', 'Gramado listrado'],
  },
  {
    id: 'capivara',
    name: 'CAPIVARA',
    subtitle: 'Reserva das Águas',
    description: 'Trilha na floresta, pontes sobre o rio, pedras, árvores densas e capivaras relaxando.',
    skyHex: '#6ee7b7',
    accentHex: '#f59e0b',
    badge: 'NATUREZA',
    highlights: ['Rios & Pontes', 'Capivaras 3D', 'Floresta densa', 'Lagos cristalinos'],
  },
];

export interface PowerUpInfo {
  type: PowerUpType;
  name: string;
  color: string;
  durationSec: number;
}

export const POWERUPS: Record<PowerUpType, PowerUpInfo> = {
  magnet: { type: 'magnet', name: 'Ímã de Moedas', color: '#ef4444', durationSec: 7 },
  jetpack: { type: 'jetpack', name: 'Jetpack', color: '#f97316', durationSec: 5 },
  super_jump: { type: 'super_jump', name: 'Super Salto', color: '#22c55e', durationSec: 8 },
  multiplier: { type: 'multiplier', name: 'Multiplicador 2x', color: '#a855f7', durationSec: 8 },
  hoverboard: { type: 'hoverboard', name: 'Hoverboard', color: '#06b6d4', durationSec: 10 },
};

export interface PlayerCompetitiveStats {
  userId: string;
  x1Wins: number;
  x1Losses: number;
  x1Draws: number;
  coopMatches: number;
  coopWins: number;
  lastMatchAt: string | null;
}

// --- Custom Character ("Meu Ratão") Types ---

export type CustomBodyPartKey =
  | 'head'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'ears'
  | 'snout'
  | 'tail'
  | 'hands'
  | 'feet';

export type HairStyleId =
  | 'short'
  | 'spiky'
  | 'long'
  | 'mohawk'
  | 'curly'
  | 'pompadour'
  | 'bald';

export type TopClothingId = 'none' | 'tshirt' | 'jacket';
export type BottomClothingId = 'none' | 'pants' | 'shorts';
export type ShoesTypeId = 'none' | 'sneakers' | 'boots';
export type HatTypeId = 'none' | 'cap' | 'hat';
export type GlassesTypeId = 'none' | 'sunglasses' | 'visor' | 'round';
export type AccessoryTypeId = 'none' | 'backpack' | 'scarf' | 'chain';
export type PaintRegion = 'head' | 'torsoFront' | 'torsoBack' | 'arms' | 'legs';

export interface CustomCharacterConfig {
  version: number;
  bodyColors: Record<CustomBodyPartKey, string>;
  hairStyle: HairStyleId;
  hairColor: string;
  clothing: {
    topType: TopClothingId;
    topColor: string;
    bottomType: BottomClothingId;
    bottomColor: string;
    shoesType: ShoesTypeId;
    shoesColor: string;
    hatType: HatTypeId;
    hatColor: string;
    glassesType: GlassesTypeId;
    glassesColor: string;
    accessoryType: AccessoryTypeId;
    accessoryColor: string;
  };
  favoriteColors: string[];
  paintTextures: Partial<Record<PaintRegion, string>>;
  updatedAt: string;
}

export const DEFAULT_CUSTOM_CHARACTER_CONFIG: CustomCharacterConfig = {
  version: 1,
  bodyColors: {
    head: '#ffffff',
    torso: '#ffffff',
    leftArm: '#ffffff',
    rightArm: '#ffffff',
    leftLeg: '#ffffff',
    rightLeg: '#ffffff',
    ears: '#ffffff',
    snout: '#ffffff',
    tail: '#ffffff',
    hands: '#ffffff',
    feet: '#ffffff',
  },
  hairStyle: 'bald',
  hairColor: '#0f172a',
  clothing: {
    topType: 'none',
    topColor: '#e11d48',
    bottomType: 'none',
    bottomColor: '#1e293b',
    shoesType: 'none',
    shoesColor: '#38bdf8',
    hatType: 'none',
    hatColor: '#f59e0b',
    glassesType: 'none',
    glassesColor: '#020617',
    accessoryType: 'none',
    accessoryColor: '#facc15',
  },
  favoriteColors: ['#ffffff', '#e11d48', '#38bdf8', '#facc15', '#22c55e', '#0f172a'],
  paintTextures: {},
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// --- Suggestions, Promo Codes, Wallet & Notifications ---

export type SuggestionType = 'map' | 'skin';
export type SuggestionStatus = 'received' | 'in_review' | 'approved' | 'rejected';

export interface PlayerSuggestion {
  id: string;
  code: string;
  userId: string;
  authorNickname: string;
  type: SuggestionType;
  title: string;
  description: string;
  status: SuggestionStatus;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PromoRewardType = 'skin' | 'coins' | 'special' | 'future_item';

export interface PromoCodeRecord {
  id: string;
  code: string;
  description: string;
  rewardType: PromoRewardType;
  rewardSkinId: SkinId | null;
  rewardAmount: number;
  rewardMetadata: Record<string, unknown>;
  maxUses: number | null;
  isInfinite: boolean;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromoCodeRedemptionRecord {
  id: string;
  promoCodeId: string;
  code: string;
  userId: string;
  nickname: string;
  rewardType: PromoRewardType;
  rewardSummary: string;
  redeemedAt: string;
}

export interface PlayerWalletStats {
  userId: string;
  totalCoinsCollected: number;
  soloCoinsCollected: number;
  multiplayerCoinsCollected: number;
  promoCoinsCollected: number;
  spentCoins: number;
  updatedAt: string;
}

export interface PlayerNotificationItem {
  id: string;
  userId: string;
  kind: 'suggestion_status' | 'promo' | 'system';
  title: string;
  message: string;
  seen: boolean;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  role: 'player' | 'admin';
  mustChangePassword?: boolean;
  equippedSkin: SkinId;
  unlockedSkins: SkinId[];
  giftedSkins: SkinId[];
  allowedExclusiveSkins?: SkinId[];
  bestNoCoinTimeMs: number;
  bestDistance: number;
  bestScore: number;
  totalMatches: number;
  totalCoins: number;
  favoriteSkin: SkinId;
  skinUsage: Record<string, number>;
  createdAt: string;
  lastSeenAt: string;
  rank?: number | null;
  competitiveStats?: PlayerCompetitiveStats;
  walletStats?: PlayerWalletStats;
  customCharacterConfig?: CustomCharacterConfig;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  skinId: SkinId;
  mapId: MapId;
  noCoinTimeMs: number;
  distance: number;
  achievedAt: string;
}

export interface CoinsLeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  skinId: SkinId;
  totalCoinsCollected: number;
  totalMatches: number;
}

export interface GlobalMessage {
  id: string;
  title: string;
  content: string;
  durationMinutes: number;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

export interface PollOptionResult {
  index: number;
  label: string;
  votes: number;
  percentage: number;
}

export interface PollItem {
  id: string;
  title: string;
  options: PollOptionResult[];
  totalVotes: number;
  active: boolean;
  durationMinutes: number;
  createdAt: string;
  expiresAt: string;
  userVotedIndex: number | null;
}

export interface SkinGiftItem {
  id: string;
  targetUserId: string;
  targetNickname: string;
  skinId: SkinId;
  grantedBy: string;
  createdAt: string;
  seen: boolean;
}

export interface AdminLogItem {
  id: string;
  adminNickname: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  onlineRecently: number;
  totalMatches: number;
  mostUsedSkin: SkinId;
  highestGlobalRecordMs: number;
  highestRecordHolder: string;
  publishedMessagesCount: number;
  pollsCount: number;
  giftsSentCount: number;
}

export interface AdminPlayerRecord {
  id: string;
  nickname: string;
  role: 'player' | 'admin';
  equippedSkin: SkinId;
  unlockedSkins: SkinId[];
  giftedSkins: SkinId[];
  bestNoCoinTimeMs: number;
  bestDistance: number;
  bestScore: number;
  totalMatches: number;
  totalCoins: number;
  favoriteSkin: SkinId;
  createdAt: string;
  lastSeenAt: string;
  giftsHistory: SkinGiftItem[];
}

export interface MatchSummary {
  matchId: string;
  mode: SoloGameMode;
  mapId: MapId;
  skinId: SkinId;
  noCoinTimeMs: number;
  collectedCoin: boolean;
  coins: number;
  distance: number;
  score: number;
  durationMs: number;
  isNewPersonalRecord: boolean;
  globalRank: number | null;
  endReason?: 'police' | 'coin';
}

// --- Multiplayer & X1 Shared Types ---

export type MultiplayerMode = 'coop' | 'x1';

export type RoomStatus =
  | 'waiting_player'
  | 'invite_sent'
  | 'awaiting_confirmation'
  | 'preparing'
  | 'countdown'
  | 'in_progress'
  | 'finished'
  | 'cancelled';

export type ParticipantAnimState = 'idle' | 'run' | 'jump' | 'slide' | 'stumble' | 'crash' | 'jetpack';

export interface MultiplayerInvite {
  id: string;
  roomId: string;
  fromUserId: string;
  fromNickname: string;
  fromSkinId: SkinId;
  toUserId: string;
  toNickname: string;
  mode: MultiplayerMode;
  mapId: MapId;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  createdAt: string;
  respondedAt: string | null;
  expiresAt: string;
}

export interface MultiplayerParticipant {
  id: string;
  roomId: string;
  userId: string;
  nickname: string;
  skinId: SkinId;
  role: 'host' | 'guest';
  ready: boolean;
  connected: boolean;
  lastHeartbeatAt: number;
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
  collectedFirstCoin: boolean;
  finishedAt: number | null;
  hoverboard: boolean;
  jetpack: boolean;
  customConfig?: CustomCharacterConfig;
  updatedAt: string;
}

export interface MultiplayerRoom {
  id: string;
  mode: MultiplayerMode;
  mapId: MapId;
  seed: number;
  hostUserId: string;
  guestUserId: string | null;
  status: RoomStatus;
  countdownStartAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  winnerUserId: string | null;
  loserUserId: string | null;
  resultReason: string | null;
  maxDurationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface X1ResultRecord {
  id: string;
  roomId: string;
  matchId: string;
  winnerUserId: string | null;
  winnerNickname: string | null;
  loserUserId: string | null;
  loserNickname: string | null;
  isDraw: boolean;
  reason: string;
  mapId: MapId;
  winnerDurationMs: number;
  loserDurationMs: number;
  winnerDistance: number;
  loserDistance: number;
  createdAt: string;
}

export interface MultiplayerMatchRecord {
  id: string;
  roomId: string;
  mode: MultiplayerMode;
  mapId: MapId;
  seed: number;
  hostUserId: string;
  hostNickname: string;
  hostSkinId: SkinId;
  guestUserId: string;
  guestNickname: string;
  guestSkinId: SkinId;
  winnerUserId: string | null;
  resultReason: string;
  hostDistance: number;
  hostDurationMs: number;
  hostCoins: number;
  hostScore: number;
  guestDistance: number;
  guestDurationMs: number;
  guestCoins: number;
  guestScore: number;
  createdAt: string;
}

export interface ExclusiveSkinPermissionRecord {
  id: string;
  userId: string;
  skinId: ExclusiveSkinId | SpecialUnlockableSkinId;
  reason: 'admin' | 'top1' | 'top2' | 'top3' | 'promo_code' | 'admin_gift' | 'special_rule';
  rankPosition: number | null;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
  updatedAt: string;
}

export interface PublicPlayerLookup {
  id: string;
  nickname: string;
  equippedSkin: SkinId;
  bestNoCoinTimeMs: number;
  bestDistance: number;
  totalMatches: number;
  rank: number | null;
  onlineRecently: boolean;
  competitiveStats: PlayerCompetitiveStats;
}

export function formatStopwatch(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((safe % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export function formatShortTime(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((safe % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}
