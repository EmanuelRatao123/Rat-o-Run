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

export type LockedExclusiveSkinId =
  | 'homem_aranha'
  | 'jegue'
  | 'capitao_america'
  | 'pele'
  | 'maradona'
  | 'messi'
  | 'neymar_atual'
  | 'hacker'
  | 'bandido'
  | 'ghost_face'
  | 'shrek'
  | 'herobrine'
  | 'freddy_fazbear'
  | 'sonic'
  | 'tung_tung_sahur'
  | 'cristiano_ronaldo'
  | 'enderman'
  | 'deadpool'
  | 'mario'
  | 'luigi'
  | 'gigachad'
  | 'quandale_dingle'
  | 'doge'
  | 'ronaldinho_gaucho'
  | 'vini_jr'
  | 'rato_cosmico'
  | 'bob_esponja'
  | 'patrick'
  | 'lula_molusco';

export type SecretExclusiveSkinId = 'plankton';

export type SkinId =
  | CommonSkinId
  | ExclusiveSkinId
  | SpecialUnlockableSkinId
  | LockedExclusiveSkinId
  | SecretExclusiveSkinId;

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

export const LOCKED_EXCLUSIVE_SKINS: SkinDefinition[] = [
  {
    id: 'homem_aranha',
    name: 'Homem-Aranha',
    subtitle: 'Traje vermelho e azul com teias e olhos brancos',
    primaryColor: '#dc2626',
    accentColor: '#1d4ed8',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'jegue',
    name: 'Jegue',
    subtitle: 'Orelhas compridas, crina rústica e sela nordestina',
    primaryColor: '#78716c',
    accentColor: '#d97706',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'capitao_america',
    name: 'Capitão América',
    subtitle: 'Uniforme tático azul com estrela e escudo vibranium',
    primaryColor: '#1e3a8a',
    accentColor: '#dc2626',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'pele',
    name: 'Pelé',
    subtitle: 'Camisa amarela #10 clássica, meião alto e coroa do Rei',
    primaryColor: '#facc15',
    accentColor: '#16a34a',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'maradona',
    name: 'Maradona',
    subtitle: 'Camisa albiceleste listrada #10, cachos e faixa de capitão',
    primaryColor: '#38bdf8',
    accentColor: '#f8fafc',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'messi',
    name: 'Messi',
    subtitle: 'Uniforme albiceleste moderno #10 com chuteiras douradas',
    primaryColor: '#0ea5e9',
    accentColor: '#facc15',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'neymar_atual',
    name: 'Neymar Atual',
    subtitle: 'Visual atual com faixa, tatuagens nos braços e camisa #10',
    primaryColor: '#f8fafc',
    accentColor: '#0284c7',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'hacker',
    name: 'Hacker',
    subtitle: 'Capuz escuro, máscara neon verde e mochila cyber',
    primaryColor: '#09090b',
    accentColor: '#22c55e',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'bandido',
    name: 'Bandido',
    subtitle: 'Balaclava preta, camisa listrada e saco de loot nas costas',
    primaryColor: '#1e293b',
    accentColor: '#f59e0b',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'ghost_face',
    name: 'Ghost Face',
    subtitle: 'Manto sombrio esvoaçante, capuz e máscara branca icônica',
    primaryColor: '#0f172a',
    accentColor: '#f8fafc',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'shrek',
    name: 'Shrek',
    subtitle: 'Ogro verde do pântano com orelhas tubulares, colete marrom e botas',
    primaryColor: '#65a30d',
    accentColor: '#78350f',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'herobrine',
    name: 'Herobrine',
    subtitle: 'Lenda clássica em blocos com camisa azul-clara e olhos brancos brilhantes',
    primaryColor: '#38bdf8',
    accentColor: '#f8fafc',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'freddy_fazbear',
    name: 'Freddy Fazbear',
    subtitle: 'Urso animatrônico com cartola preta, gravata borboleta e microfone',
    primaryColor: '#7c3f1c',
    accentColor: '#18181b',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'sonic',
    name: 'Sonic',
    subtitle: 'Ouriço azul supersônico com espinhos, luvas brancas e tênis vermelhos',
    primaryColor: '#2563eb',
    accentColor: '#ef4444',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'tung_tung_sahur',
    name: 'Tung Tung Tung Sahur',
    subtitle: 'Boneco cilíndrico de madeira com taco de sahur e corrida hilária',
    primaryColor: '#b45309',
    accentColor: '#fde68a',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'cristiano_ronaldo',
    name: 'Cristiano Ronaldo',
    subtitle: 'Atleta #7 com uniforme vermelho, chuteiras e comemoração de vitória',
    primaryColor: '#dc2626',
    accentColor: '#16a34a',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'enderman',
    name: 'Enderman',
    subtitle: 'Criatura alta e sombria de blocos com olhos roxos brilhantes e partículas',
    primaryColor: '#09090b',
    accentColor: '#c026d3',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'deadpool',
    name: 'Deadpool',
    subtitle: 'Mercenário vermelho e preto com olhos expressivos e katanas nas costas',
    primaryColor: '#dc2626',
    accentColor: '#09090b',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'mario',
    name: 'Mario',
    subtitle: 'Encanador clássico de boné vermelho M, macacão azul e bigode marcante',
    primaryColor: '#dc2626',
    accentColor: '#2563eb',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'luigi',
    name: 'Luigi',
    subtitle: 'Herói esguio de boné verde L, macacão azul e luvas brancas',
    primaryColor: '#16a34a',
    accentColor: '#1d4ed8',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'gigachad',
    name: 'Gigachad',
    subtitle: 'Visual monocromático definido com maxilar quadrado e presença lendária',
    primaryColor: '#64748b',
    accentColor: '#0f172a',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'quandale_dingle',
    name: 'Quandale Dingle',
    subtitle: 'Personagem voxel estilizado e bem-humorado com expressão carismática',
    primaryColor: '#7c2d12',
    accentColor: '#38bdf8',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'doge',
    name: 'Doge',
    subtitle: 'Shiba Inu dourado com orelhas pontudas, focinho fofo e expressão meme',
    primaryColor: '#d97706',
    accentColor: '#fef3c7',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'ronaldinho_gaucho',
    name: 'Ronaldinho Gaúcho',
    subtitle: 'Bruxo dos dribles com cabelos longos, faixa, sorriso e camisa #10',
    primaryColor: '#facc15',
    accentColor: '#16a34a',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'vini_jr',
    name: 'Vini Jr.',
    subtitle: 'Atacante veloz #7 de camisa branca e detalhes dourados com chuteiras modernas',
    primaryColor: '#f8fafc',
    accentColor: '#eab308',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'rato_cosmico',
    name: 'Rato Cósmico',
    subtitle: 'Rato espacial com armadura roxa neon, visor brilhante e aura de estrelas',
    primaryColor: '#7e22ce',
    accentColor: '#22d3ee',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'bob_esponja',
    name: 'Bob Esponja',
    subtitle: 'Esponja amarela quadrada com camisa branca, gravata vermelha e calça marrom',
    primaryColor: '#facc15',
    accentColor: '#dc2626',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'patrick',
    name: 'Patrick Estrela',
    subtitle: 'Estrela-do-mar rosa da Fenda do Biquíni com bermuda verde e flores roxas',
    primaryColor: '#fb7185',
    accentColor: '#4ade80',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
  {
    id: 'lula_molusco',
    name: 'Lula Molusco',
    subtitle: 'Lula azul-turquesa de expressão séria com camisa marrom clássica e clarinete',
    primaryColor: '#5eead4',
    accentColor: '#92400e',
    badgeText: 'EXCLUSIVA',
    isExclusive: true,
    exclusiveRule: 'unlockable',
    unlockConditionText: 'Bloqueada por padrão · Libere pelo Painel Admin ou Código Promocional',
  },
];

export const SECRET_EXCLUSIVE_SKINS: SkinDefinition[] = [
  {
    id: 'plankton',
    name: 'Plankton',
    subtitle: 'Skin secreta do pequeno gênio verde com antena dupla e olho único brilhante',
    primaryColor: '#15803d',
    accentColor: '#ef4444',
    badgeText: 'SECRETA ADMIN',
    isExclusive: true,
    exclusiveRule: 'admin',
    unlockConditionText: 'Skin secreta exclusiva liberada apenas pelo Administrador',
  },
];

export const PUBLIC_CATALOG_SKINS: SkinDefinition[] = [
  ...SKINS,
  ...EXCLUSIVE_SKINS,
  ...SPECIAL_UNLOCKABLE_SKINS,
  ...LOCKED_EXCLUSIVE_SKINS,
];

export const ALL_SKINS: SkinDefinition[] = [
  ...PUBLIC_CATALOG_SKINS,
  ...SECRET_EXCLUSIVE_SKINS,
];
export const COMMON_SKIN_IDS: CommonSkinId[] = SKINS.map((s) => s.id as CommonSkinId);
export const EXCLUSIVE_SKIN_IDS: ExclusiveSkinId[] = EXCLUSIVE_SKINS.map(
  (s) => s.id as ExclusiveSkinId
);
export const SPECIAL_UNLOCKABLE_SKIN_IDS: SpecialUnlockableSkinId[] = SPECIAL_UNLOCKABLE_SKINS.map(
  (s) => s.id as SpecialUnlockableSkinId
);
export const LOCKED_EXCLUSIVE_SKIN_IDS: LockedExclusiveSkinId[] = LOCKED_EXCLUSIVE_SKINS.map(
  (s) => s.id as LockedExclusiveSkinId
);
export const SECRET_EXCLUSIVE_SKIN_IDS: SecretExclusiveSkinId[] = SECRET_EXCLUSIVE_SKINS.map(
  (s) => s.id as SecretExclusiveSkinId
);
export const RESTRICTED_NON_BULK_SKIN_IDS: (ExclusiveSkinId | SecretExclusiveSkinId)[] = [
  ...EXCLUSIVE_SKIN_IDS,
  ...SECRET_EXCLUSIVE_SKIN_IDS,
];
export const BULK_GRANTABLE_RESTRICTED_SKIN_IDS: (
  | SpecialUnlockableSkinId
  | LockedExclusiveSkinId
)[] = [...SPECIAL_UNLOCKABLE_SKIN_IDS, ...LOCKED_EXCLUSIVE_SKIN_IDS];
export const BULK_GRANTABLE_ALL_SKIN_IDS: SkinId[] = [
  ...COMMON_SKIN_IDS,
  ...BULK_GRANTABLE_RESTRICTED_SKIN_IDS,
];
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

export function isLockedExclusiveSkinId(val: unknown): val is LockedExclusiveSkinId {
  return typeof val === 'string' && (LOCKED_EXCLUSIVE_SKIN_IDS as string[]).includes(val);
}

export function isSecretExclusiveSkinId(val: unknown): val is SecretExclusiveSkinId {
  return typeof val === 'string' && (SECRET_EXCLUSIVE_SKIN_IDS as string[]).includes(val);
}

export function isGiftableSkinId(
  val: unknown
): val is CommonSkinId | SpecialUnlockableSkinId | LockedExclusiveSkinId {
  return (
    isCommonSkinId(val) || isSpecialUnlockableSkinId(val) || isLockedExclusiveSkinId(val)
  );
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
  showAdminPanelButton?: boolean;
  equippedSkin: SkinId;
  unlockedSkins: SkinId[];
  giftedSkins: SkinId[];
  allowedExclusiveSkins?: SkinId[];
  bestNoCoinTimeMs: number;
  bestDistance: number;
  bestScore: number;
  bestSingleMatchCoins?: number;
  totalMatches: number;
  totalCoins: number;
  availableCoins?: number;
  favoriteSkin: SkinId;
  skinUsage: Record<string, number>;
  createdAt: string;
  lastSeenAt: string;
  rank?: number | null;
  competitiveStats?: PlayerCompetitiveStats;
  walletStats?: PlayerWalletStats;
  customCharacterConfig?: CustomCharacterConfig;
  capeConfig?: PlayerCapeConfig;
  liveModeConfig?: PlayerLiveModeConfig;
  skateInventory?: PlayerSkateInventoryItem[];
  equippedSkateId?: SkateId | null;
  unreadFriendsMessagesCount?: number;
  pendingFriendRequestsCount?: number;
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
  mapId: MapId;
  bestMatchCoins: number;
  achievedAt: string;
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
  activeExclusivePermissions?: SkinId[];
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

export interface AdminExclusiveSkinOwner {
  id: string;
  userId: string;
  nickname: string;
  skinId: SkinId;
  reason: ExclusiveSkinPermissionRecord['reason'];
  grantedAt: string;
  equipped: boolean;
}

export interface SkinGrantHistoryRecord {
  id: string;
  action: 'grant_all' | 'revoke_bulk';
  adminUserId: string;
  adminNickname: string;
  targetUserId: string;
  targetNickname: string;
  skinsAffected: SkinId[];
  skinsCount: number;
  alreadyOwnedCount: number;
  totalSkinsAfter: number;
  createdAt: string;
}

export interface AdminPlayerSkinsSummary {
  userId: string;
  nickname: string;
  role: 'player' | 'admin';
  equippedSkin: SkinId;
  totalCatalogSkins: number;
  totalGrantableSkins: number;
  totalUnlockedCount: number;
  commonUnlockedCount: number;
  commonTotalCount: number;
  specialUnlockedCount: number;
  specialTotalCount: number;
  bulkGrantedCount: number;
  legitimateSpecialCount: number;
  protectedExclusiveOwned: SkinId[];
  unlockedSkinIds: SkinId[];
  bulkGrantedSkinIds: SkinId[];
  legitimateSpecialSkinIds: SkinId[];
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
  confirmedByServer?: boolean;
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
  capeConfig?: PlayerCapeConfig;
  equippedSkateId?: SkateId | null;
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
  skinId:
    | ExclusiveSkinId
    | SpecialUnlockableSkinId
    | LockedExclusiveSkinId
    | SecretExclusiveSkinId;
  reason:
    | 'admin'
    | 'admin_secret'
    | 'top1'
    | 'top2'
    | 'top3'
    | 'promo_code'
    | 'admin_gift'
    | 'admin_bulk_grant'
    | 'special_rule';
  rankPosition: number | null;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
  updatedAt: string;
}

// --- Capes System ---

export type CapeId = 'none' | 'capa_personalizavel' | 'capa_camisa_10';
export type CapeBackgroundStyle = 'solid' | 'striped' | 'gradient' | 'checkered' | 'stars';

export interface CapeDefinition {
  id: Exclude<CapeId, 'none'>;
  name: string;
  subtitle: string;
  badge: string;
  defaultPrimaryColor: string;
  defaultSecondaryColor: string;
  defaultTextColor: string;
}

export const CAPES_CATALOG: CapeDefinition[] = [
  {
    id: 'capa_personalizavel',
    name: 'CAPA PERSONALIZÁVEL',
    subtitle: 'Escreva qualquer palavra curta nas costas e personalize cores e estampa 3D.',
    badge: 'GRÁTIS',
    defaultPrimaryColor: '#e11d48',
    defaultSecondaryColor: '#0f172a',
    defaultTextColor: '#ffffff',
  },
  {
    id: 'capa_camisa_10',
    name: 'CAPA CAMISA 10',
    subtitle: 'Exiba o lendário número #10 com seu nome ou apelido personalizado nas costas.',
    badge: 'GRÁTIS',
    defaultPrimaryColor: '#facc15',
    defaultSecondaryColor: '#16a34a',
    defaultTextColor: '#0f172a',
  },
];

export interface PlayerCapeConfig {
  equippedCapeId: CapeId;
  customText: string;
  shirt10Name: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  backgroundStyle: CapeBackgroundStyle;
  updatedAt: string;
}

export const DEFAULT_PLAYER_CAPE_CONFIG: PlayerCapeConfig = {
  equippedCapeId: 'none',
  customText: 'RATÃO',
  shirt10Name: 'CRAQUE',
  primaryColor: '#e11d48',
  secondaryColor: '#0f172a',
  textColor: '#ffffff',
  backgroundStyle: 'gradient',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// --- Live Mode Overlay ---

export type LiveOverlayPosition =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center_left'
  | 'center_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right';

export type LiveOverlayFontFamily = 'display' | 'sans' | 'mono';

export interface LiveOverlayText {
  id: string;
  text: string;
  color: string;
  fontSize: number;
  position: LiveOverlayPosition;
  fontFamily: LiveOverlayFontFamily;
  shadow: boolean;
  durationSec: number;
  enabled: boolean;
}

export interface PlayerLiveModeConfig {
  enabled: boolean;
  texts: LiveOverlayText[];
  updatedAt: string;
}

export const DEFAULT_LIVE_MODE_CONFIG: PlayerLiveModeConfig = {
  enabled: false,
  texts: [
    {
      id: 'live_default_1',
      text: 'AO VIVO NO RATÃO RUN 3D!',
      color: '#facc15',
      fontSize: 22,
      position: 'top_center',
      fontFamily: 'display',
      shadow: true,
      durationSec: 6,
      enabled: true,
    },
  ],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// --- Shop & Skates System ---

export type SkateId =
  | 'skate_classico'
  | 'skate_fogo'
  | 'skate_eletrico'
  | 'skate_galactico'
  | 'skate_dourado'
  | 'skate_camuflado';

export interface SkateDefinition {
  id: SkateId;
  name: string;
  description: string;
  price: number;
  primaryColor: string;
  accentColor: string;
  wheelColor: string;
  effectColor: string;
  badge: string;
}

export const SKATES_CATALOG: SkateDefinition[] = [
  {
    id: 'skate_classico',
    name: 'Skate Clássico',
    description: 'Prancha de rua resistente que absorve 1 batida fatal na corrida.',
    price: 120,
    primaryColor: '#e11d48',
    accentColor: '#f8fafc',
    wheelColor: '#facc15',
    effectColor: '#fb7185',
    badge: 'URBANO',
  },
  {
    id: 'skate_fogo',
    name: 'Skate Fogo',
    description: 'Shape flamejante com rastros incandescentes e proteção contra colisão.',
    price: 250,
    primaryColor: '#dc2626',
    accentColor: '#f97316',
    wheelColor: '#fef08a',
    effectColor: '#fb923c',
    badge: 'INFERNO',
  },
  {
    id: 'skate_eletrico',
    name: 'Skate Elétrico',
    description: 'Neon azul de alta voltagem para absorver impactos e manter o ritmo.',
    price: 380,
    primaryColor: '#0284c7',
    accentColor: '#22d3ee',
    wheelColor: '#a5f3fc',
    effectColor: '#38bdf8',
    badge: 'NEON',
  },
  {
    id: 'skate_camuflado',
    name: 'Skate Camuflado',
    description: 'Design tático florestal reforçado para trilhas intensas.',
    price: 480,
    primaryColor: '#3f6212',
    accentColor: '#a3e635',
    wheelColor: '#1e293b',
    effectColor: '#84cc16',
    badge: 'TÁTICO',
  },
  {
    id: 'skate_galactico',
    name: 'Skate Galáctico',
    description: 'Shape cósmico roxo-estelar com energia espacial protetora.',
    price: 650,
    primaryColor: '#6d28d9',
    accentColor: '#e879f9',
    wheelColor: '#38bdf8',
    effectColor: '#c084fc',
    badge: 'CÓSMICO',
  },
  {
    id: 'skate_dourado',
    name: 'Skate Dourado',
    description: 'Edição de luxo em ouro maciço com brilho real e proteção suprema.',
    price: 900,
    primaryColor: '#eab308',
    accentColor: '#fef08a',
    wheelColor: '#ffffff',
    effectColor: '#facc15',
    badge: 'LENDÁRIO',
  },
];

export const SKATE_IDS: SkateId[] = SKATES_CATALOG.map((s) => s.id);

export function isValidSkateId(val: unknown): val is SkateId {
  return typeof val === 'string' && (SKATE_IDS as string[]).includes(val);
}

export function getSkateDefinition(skateId: SkateId): SkateDefinition {
  return SKATES_CATALOG.find((s) => s.id === skateId) || SKATES_CATALOG[0];
}

export interface PlayerSkateInventoryItem {
  skateId: SkateId;
  charges: number;
  unlockedAt: string;
  updatedAt: string;
}

// --- Friends & Private Chat System ---

export type PlayerOnlineStatus = 'online' | 'in_match' | 'offline';

export interface FriendEntry {
  friendshipId: string;
  userId: string;
  nickname: string;
  equippedSkin: SkinId;
  status: PlayerOnlineStatus;
  inCall?: boolean;
  unreadCount: number;
  lastSeenAt: string;
  since: string;
}

export interface FriendRequestEntry {
  id: string;
  userId: string;
  nickname: string;
  equippedSkin: SkinId;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface FriendPrivateMessage {
  id: string;
  friendshipId: string;
  senderUserId: string;
  receiverUserId: string;
  content: string;
  read: boolean;
  createdAt: string;
}

export interface FriendSearchResult {
  id: string;
  nickname: string;
  equippedSkin: SkinId;
  status: PlayerOnlineStatus;
  inCall?: boolean;
  relation: 'none' | 'friend' | 'pending_incoming' | 'pending_outgoing';
}

export interface FriendsOverviewPayload {
  friends: FriendEntry[];
  incomingRequests: FriendRequestEntry[];
  outgoingRequests: FriendRequestEntry[];
  totalUnreadMessages: number;
  pendingRequestsCount: number;
}

// --- Voice Call System (WebRTC + Serverless Signaling) ---

export type VoiceCallStatus = 'ringing' | 'accepted' | 'ended' | 'declined' | 'missed';
export type VoiceCallSignalType = 'offer' | 'answer' | 'ice' | 'renegotiate';

export interface VoiceCallIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface VoiceCallIceConfig {
  iceServers: VoiceCallIceServerConfig[];
  inviteTimeoutSec: number;
  hasTurn: boolean;
}

export interface VoiceCallRecord {
  id: string;
  callerUserId: string;
  callerNickname: string;
  calleeUserId: string;
  calleeNickname: string;
  status: VoiceCallStatus;
  endReason?: string | null;
  createdAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  expiresAt: string;
  callerHeartbeatAt: string;
  calleeHeartbeatAt?: string | null;
}

export interface VoiceCallSignal {
  id: string;
  seq: number;
  callId: string;
  fromUserId: string;
  toUserId: string;
  type: VoiceCallSignalType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface VoiceCallStatePayload {
  serverNow: string;
  activeCall: VoiceCallRecord | null;
  incomingInvite: VoiceCallRecord | null;
  recentTerminalCall: VoiceCallRecord | null;
  signals: VoiceCallSignal[];
  inCallFriendIds: string[];
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

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export type SecurityEventCategory =
  | 'auth'
  | 'csrf'
  | 'rate_limit'
  | 'admin_access'
  | 'match_integrity'
  | 'multiplayer_integrity'
  | 'economy_skate'
  | 'social_idor'
  | 'input_validation';

export interface SecurityAuditLogItem {
  id: string;
  eventType: string;
  category: SecurityEventCategory;
  severity: SecuritySeverity;
  ip: string;
  userId?: string | null;
  nickname?: string | null;
  route?: string | null;
  details: string;
  createdAt: string;
}

export interface AdminSecuritySummary {
  totalEvents: number;
  criticalCount: number;
  highCount: number;
  last24hCount: number;
  blockedAttemptsCount: number;
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
