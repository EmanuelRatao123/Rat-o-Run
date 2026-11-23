import {
  Bell,
  BellRing,
  ChevronDown,
  ChevronUp,
  Coins,
  Gift,
  Lightbulb,
  LogOut,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Monitor,
  Play,
  ShieldAlert,
  Sliders,
  Smartphone,
  Sparkles,
  Swords,
  Ticket,
  Timer,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminPortalModal } from './components/AdminPortalModal.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { CharacterCustomizerModal } from './components/CharacterCustomizerModal.tsx';
import { GameView, MultiplayerSessionConfig } from './components/GameView.tsx';
import { GlobalBroadcastOverlay } from './components/GlobalBroadcastOverlay.tsx';
import { LeaderboardModal } from './components/LeaderboardModal.tsx';
import { LivePollOverlay } from './components/LivePollOverlay.tsx';
import { MapsModal } from './components/MapsModal.tsx';
import { MultiplayerModal } from './components/MultiplayerModal.tsx';
import { ProfileModal } from './components/ProfileModal.tsx';
import { PromoCodeModal } from './components/PromoCodeModal.tsx';
import { RataoLogo } from './components/RataoLogo.tsx';
import { ScenePreview3D } from './components/ScenePreview3D.tsx';
import { SkinsModal } from './components/SkinsModal.tsx';
import { SuggestionsModal } from './components/SuggestionsModal.tsx';
import { gameAudio } from './game/audio.ts';
import { useFullscreen, useMobileMode } from './hooks/useDeviceDisplay.ts';
import { api, setMemorySessionToken } from './services/api.ts';
import {
  GlobalMessage,
  GraphicsQuality,
  MAPS,
  MapId,
  MultiplayerInvite,
  MultiplayerMode,
  MultiplayerParticipant,
  MultiplayerRoom,
  PlayerNotificationItem,
  PollItem,
  SkinGiftItem,
  SoloGameMode,
  UserProfile,
  formatStopwatch,
  getSkinDefinition,
} from './shared/constants.ts';
import {
  createF8DoubleTapDetector,
  useDevToolsProtection,
} from './utils/devtoolsGuard.ts';

