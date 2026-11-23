import {
  BellRing,
  ChevronDown,
  ChevronUp,
  Gift,
  LogOut,
  Map as MapIcon,
  Megaphone,
  Play,
  ShieldAlert,
  Sliders,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  User,
  Users,
  Vote,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminPortalModal } from './components/AdminPortalModal.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { GameView, MultiplayerSessionConfig } from './components/GameView.tsx';
import { LeaderboardModal } from './components/LeaderboardModal.tsx';
import { MapsModal } from './components/MapsModal.tsx';
import { MultiplayerModal } from './components/MultiplayerModal.tsx';
import { PollsAndMessagesModal } from './components/PollsAndMessagesModal.tsx';
import { ProfileModal } from './components/ProfileModal.tsx';
import { RataoLogo } from './components/RataoLogo.tsx';
import { ScenePreview3D } from './components/ScenePreview3D.tsx';
import { SkinsModal } from './components/SkinsModal.tsx';
import { gameAudio } from './game/audio.ts';
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
  PollItem,
  SkinGiftItem,
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
  | 'skins'
  | 'maps'
  | 'ranking'
  | 'polls'
  | 'profile'
  | 'multiplayer';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bootChecking, setBootChecking] = useState(true);
  const [playing, setPlaying] = useState(false);

  const [selectedMap, setSelectedMap] = useState<MapId>('brasil');
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

  // Social sync state (periodic polling compatible with serverless)
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [unseenGifts, setUnseenGifts] = useState<SkinGiftItem[]>([]);

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

  const handleStartGame = () => {
    gameAudio.unlock();
    gameAudio.playUiClick();
    setActiveMpSession(null);
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
  const openPollsCount = polls.filter((p) => p.active && p.userVotedIndex === null).length;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {!user ? (
        <AuthScreen
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
          activeMessages={messages}
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
            />
          </div>

          {/* Perimeter HUD Shell (zero backdrop-filter over WebGL, unobstructed center) */}
          <div className="relative z-10 w-full h-full pointer-events-none flex flex-col justify-between p-4 sm:p-6">
            {/* Top Bar */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              {/* Top-Left: Logo + Player Personal Record */}
              <div className="pointer-events-auto flex flex-col gap-2.5">
                <RataoLogo compact />
                <div className="bg-slate-950/90 border border-slate-700/80 rounded-xl px-3.5 py-2 flex items-center gap-4 shadow-lg">
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
                </div>
              </div>

              {/* Top-Center: Global Broadcast Message Toast (if active) */}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveModal('polls')}
                  className="pointer-events-auto max-w-md bg-indigo-950/95 border border-indigo-400/70 rounded-xl px-4 py-2 text-left shadow-xl hover:border-amber-400 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs font-extrabold text-amber-300 uppercase">
                    <Megaphone className="w-3.5 h-3.5" /> {messages[0].title}
                  </div>
                  <p className="text-xs text-indigo-100 line-clamp-1 mt-0.5">
                    {messages[0].content}
                  </p>
                </button>
              )}

              {/* Top-Right: Active Skin/Map summary + Quality + Logout */}
              <div className="pointer-events-auto flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end bg-slate-950/90 border border-slate-700/80 rounded-xl px-3 py-1.5 text-right">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {equippedSkinDef.name} · {currentMapDef.name}
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    {user.rank ? `Ranking #${user.rank}` : `${user.totalMatches} partidas`}
                  </span>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowQualityMenu((v) => !v)}
                    title="Qualidade gráfica"
                    className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                  >
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <span className="hidden sm:inline uppercase">
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
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
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
                  className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-rose-300 hover:bg-rose-950 cursor-pointer"
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
                className="pointer-events-auto mb-1.5 px-3 py-1 rounded-t-xl bg-slate-950/90 border border-b-0 border-slate-700 text-[11px] font-bold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
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

              {!dockCollapsed && (
                <div className="pointer-events-auto w-full max-w-5xl bg-slate-950/95 border border-slate-700/90 rounded-2xl p-2.5 sm:p-3 shadow-2xl flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
                  <button
                    type="button"
                    onClick={handleStartGame}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold text-base sm:text-lg tracking-wide shadow-lg shadow-rose-900/50 flex items-center gap-2 cursor-pointer transition transform active:scale-95"
                  >
                    <Play className="w-5 h-5 fill-current" /> JOGAR
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gameAudio.unlock();
                      gameAudio.playUiClick();
                      setMultiplayerMode('coop');
                      setActiveModal('multiplayer');
                    }}
                    className="px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Users className="w-4 h-4" /> JOGAR COM AMIGO
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gameAudio.unlock();
                      gameAudio.playUiClick();
                      setMultiplayerMode('x1');
                      setActiveModal('multiplayer');
                    }}
                    className="px-4 py-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Swords className="w-4 h-4" /> X1 SEM MOEDAS
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
                      setActiveModal('maps');
                    }}
                    className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <MapIcon className="w-4 h-4 text-emerald-400" /> MAPAS
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
                      setActiveModal('polls');
                    }}
                    className="relative px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Vote className="w-4 h-4 text-sky-400" /> VOTAÇÕES
                    {(openPollsCount > 0 || messages.length > 0) && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-500 text-slate-950 font-mono-num text-[10px] font-extrabold">
                        {openPollsCount + messages.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gameAudio.playUiClick();
                      setInspectNickname(user.nickname);
                      setActiveModal('profile');
                    }}
                    className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <User className="w-4 h-4 text-rose-400" /> PERFIL
                  </button>
                </div>
              )}
            </div>
          </div>

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

          {/* Feature Modals */}
          {activeModal === 'skins' && (
            <SkinsModal
              user={user}
              selectedMap={selectedMap}
              quality={quality}
              onEquipped={(skinId) => setUser({ ...user, equippedSkin: skinId })}
              onClose={() => setActiveModal(null)}
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

          {activeModal === 'polls' && (
            <PollsAndMessagesModal
              messages={messages}
              polls={polls}
              onPollsUpdated={(next) => setPolls(next)}
              onClose={() => setActiveModal(null)}
            />
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

      {/* Discreet DevTools / Context-Menu Notice Toast (non-blocking) */}
      {securityToast && (
        <div className="fixed bottom-4 right-4 z-[60] pointer-events-none px-3.5 py-2 rounded-xl bg-slate-900/95 border border-amber-500/60 text-amber-200 text-xs font-semibold flex items-center gap-2 shadow-xl">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{securityToast}</span>
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
