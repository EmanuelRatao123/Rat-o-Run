export type SkinId =
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

export type MapId = 'brasil' | 'tokyo' | 'futebol' | 'capivara';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type PowerUpType = 'magnet' | 'jetpack' | 'super_jump' | 'multiplier' | 'hoverboard';

export interface SkinDefinition {
  id: SkinId;
  name: string;
  subtitle: string;
  primaryColor: string;
  accentColor: string;
  badgeText: string;
  prototypeNote?: string;
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

export const ALL_SKIN_IDS: SkinId[] = SKINS.map((s) => s.id);

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

export interface UserProfile {
  id: string;
  nickname: string;
  role: 'player' | 'admin';
  mustChangePassword?: boolean;
  equippedSkin: SkinId;
  unlockedSkins: SkinId[];
  giftedSkins: SkinId[];
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