type ActiveModal =
  | null
  | 'play'
  | 'skins'
  | 'customizer'
  | 'maps'
  | 'ranking'
  | 'promo'
  | 'suggestions'
  | 'profile'
  | 'multiplayer';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bootChecking, setBootChecking] = useState(true);
  const [playing, setPlaying] = useState(false);

  const [selectedMap, setSelectedMap] = useState<MapId>('brasil');
  const [soloMode, setSoloMode] = useState<SoloGameMode>('no_coin');
  const [quality, setQuality] = useState<GraphicsQuality>('medium');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [multiplayerMode, setMultiplayerMode] = useState<MultiplayerMode>('coop');
  const [mpLobbyRoom, setMpLobbyRoom] = useState<{
    room: MultiplayerRoom;
    participants: MultiplayerParticipant[];
  } | null>(null);
  const [activeMpSession, setActiveMpSession] = useState<MultiplayerSessionConfig | null>(null);
  const [pendingInvites, setPendingInvites] = useState<MultiplayerInvite[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);

  const [inspectNickname, setInspectNickname] = useState<string | undefined>(undefined);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const { mobileMode, toggleMobileMode } = useMobileMode();
  const { isFullscreen, fullscreenNotice, clearFullscreenNotice, toggleFullscreen } =
    useFullscreen();

  // Social sync state (periodic polling compatible with serverless)
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [unseenGifts, setUnseenGifts] = useState<SkinGiftItem[]>([]);
  const [notifications, setNotifications] = useState<PlayerNotificationItem[]>([]);

  // Secret admin portal trigger (double-tap F8 within 1s, Ctrl+Shift+A, or #admin)
  const [showSecretAdmin, setShowSecretAdmin] = useState(false);
  const [adminEntryMode, setAdminEntryMode] = useState<'f8' | 'classic'>('f8');
  const f8DetectorRef = useRef(createF8DoubleTapDetector(1000));

  // Discreet non-blocking inspection deterrent toast
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const securityToastTimerRef = useRef<number | null>(null);

  const handleInspectionNotice = useCallback((msg: string) => {
    setSecurityToast(msg);
    if (securityToastTimerRef.current) {
      window.clearTimeout(securityToastTimerRef.current);
    }
    securityToastTimerRef.current = window.setTimeout(() => {
      setSecurityToast(null);
    }, 2400);
  }, []);

  useDevToolsProtection(handleInspectionNotice);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  const refreshSocialFeed = useCallback(async () => {
    try {
      const feed = await api.getSocialFeed();
      setMessages(feed.messages);
      setPolls(feed.polls);
      setUnseenGifts(feed.unseenGifts);
      setNotifications(feed.notifications || []);
    } catch {
      // Ignore transient polling errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setBootChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Secret triggers: double F8 (<= 1000ms), Ctrl+Shift+A, or #admin hash
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === '#admin' || window.location.pathname === '/admin') {
        setAdminEntryMode('classic');
        setShowSecretAdmin(true);
      }
    };
    checkHash();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F8' || e.key === 'F8') {
        e.preventDefault();
        if (e.repeat) return;
        if (f8DetectorRef.current.registerPress(Date.now())) {
          setAdminEntryMode('f8');
          setShowSecretAdmin(true);
        }
        return;
      }

      if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        setAdminEntryMode('classic');
        setShowSecretAdmin((v) => !v);
      }
    };

    window.addEventListener('hashchange', checkHash);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', checkHash);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const refreshMultiplayerOverview = useCallback(async () => {
    try {
      const ov = await api.multiplayer.overview();
      setPendingInvites(ov.incomingInvites);
      if (
        ov.activeRoom &&
        (ov.activeRoom.room.status === 'countdown' ||
          ov.activeRoom.room.status === 'in_progress')
      ) {
        setActiveMpSession({
          room: ov.activeRoom.room,
          participants: ov.activeRoom.participants,
          serverNow: ov.activeRoom.serverNow,
        });
        setActiveModal(null);
        setPlaying(true);
      }
    } catch {
      // Ignore transient polling errors
    }
  }, []);

  // Periodic server polling every 8 seconds for messages, polls & skin gifts
  useEffect(() => {
    if (!user) return;
    void refreshSocialFeed();
    const timer = window.setInterval(() => {
      void refreshSocialFeed();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [user, refreshSocialFeed]);

  // Live polling every 3 seconds for multiplayer invites & active room reconnect
  useEffect(() => {
    if (!user || playing) return;
    void refreshMultiplayerOverview();
    const timer = window.setInterval(() => {
      void refreshMultiplayerOverview();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [user, playing, refreshMultiplayerOverview]);

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setMemorySessionToken(null);
    setUser(null);
    setPlaying(false);
    setActiveMpSession(null);
    setMpLobbyRoom(null);
    setPendingInvites([]);
    setActiveModal(null);
  };

  const handleDismissGifts = async () => {
    setUnseenGifts([]);
    await api.markGiftsSeen().catch(() => {});
    await refreshUser();
  };

  const handleDismissNotifications = async () => {
    setNotifications([]);
    await api.markNotificationsSeen().catch(() => {});
  };

  const handleStartSoloMode = (mode: SoloGameMode) => {
    gameAudio.unlock();
    gameAudio.playUiClick();
    setSoloMode(mode);
    setActiveMpSession(null);
    setActiveModal(null);
    setPlaying(true);
  };

  const handleRespondBannerInvite = async (
    invite: MultiplayerInvite,
    action: 'accept' | 'decline'
  ) => {
    gameAudio.unlock();
    setInviteBusy(true);
    try {
      const res = await api.multiplayer.respondInvite(invite.id, action);
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (action === 'accept' && res.room && res.participants) {
        setMultiplayerMode(res.room.mode);
        setMpLobbyRoom({ room: res.room, participants: res.participants });
        setActiveModal('multiplayer');
      }
    } catch {
      void refreshMultiplayerOverview();
    } finally {
      setInviteBusy(false);
    }
  };

  const closeAdminPortal = () => {
    setShowSecretAdmin(false);
    if (window.location.hash === '#admin') {
      window.history.replaceState(null, '', '/');
    }
  };

  if (bootChecking) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center gap-4">
        <RataoLogo />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Carregando motor 3D...
        </p>
      </div>
    );
  }

  const equippedSkinDef = getSkinDefinition(user ? user.equippedSkin : 'ratao');
  const currentMapDef = MAPS.find((m) => m.id === selectedMap) || MAPS[0];
  const accumulatedCoins = user
    ? user.walletStats?.totalCoinsCollected ?? user.totalCoins
    : 0;
  const meuRataoUnlocked = user
    ? user.unlockedSkins.includes('meu_ratao') ||
      Boolean(user.allowedExclusiveSkins?.includes('meu_ratao'))
    : false;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {!user ? (
        <AuthScreen
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onAuthenticated={(u) => {
            setUser(u);
          }}
        />
      ) : playing ? (
        <GameView
          user={user}
          mapId={activeMpSession ? activeMpSession.room.mapId : selectedMap}
          skinId={user.equippedSkin}
          quality={quality}
          soloMode={soloMode}
          mobileMode={mobileMode}
          isFullscreen={isFullscreen}
          onToggleMobileMode={() => {
            gameAudio.playUiClick();
            toggleMobileMode();
          }}
          onToggleFullscreen={() => {
            gameAudio.playUiClick();
            void toggleFullscreen();
          }}
          multiplayerSession={activeMpSession}
          onExitToMenu={() => {
            setPlaying(false);
            setActiveMpSession(null);
            setMpLobbyRoom(null);
            void refreshUser();
            void refreshSocialFeed();
            void refreshMultiplayerOverview();
          }}
        />
      ) : (
        <div className="relative w-full h-full overflow-hidden bg-slate-950">
          {/* Live 3D Character + Map Showcase */}
          <div className="absolute inset-0">
            <ScenePreview3D
              skinId={user.equippedSkin}
              mapId={selectedMap}
              quality={quality}
              mode="showcase"
              customConfig={user.customCharacterConfig}
            />
          </div>

          {/* Perimeter HUD Shell (zero backdrop-filter over WebGL, unobstructed center) */}
          <div className="relative z-10 w-full h-full pointer-events-none flex flex-col justify-between safe-area-hud p-3 sm:p-6">
            {/* Top Bar */}
            <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
              {/* Top-Left: Logo + Player Personal Record + Total Coins Collected */}
              <div className="pointer-events-auto flex flex-col gap-2">
                <RataoLogo compact />
                {mobileMode ? (
                  <div className="bg-slate-950/90 border border-slate-700/80 rounded-xl px-3 py-1.5 flex items-center gap-3 shadow-lg">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {user.nickname}
                      </div>
                      <div className="font-mono-num font-extrabold text-xs text-amber-300 flex items-center gap-1 whitespace-nowrap">
                        <Timer className="w-3 h-3 text-amber-400 shrink-0" />
                        {formatStopwatch(user.bestNoCoinTimeMs)}
                      </div>
                    </div>
                    <div className="h-6 w-px bg-slate-800 shrink-0" />
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                        <Coins className="w-3 h-3 shrink-0" /> MOEDAS
                      </div>
                      <div className="font-mono-num font-extrabold text-xs text-white whitespace-nowrap">
                        {accumulatedCoins.toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950/90 border border-slate-700/80 rounded-xl px-3.5 py-2 flex flex-wrap items-center gap-3.5 sm:gap-4 shadow-lg">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        JOGADOR
                      </div>
                      <div className="font-display font-bold text-sm sm:text-base text-white">
                        {user.nickname}
                      </div>
                    </div>
                    <div className="h-7 w-px bg-slate-800" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <Timer className="w-3 h-3" /> RECORDE SEM MOEDAS
                      </div>
                      <div className="font-mono-num font-extrabold text-sm sm:text-base text-amber-300">
                        {formatStopwatch(user.bestNoCoinTimeMs)}
                      </div>
                    </div>
                    <div className="h-7 w-px bg-slate-800" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                        <Coins className="w-3 h-3" /> MOEDAS TOTAIS COLETADAS
                      </div>
                      <div className="font-mono-num font-extrabold text-sm sm:text-base text-white">
                        {accumulatedCoins.toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden" />

              {/* Top-Right: Map, Profile, Mobile Mode, Fullscreen, Quality & Logout */}
              <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    gameAudio.playUiClick();
                    setActiveModal('maps');
                  }}
                  title="Escolher Mapa"
                  className="min-w-[44px] min-h-[44px] bg-slate-950/90 border border-slate-700/80 hover:border-emerald-400/70 rounded-xl px-2.5 sm:px-3 py-2 text-left cursor-pointer transition flex items-center justify-center gap-2"
                >
                  <MapIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="hidden sm:flex flex-col leading-tight">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      {equippedSkinDef.name} · {currentMapDef.name}
                    </span>
                    <span className="text-xs font-bold text-emerald-400">
                      {user.rank ? `Ranking #${user.rank}` : `${user.totalMatches} partidas`}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    gameAudio.playUiClick();
                    setInspectNickname(user.nickname);
                    setActiveModal('profile');
                  }}
                  title="Meu Perfil"
                  className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold"
                >
                  <User className="w-4 h-4 text-rose-400" />
                  <span className="hidden md:inline whitespace-nowrap">PERFIL</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    gameAudio.playUiClick();
                    toggleMobileMode();
                  }}
                  title={mobileMode ? 'Alternar para Modo PC' : 'Ativar Modo Mobile'}
                  aria-label={mobileMode ? 'Modo Mobile ativo' : 'Ativar Modo Mobile'}
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold transition ${
                    mobileMode
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-950/90 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {mobileMode ? (
                    <Smartphone className="w-4 h-4 text-sky-300" />
                  ) : (
                    <Monitor className="w-4 h-4 text-slate-300" />
                  )}
                  <span className="hidden xl:inline whitespace-nowrap">
                    {mobileMode ? 'MOBILE' : 'PC'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    gameAudio.playUiClick();
                    void toggleFullscreen();
                  }}
                  title={isFullscreen ? 'Sair da tela cheia' : 'Colocar em tela cheia'}
                  aria-label={isFullscreen ? 'Sair da tela cheia' : 'Colocar em tela cheia'}
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold transition ${
                    isFullscreen
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-950/90 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4 text-amber-300" />
                  ) : (
                    <Maximize2 className="w-4 h-4 text-amber-300" />
                  )}
                  <span className="hidden lg:inline whitespace-nowrap">
                    {isFullscreen ? 'SAIR TELA CHEIA' : 'TELA CHEIA'}
                  </span>
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowQualityMenu((v) => !v)}
                    title="Qualidade gráfica"
                    className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold"
                  >
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <span className="hidden sm:inline uppercase whitespace-nowrap">
                      {quality === 'low' ? 'Baixo' : quality === 'medium' ? 'Médio' : 'Alto'}
                    </span>
                  </button>
                  {showQualityMenu && (
                    <div className="absolute right-0 mt-1.5 w-36 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-2xl z-30">
                      {(
                        [
                          { id: 'low', label: 'Baixo (Leve)' },
                          { id: 'medium', label: 'Médio' },
                          { id: 'high', label: 'Alto (Sombras)' },
                        ] as const
                      ).map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            setQuality(q.id);
                            setShowQualityMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                            quality === q.id
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sair da conta"
                  className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-rose-300 hover:bg-rose-950 cursor-pointer flex items-center justify-center"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bottom Collapsible Control Dock */}
            <div className="flex flex-col items-center pointer-events-none">
              <button
                type="button"
                onClick={() => setDockCollapsed((v) => !v)}
                className="pointer-events-auto mb-1.5 px-3 py-1.5 rounded-t-xl bg-slate-950/90 border border-b-0 border-slate-700 text-[11px] font-bold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" /> Mostrar Menu
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" /> Ocultar Menu
                  </>
                )}
              </button>

              {!dockCollapsed &&
                (mobileMode ? (
                  <div className="pointer-events-auto w-full max-w-md bg-slate-950/95 border border-slate-700/90 rounded-2xl p-2.5 shadow-2xl space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        gameAudio.unlock();
                        gameAudio.playUiClick();
                        setActiveModal('play');
                      }}
                      className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold text-lg tracking-wide shadow-lg shadow-rose-900/50 flex items-center justify-center gap-2 cursor-pointer transition transform active:scale-95"
                    >
                      <Play className="w-5 h-5 fill-current" /> JOGAR
                    </button>

                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          gameAudio.playUiClick();
                          setActiveModal('skins');
                        }}
                        className="min-h-[52px] px-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-[10px] flex flex-col items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>SKINS</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          gameAudio.playUiClick();
                          setActiveModal('ranking');
                        }}
                        className="min-h-[52px] px-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-[10px] flex flex-col items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span>RANKING</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          gameAudio.playUiClick();
                          setActiveModal('promo');
                        }}
                        className="min-h-[52px] px-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/50 text-emerald-200 font-bold text-[10px] flex flex-col items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Ticket className="w-4 h-4 text-emerald-400" />
                        <span>CÓDIGO</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          gameAudio.playUiClick();
                          setActiveModal('suggestions');
                        }}
                        className="min-h-[52px] px-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-[10px] flex flex-col items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Lightbulb className="w-4 h-4 text-amber-300" />
                        <span>IDEIAS</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pointer-events-auto w-full max-w-4xl bg-slate-950/95 border border-slate-700/90 rounded-2xl p-2.5 sm:p-3 shadow-2xl flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        gameAudio.unlock();
                        gameAudio.playUiClick();
                        setActiveModal('play');
                      }}
                      className="px-7 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold text-base sm:text-lg tracking-wide shadow-lg shadow-rose-900/50 flex items-center gap-2 cursor-pointer transition transform active:scale-95"
                    >
                      <Play className="w-5 h-5 fill-current" /> JOGAR
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        gameAudio.playUiClick();
                        setActiveModal('skins');
                      }}
                      className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" /> SKINS
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        gameAudio.playUiClick();
                        setActiveModal('ranking');
                      }}
                      className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" /> RANKING
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        gameAudio.playUiClick();
                        setActiveModal('promo');
                      }}
                      className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/50 text-emerald-200 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Ticket className="w-4 h-4 text-emerald-400" /> RESGATAR CÓDIGO
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        gameAudio.playUiClick();
                        setActiveModal('suggestions');
                      }}
                      className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lightbulb className="w-4 h-4 text-amber-300" /> ENVIAR SUGESTÃO
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {/* Unread Notification Toast (Suggestions Reviewed / System Notices) */}
          {notifications.length > 0 && pendingInvites.length === 0 && activeModal === null && (
            <div className="fixed top-20 right-4 z-30 w-80 max-w-[calc(100vw-2rem)] bg-slate-950/95 border-2 border-emerald-400 rounded-2xl p-4 shadow-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                <Bell className="w-4 h-4" /> {notifications[0].title}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{notifications[0].message}</p>
              <button
                type="button"
                onClick={() => void handleDismissNotifications()}
                className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs cursor-pointer"
              >
                OK · CIENTE ({notifications.length})
              </button>
            </div>
          )}

          {/* Live On-Screen Multiplayer Invite Notification */}
          {pendingInvites.length > 0 && activeModal !== 'multiplayer' && (
            <div className="fixed top-20 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-slate-950/95 border-2 border-amber-400 rounded-2xl p-4 shadow-2xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-300">
                <BellRing className="w-4 h-4 animate-bounce" /> CONVITE MULTIPLAYER
              </div>
              <div className="text-xs text-slate-200 leading-relaxed">
                <strong className="text-white">{pendingInvites[0].fromNickname}</strong> convidou você para{' '}
                <strong className="text-amber-300">
                  {pendingInvites[0].mode === 'x1'
                    ? 'X1 Sem Moedas'
                    : 'Jogar com Amigo'}
                </strong>{' '}
                no mapa{' '}
                <strong>
                  {MAPS.find((m) => m.id === pendingInvites[0].mapId)?.name || pendingInvites[0].mapId}
                </strong>
                .
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => void handleRespondBannerInvite(pendingInvites[0], 'accept')}
                  className="py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs cursor-pointer"
                >
                  ACEITAR
                </button>
                <button
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => void handleRespondBannerInvite(pendingInvites[0], 'decline')}
                  className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold text-xs cursor-pointer"
                >
                  RECUSAR
                </button>
              </div>
            </div>
          )}

          {/* Unseen Skin Gift Notification Modal */}
          {unseenGifts.length > 0 && (
            <div className="fixed inset-0 z-40 bg-slate-950/85 flex items-center justify-center p-4">
              <div className="w-full max-w-sm bg-slate-900 border-2 border-fuchsia-400 rounded-2xl p-6 text-center shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-fuchsia-500/20 border border-fuchsia-400 text-fuchsia-300 flex items-center justify-center mx-auto mb-3">
                  <Gift className="w-7 h-7" />
                </div>
                <h3 className="font-display text-2xl font-bold text-white mb-1">
                  VOCÊ RECEBEU UM PRESENTE!
                </h3>
                <p className="text-xs text-slate-300 mb-4">
                  Nova skin registrada na sua conta:
                </p>
                <div className="space-y-2 mb-5">
                  {unseenGifts.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-xl bg-slate-950 border border-fuchsia-500/40 text-sm font-bold text-fuchsia-200"
                    >
                      {getSkinDefinition(g.skinId).name}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleDismissGifts}
                  className="w-full py-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-display font-bold text-sm cursor-pointer"
                >
                  RECEBER E CONTINUAR
                </button>
              </div>
            </div>
          )}

          {/* Play Mode Chooser Modal */}
          {activeModal === 'play' && (
            <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-3 sm:p-4">
              <div className="w-full max-w-2xl max-h-[90dvh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                  <div>
                    <h2 className="font-display text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                      <Play className="w-5 h-5 text-amber-400 fill-current" /> ESCOLHER MODO DE JOGO
                    </h2>
                    <p className="text-xs text-slate-400">
                      Mapa selecionado: <strong className="text-emerald-400">{currentMapDef.name}</strong> · Skin:{' '}
                      <strong className="text-white">{equippedSkinDef.name}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveModal('maps')}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <MapIcon className="w-3.5 h-3.5" /> Trocar Mapa
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer flex items-center justify-center"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => handleStartSoloMode('normal')}
                    className="text-left p-4 rounded-2xl bg-gradient-to-br from-emerald-950/80 to-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex items-center justify-center">
                        <Coins className="w-5 h-5" />
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase">
                        SOLO · MOEDAS
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white group-hover:text-emerald-300">
                      MODO NORMAL
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Colete moedas livremente para somar na sua conta e disputar o Ranking de Moedas. Sem cronômetro No Coin.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartSoloMode('no_coin')}
                    className="text-left p-4 rounded-2xl bg-gradient-to-br from-amber-950/80 to-slate-950 border-2 border-amber-500/60 hover:border-amber-400 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 flex items-center justify-center">
                        <Timer className="w-5 h-5" />
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-extrabold uppercase">
                        SOLO · DESAFIO
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white group-hover:text-amber-300">
                      MODO NO COIN
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Sobreviva o máximo possível sem tocar em nenhuma moeda! Pegar 1 moeda encerra a tentativa na hora.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gameAudio.unlock();
                      gameAudio.playUiClick();
                      setMultiplayerMode('coop');
                      setActiveModal('multiplayer');
                    }}
                    className="text-left p-4 rounded-2xl bg-gradient-to-br from-sky-950/80 to-slate-950 border border-sky-500/50 hover:border-sky-400 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/50 text-sky-300 flex items-center justify-center">
                        <Users className="w-5 h-5" />
                      </span>
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-extrabold uppercase">
                        MULTIPLAYER
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white group-hover:text-sky-300">
                      JOGAR COM AMIGO
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Corra lado a lado na mesma pista 3D com um amigo em tempo real.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gameAudio.unlock();
                      gameAudio.playUiClick();
                      setMultiplayerMode('x1');
                      setActiveModal('multiplayer');
                    }}
                    className="text-left p-4 rounded-2xl bg-gradient-to-br from-rose-950/80 to-slate-950 border border-rose-500/50 hover:border-rose-400 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-300 flex items-center justify-center">
                        <Swords className="w-5 h-5" />
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-extrabold uppercase">
                        DUELO 1v1
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white group-hover:text-rose-300">
                      X1 SEM MOEDAS
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Duelo direto: quem pegar uma moeda primeiro ou bater perde!
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Feature Modals */}
          {activeModal === 'skins' && (
            <SkinsModal
              user={user}
              selectedMap={selectedMap}
              quality={quality}
              onEquipped={(skinId) => setUser({ ...user, equippedSkin: skinId })}
              onOpenCustomizer={() => setActiveModal('customizer')}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'customizer' && (
            <CharacterCustomizerModal
              mapId={selectedMap}
              unlocked={meuRataoUnlocked}
              equippedSkin={user.equippedSkin}
              initialConfig={user.customCharacterConfig}
              onClose={() => setActiveModal('skins')}
              onSaved={(cfg) => {
                setUser((prev) => (prev ? { ...prev, customCharacterConfig: cfg } : prev));
              }}
              onEquipped={() => {
                void refreshUser();
              }}
            />
          )}

          {activeModal === 'maps' && (
            <MapsModal
              selectedMap={selectedMap}
              quality={quality}
              onSelectMap={(m) => setSelectedMap(m)}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'ranking' && (
            <LeaderboardModal
              currentUser={user}
              onInspectPlayer={(nick) => {
                setInspectNickname(nick);
                setActiveModal('profile');
              }}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'promo' && (
            <PromoCodeModal
              onClose={() => setActiveModal(null)}
              onRedeemed={() => {
                void refreshUser();
                void refreshSocialFeed();
              }}
            />
          )}

          {activeModal === 'suggestions' && (
            <SuggestionsModal onClose={() => setActiveModal(null)} />
          )}

          {activeModal === 'profile' && (
            <ProfileModal
              currentUser={user}
              initialNickname={inspectNickname}
              onClose={() => setActiveModal(null)}
            />
          )}

          {activeModal === 'multiplayer' && (
            <MultiplayerModal
              currentUser={user}
              initialMode={multiplayerMode}
              selectedMap={selectedMap}
              initialRoom={mpLobbyRoom}
              onEnterMatch={(room, participants) => {
                gameAudio.unlock();
                setActiveMpSession({ room, participants });
                setActiveModal(null);
                setPlaying(true);
              }}
              onClose={() => {
                setMpLobbyRoom(null);
                setActiveModal(null);
                void refreshMultiplayerOverview();
              }}
            />
          )}
        </div>
      )}

      {/* Automatic Centered 3s Global Broadcast & In-Match/Menu Live Poll Overlays */}
      {user && (
        <>
          <GlobalBroadcastOverlay messages={messages} />
          <LivePollOverlay polls={polls} onPollsUpdated={setPolls} />
        </>
      )}

      {/* Discreet DevTools / Context-Menu Notice Toast (non-blocking) */}
      {securityToast && (
        <div className="fixed bottom-4 right-4 z-[60] pointer-events-none px-3.5 py-2 rounded-xl bg-slate-900/95 border border-amber-500/60 text-amber-200 text-xs font-semibold flex items-center gap-2 shadow-xl">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{securityToast}</span>
        </div>
      )}

      {/* Discreet Fullscreen Fallback Notice */}
      {fullscreenNotice && (
        <div className="fixed bottom-4 left-4 z-[60] max-w-xs px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-sky-500/60 text-sky-200 text-xs font-semibold flex items-center gap-2 shadow-xl">
          <Maximize2 className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="flex-1">{fullscreenNotice}</span>
          <button
            type="button"
            onClick={clearFullscreenNotice}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Secret Admin Overlay (persists seamlessly across Auth, Menu, and active GameView) */}
      {showSecretAdmin && (
        <AdminPortalModal
          entryMode={adminEntryMode}
          currentUser={user}
          onUserUpdated={(u) => setUser(u)}
          onSocialRefresh={refreshSocialFeed}
          onClose={closeAdminPortal}
        />
      )}
    </div>
  );
}
