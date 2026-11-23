import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Coins,
  Crown,
  Eye,
  Gamepad2,
  Home,
  LogOut,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Swords,
  Timer,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { gameAudio } from '../game/audio.ts';
import { NetworkHealthStatus, TelemetryFilter } from '../game/netSync.ts';
import { HudSnapshot, RunResultPayload, RunnerEngine } from '../game/RunnerEngine.ts';
import { api } from '../services/api.ts';
import { syncMatchToFirestore } from '../services/firestoreSync.ts';
import {
  GraphicsQuality,
  MAPS,
  MapId,
  MatchSummary,
  MultiplayerParticipant,
  MultiplayerRoom,
  POWERUPS,
  SkinId,
  SoloGameMode,
  UserProfile,
  formatStopwatch,
} from '../shared/constants.ts';
import { DualResultModal } from './DualResultModal.tsx';

export interface MultiplayerSessionConfig {
  room: MultiplayerRoom;
  participants: MultiplayerParticipant[];
  serverNow?: number;
}

interface GameViewProps {
  user: UserProfile;
  mapId: MapId;
  skinId: SkinId;
  quality: GraphicsQuality;
  soloMode?: SoloGameMode;
  mobileMode?: boolean;
  isFullscreen?: boolean;
  onToggleMobileMode?: () => void;
  onToggleFullscreen?: () => void;
  multiplayerSession?: MultiplayerSessionConfig | null;
  onExitToMenu: (updatedBest?: Partial<UserProfile>) => void;
}

export function GameView({
  user,
  mapId,
  skinId,
  quality,
  soloMode = 'no_coin',
  mobileMode = false,
  isFullscreen = false,
  onToggleMobileMode,
  onToggleFullscreen,
  multiplayerSession,
  onExitToMenu,
}: GameViewProps) {
  const isMultiplayer = Boolean(multiplayerSession);
  const isNormalSolo = !isMultiplayer && soloMode === 'normal';
  const effectiveMapId = multiplayerSession?.room.mapId || mapId;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RunnerEngine | null>(null);
  const matchTokenRef = useRef<{ matchId: string; signature: string } | null>(null);
  const clockOffsetRef = useRef<number>(
    multiplayerSession?.serverNow ? multiplayerSession.serverNow - Date.now() : 0
  );
  const coinEventSentRef = useRef(false);
  const crashEventSentRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const pendingImmediateRef = useRef(false);
  const telemetryFilterRef = useRef(new TelemetryFilter());
  const remoteHealthRef = useRef<{
    healthStatus: NetworkHealthStatus;
    pingMs: number;
    jitterMs: number;
  }>({ healthStatus: 'ok', pingMs: 0, jitterMs: 0 });

  const [runKey, setRunKey] = useState(1);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(gameAudio.muted);
  const [showTouchButtons, setShowTouchButtons] = useState<boolean>(mobileMode);
  useEffect(() => {
    setShowTouchButtons(mobileMode);
  }, [mobileMode]);
  const [hud, setHud] = useState<HudSnapshot>({
    noCoinTimeMs: 0,
    coinFrozen: false,
    coins: 0,
    distance: 0,
    score: 0,
    policeActive: false,
    policeRemainingSec: 0,
    collisionCount: 0,
    activePowerUps: [],
    speedKmh: 40,
  });
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Multiplayer live states
  const [mpRoom, setMpRoom] = useState<MultiplayerRoom | null>(
    multiplayerSession?.room || null
  );
  const [mpParticipants, setMpParticipants] = useState<MultiplayerParticipant[]>(
    multiplayerSession?.participants || []
  );
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);
  const [coopSpectating, setCoopSpectating] = useState(false);
  const [remoteHealth, setRemoteHealth] = useState<{
    healthStatus: NetworkHealthStatus;
    pingMs: number;
    jitterMs: number;
  }>({ healthStatus: 'ok', pingMs: 0, jitterMs: 0 });

  const mapInfo = MAPS.find((m) => m.id === effectiveMapId) || MAPS[0];

  const sendMultiplayerSync = useCallback(
    async (
      roomId: string,
      event?:
        | { type: 'coin_collected'; coinZ: number; coinLane: number }
        | { type: 'crashed' },
      forceImmediate = false
    ) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (!event && syncInFlightRef.current) {
        if (forceImmediate) pendingImmediateRef.current = true;
        return;
      }

      const nowMs = Date.now();
      const telemetry = eng.getMultiplayerTelemetry();
      if (
        !event &&
        !telemetryFilterRef.current.shouldTransmit(telemetry, nowMs, forceImmediate, 450)
      ) {
        return;
      }

      syncInFlightRef.current = true;
      telemetryFilterRef.current.markTransmitted(telemetry, nowMs);
      try {
        const res = await api.multiplayer.syncRoom(roomId, {
          ...telemetry,
          clientTs: nowMs,
          pingMs: remoteHealthRef.current.pingMs,
          event,
        });
        clockOffsetRef.current = res.serverNow - Date.now();
        setMpRoom(res.room);
        setMpParticipants(res.participants);

        const opp = res.participants.find((p) => p.userId !== user.id);
        if (opp) {
          eng.updateRemotePlayerState(opp, res.serverNow, res.echoClientTs || 0);
        }

        if (res.room.status === 'finished') {
          const iWon = res.room.winnerUserId === user.id;
          eng.forceEndExternal(iWon ? 'idle' : 'crash');
        }
      } catch {
        // Transient sync error handled on next interval tick
      } finally {
        syncInFlightRef.current = false;
        if (pendingImmediateRef.current && engineRef.current) {
          pendingImmediateRef.current = false;
          void sendMultiplayerSync(roomId, undefined, true);
        }
      }
    },
    [user.id]
  );

  const handleSoloGameOver = useCallback(
    async (result: RunResultPayload) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const token = matchTokenRef.current;
        if (!token) {
          throw new Error('Sessão da partida não inicializada.');
        }
        const res = await api.finishMatch({
          matchId: token.matchId,
          signature: token.signature,
          ...result,
        });
        setSummary(res.summary);
        void syncMatchToFirestore({
          matchId: token.matchId,
          nickname: user.nickname,
          skinId,
          mapId: effectiveMapId,
          noCoinTimeMs: result.noCoinTimeMs,
          coins: result.coins,
          distance: result.distance,
          score: result.score,
          durationMs: result.durationMs,
        }).catch(() => {});
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Erro ao registrar partida.');
        setSummary({
          matchId: matchTokenRef.current?.matchId || 'local',
          mode: soloMode,
          mapId: effectiveMapId,
          skinId,
          noCoinTimeMs: soloMode === 'normal' ? 0 : result.noCoinTimeMs,
          collectedCoin: result.collectedCoin,
          coins: result.coins,
          distance: result.distance,
          score: result.score,
          durationMs: result.durationMs,
          endReason: result.endReason,
          isNewPersonalRecord: soloMode === 'no_coin' && result.noCoinTimeMs > user.bestNoCoinTimeMs,
          globalRank: user.rank ?? null,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [effectiveMapId, skinId, soloMode, user.bestNoCoinTimeMs, user.nickname, user.rank]
  );

  // Main Engine Lifecycle (Solo or Multiplayer)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let cancelled = false;
    coinEventSentRef.current = false;
    crashEventSentRef.current = false;
    setPaused(false);
    setSummary(null);
    setSubmitError(null);
    setCoopSpectating(false);
    setHud({
      noCoinTimeMs: 0,
      coinFrozen: false,
      coins: 0,
      distance: 0,
      score: 0,
      policeActive: false,
      policeRemainingSec: 0,
      collisionCount: 0,
      activePowerUps: [],
      speedKmh: 40,
    });

    if (multiplayerSession) {
      const room = multiplayerSession.room;
      const participants = multiplayerSession.participants;
      const opponent = participants.find((p) => p.userId !== user.id);
      const isHost = room.hostUserId === user.id;
      const initialServerNow = Date.now() + clockOffsetRef.current;
      const stillCountingDown =
        Boolean(room.startedAt && initialServerNow < room.startedAt);

      telemetryFilterRef.current.reset();
      pendingImmediateRef.current = false;

      const engine = new RunnerEngine({
        container,
        mapId: room.mapId,
        skinId,
        quality,
        customConfig: user.customCharacterConfig,
        onHudUpdate: (snapshot) => {
          if (!cancelled) setHud(snapshot);
        },
        onGameOver: () => {
          // X1 2nd collision crash triggers server loss/adjudication
          if (!cancelled && !crashEventSentRef.current) {
            crashEventSentRef.current = true;
            void sendMultiplayerSync(room.id, { type: 'crashed' }, true);
          }
        },
        multiplayer: {
          mode: room.mode,
          seed: room.seed,
          isHost,
          opponentNickname: opponent?.nickname || 'Adversário',
          opponentSkin: opponent?.skinId || 'ratao',
          opponentCustomConfig: opponent?.customConfig,
          frozenAtStart: stillCountingDown,
          onDiscreteAction: () => {
            if (!cancelled) {
              void sendMultiplayerSync(room.id, undefined, true);
            }
          },
          onCoinCollected: (coinZ, coinLane) => {
            if (!cancelled && room.mode === 'x1' && !coinEventSentRef.current) {
              coinEventSentRef.current = true;
              void sendMultiplayerSync(
                room.id,
                {
                  type: 'coin_collected',
                  coinZ,
                  coinLane,
                },
                true
              );
            }
          },
          onLocalCrashed: () => {
            if (!cancelled) {
              setCoopSpectating(true);
              if (!crashEventSentRef.current) {
                crashEventSentRef.current = true;
                void sendMultiplayerSync(room.id, { type: 'crashed' }, true);
              }
            }
          },
        },
      });
      engineRef.current = engine;
      engine.start();

      // Synchronized 3, 2, 1, VAI! countdown timer
      let goHideTimer: number | null = null;
      const countdownInterval = window.setInterval(() => {
        if (cancelled) return;
        const estServerNow = Date.now() + clockOffsetRef.current;
        const targetStart = room.startedAt || estServerNow;
        const remaining = targetStart - estServerNow;
        if (remaining > 0) {
          const sec = Math.min(3, Math.max(1, Math.ceil(remaining / 1000)));
          setCountdownLabel(String(sec));
        } else {
          engine.setFrozen(false);
          setCountdownLabel('VAI!');
          window.clearInterval(countdownInterval);
          goHideTimer = window.setTimeout(() => {
            if (!cancelled) setCountdownLabel(null);
          }, 750);
        }
      }, 60);

      // 85ms adaptive delta-filtered telemetry loop
      const syncInterval = window.setInterval(() => {
        if (!cancelled) {
          void sendMultiplayerSync(room.id);
        }
      }, 85);

      const healthInterval = window.setInterval(() => {
        if (cancelled || !engineRef.current) return;
        const h = engineRef.current.getRemoteNetworkHealth();
        remoteHealthRef.current = h;
        setRemoteHealth(h);
      }, 400);

      return () => {
        cancelled = true;
        window.clearInterval(countdownInterval);
        window.clearInterval(syncInterval);
        window.clearInterval(healthInterval);
        if (goHideTimer) window.clearTimeout(goHideTimer);
        engine.dispose();
        engineRef.current = null;
      };
    }

    // Standard Solo Mode
    const engine = new RunnerEngine({
      container,
      mapId,
      skinId,
      quality,
      soloMode,
      customConfig: user.customCharacterConfig,
      onHudUpdate: (snapshot) => {
        if (!cancelled) setHud(snapshot);
      },
      onGameOver: (res) => {
        if (!cancelled) void handleSoloGameOver(res);
      },
    });
    engineRef.current = engine;

    void api
      .startMatch(mapId, skinId, soloMode)
      .then((tok) => {
        if (!cancelled) {
          matchTokenRef.current = { matchId: tok.matchId, signature: tok.signature };
          engine.start();
        }
      })
      .catch(() => {
        if (!cancelled) {
          engine.start();
        }
      });

    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, [
    runKey,
    mapId,
    skinId,
    quality,
    soloMode,
    multiplayerSession,
    user.id,
    user.customCharacterConfig,
    handleSoloGameOver,
    sendMultiplayerSync,
  ]);

  // Esc key to pause/resume (Solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    const onKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl?.closest('[data-admin-overlay="true"]')) return;
      if (e.code === 'Escape' && !summary) {
        setPaused((prev) => {
          const next = !prev;
          engineRef.current?.setPaused(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [summary, isMultiplayer]);

  const togglePause = () => {
    if (summary || isMultiplayer) return;
    const next = !paused;
    setPaused(next);
    engineRef.current?.setPaused(next);
  };

  const toggleMute = () => {
    gameAudio.muted = !muted;
    setMuted(gameAudio.muted);
  };

  const handleRestart = () => {
    if (isMultiplayer) return;
    gameAudio.playUiClick();
    setRunKey((k) => k + 1);
  };

  const handleLeaveMultiplayer = async () => {
    if (mpRoom) {
      await api.multiplayer.leaveRoom(mpRoom.id).catch(() => {});
    }
    onExitToMenu();
  };

  const opponentParticipant = mpParticipants.find((p) => p.userId !== user.id);
  const mpFinished = isMultiplayer && mpRoom?.status === 'finished';

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 game-touch-area">
      {/* Isolated WebGL Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Low-occlusion HUD Overlay (pointer-events: none wrapper, NO backdrop-filter) */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between safe-area-hud sm:p-5">
        {/* Top Perimeter Bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            {/* Top-Left: Map, Distance, Score & Opponent Status */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div
                className={`bg-slate-950/90 border border-slate-700/80 rounded-xl shadow-lg flex items-center gap-3 ${
                  mobileMode ? 'px-2.5 py-1.5' : 'px-3 py-2'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 truncate">
                    {mobileMode ? mapInfo.name : `MAPA · ${mapInfo.name}`}{' '}
                    {!isMultiplayer && (
                      <span className={isNormalSolo ? 'text-emerald-400' : 'text-amber-300'}>
                        · {isNormalSolo ? 'NORMAL' : 'NO COIN'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2.5 mt-0.5">
                    <span className="font-mono-num font-bold text-sm sm:text-lg text-white">
                      {hud.distance}m
                    </span>
                    <span className="font-mono-num font-bold text-xs sm:text-sm text-sky-300">
                      {hud.score.toLocaleString('pt-BR')} pts
                    </span>
                    {mobileMode && (
                      <span className="font-mono-num font-extrabold text-xs text-amber-300 flex items-center gap-1">
                        <Coins className="w-3 h-3 text-amber-400" />
                        {hud.coins}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isMultiplayer && opponentParticipant && (
                <div className="bg-slate-950/90 border border-sky-500/60 rounded-xl px-2.5 py-1.5 shadow-lg">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wider text-sky-300">
                    <span className="flex items-center gap-1.5 truncate">
                      {mpRoom?.mode === 'x1' ? (
                        <Swords className="w-3 h-3 text-rose-400 shrink-0" />
                      ) : (
                        <Users className="w-3 h-3 text-sky-400 shrink-0" />
                      )}
                      {opponentParticipant.nickname}
                    </span>
                    <span
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-mono-num text-[9px] shrink-0 ${
                        !opponentParticipant.connected || remoteHealth.healthStatus === 'reconnecting'
                          ? 'bg-rose-500/20 text-rose-300'
                          : remoteHealth.healthStatus === 'unstable'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      <Wifi className="w-2.5 h-2.5" />
                      {!opponentParticipant.connected || remoteHealth.healthStatus === 'reconnecting'
                        ? 'Reconn.'
                        : `${remoteHealth.pingMs}ms`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <span className="font-mono-num font-bold text-white">
                      {opponentParticipant.distance}m
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                        !opponentParticipant.connected
                          ? 'bg-amber-500/20 text-amber-300'
                          : opponentParticipant.alive
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {!opponentParticipant.connected
                        ? 'RECONECTANDO'
                        : opponentParticipant.alive
                          ? 'CORRENDO'
                          : 'CAIU'}
                    </span>
                  </div>
                </div>
              )}

              {hud.activePowerUps.length > 0 && (
                <div className="flex flex-col gap-1">
                  {hud.activePowerUps.map((p) => (
                    <div
                      key={p.type}
                      className="bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-1 flex items-center gap-2"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: POWERUPS[p.type].color }}
                      />
                      <span className="text-[11px] font-bold text-white">
                        {POWERUPS[p.type].name}
                      </span>
                      <span className="font-mono-num text-[11px] text-amber-300 ml-auto">
                        {p.remainingSec.toFixed(1)}s
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop Top-Center Stopwatch (on mobile moved cleanly to Row 2 so zero crowding) */}
            {!mobileMode && (
              <div className="hidden md:flex flex-col items-center">
                {!isNormalSolo && (
                  <div
                    className={`px-6 py-2 rounded-2xl border-2 shadow-xl flex flex-col items-center transition-colors ${
                      mpRoom?.mode === 'x1'
                        ? 'bg-rose-950/95 border-rose-400 text-white'
                        : hud.coinFrozen
                          ? 'bg-sky-950/95 border-sky-400 text-sky-200'
                          : 'bg-slate-950/95 border-amber-400 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest">
                      <Timer
                        className={`w-3.5 h-3.5 ${
                          mpRoom?.mode === 'x1'
                            ? 'text-rose-400'
                            : hud.coinFrozen
                              ? 'text-sky-400'
                              : 'text-amber-400'
                        }`}
                      />
                      {mpRoom?.mode === 'x1'
                        ? 'X1: NÃO PEGUE MOEDAS!'
                        : hud.coinFrozen
                          ? 'CRONÔMETRO CONGELADO'
                          : 'SEM PEGAR MOEDAS'}
                    </div>
                    <div className="font-mono-num font-extrabold text-4xl tracking-tight leading-tight">
                      {formatStopwatch(hud.noCoinTimeMs)}
                    </div>
                    {!isMultiplayer && !hud.coinFrozen && (
                      <div className="text-[10px] font-bold text-rose-300/90 tracking-wider uppercase">
                        1 MOEDA = FIM DE JOGO
                      </div>
                    )}
                  </div>
                )}

                {coopSpectating && opponentParticipant && (
                  <div className="mt-2 px-3.5 py-1.5 rounded-xl bg-sky-950/95 border border-sky-400 text-sky-200 text-xs font-extrabold flex items-center gap-2 shadow-lg">
                    <Eye className="w-4 h-4" />
                    VOCÊ CAIU · ASSISTINDO {opponentParticipant.nickname}
                  </div>
                )}

                {hud.policeActive && !coopSpectating && (
                  <div className="mt-2 px-3.5 py-1.5 rounded-xl bg-red-600 border border-red-300 text-white text-sm font-extrabold flex items-center gap-2 shadow-lg">
                    <AlertTriangle className="w-4 h-4" />
                    POLÍCIA NA COLA ({hud.policeRemainingSec.toFixed(1)}s) · NÃO BATA DE NOVO!
                  </div>
                )}
              </div>
            )}

            {/* Top-Right: Coins (desktop) + Controls (44px touch targets) */}
            <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
              {!mobileMode && (
                <div className="bg-slate-950/90 border border-amber-500/50 rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="font-mono-num font-extrabold text-base sm:text-lg text-amber-300">
                    {hud.coins}
                  </span>
                </div>
              )}

              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={() => void onToggleFullscreen()}
                  title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border transition cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold ${
                    isFullscreen
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-950/90 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  {!mobileMode && (
                    <span className="hidden lg:inline whitespace-nowrap">
                      {isFullscreen ? 'Sair' : 'Tela Cheia'}
                    </span>
                  )}
                </button>
              )}

              {onToggleMobileMode && (
                <button
                  type="button"
                  onClick={onToggleMobileMode}
                  title={mobileMode ? 'Modo Mobile ativo (toque para PC)' : 'Ativar Modo Mobile'}
                  aria-label="Alternar Modo Mobile"
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border transition cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold ${
                    mobileMode
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-slate-950/90 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {mobileMode ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowTouchButtons((v) => !v)}
                title={showTouchButtons ? 'Ocultar botões na tela' : 'Mostrar botões na tela'}
                aria-label="Controles na tela"
                className={`min-w-[44px] min-h-[44px] p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                  showTouchButtons
                    ? 'bg-amber-500 border-amber-300 text-slate-950'
                    : 'bg-slate-950/90 border-slate-700 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={toggleMute}
                title={muted ? 'Ativar som' : 'Silenciar'}
                aria-label={muted ? 'Ativar som' : 'Silenciar'}
                className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-slate-200 hover:bg-slate-800 transition cursor-pointer flex items-center justify-center"
              >
                {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {isMultiplayer ? (
                <button
                  type="button"
                  onClick={() => void handleLeaveMultiplayer()}
                  title="Abandonar sala"
                  aria-label="Abandonar sala"
                  className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-rose-950/95 border border-rose-500/70 text-rose-200 hover:bg-rose-900 transition cursor-pointer flex items-center justify-center"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={togglePause}
                  title="Pausar (Esc)"
                  aria-label="Pausar"
                  className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-white hover:bg-slate-800 transition cursor-pointer flex items-center justify-center"
                >
                  <Pause className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2 on Mobile / Small Viewports: Clean centered Stopwatch & Alerts without squeezing corners */}
          <div className={`flex flex-col items-center ${mobileMode ? 'flex' : 'md:hidden'}`}>
            {!isNormalSolo && (
              <div
                className={`px-4 py-1.5 rounded-2xl border-2 shadow-xl flex flex-col items-center transition-colors ${
                  mpRoom?.mode === 'x1'
                    ? 'bg-rose-950/95 border-rose-400 text-white'
                    : hud.coinFrozen
                      ? 'bg-sky-950/95 border-sky-400 text-sky-200'
                      : 'bg-slate-950/95 border-amber-400 text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest">
                  <Timer
                    className={`w-3 h-3 ${
                      mpRoom?.mode === 'x1'
                        ? 'text-rose-400'
                        : hud.coinFrozen
                          ? 'text-sky-400'
                          : 'text-amber-400'
                    }`}
                  />
                  {mpRoom?.mode === 'x1'
                    ? 'X1: NÃO PEGUE MOEDAS!'
                    : hud.coinFrozen
                      ? 'CRONÔMETRO CONGELADO'
                      : 'SEM PEGAR MOEDAS'}
                </div>
                <div className="font-mono-num font-extrabold text-2xl tracking-tight leading-tight">
                  {formatStopwatch(hud.noCoinTimeMs)}
                </div>
                {!isMultiplayer && !hud.coinFrozen && (
                  <div className="text-[9px] font-bold text-rose-300/90 tracking-wider uppercase">
                    1 MOEDA = FIM DE JOGO
                  </div>
                )}
              </div>
            )}

            {coopSpectating && opponentParticipant && (
              <div className="mt-1.5 px-3 py-1 rounded-xl bg-sky-950/95 border border-sky-400 text-sky-200 text-xs font-extrabold flex items-center gap-1.5 shadow-lg">
                <Eye className="w-3.5 h-3.5" />
                ASSISTINDO {opponentParticipant.nickname}
              </div>
            )}

            {hud.policeActive && !coopSpectating && (
              <div className="mt-1.5 px-3 py-1 rounded-xl bg-red-600 border border-red-300 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                POLÍCIA ({hud.policeRemainingSec.toFixed(1)}s) · CUIDADO!
              </div>
            )}
          </div>
        </div>

        {/* Synchronized Multiplayer Countdown Overlay */}
        {countdownLabel && !mpFinished && (
          <div className="self-center my-auto flex flex-col items-center justify-center">
            <div className="px-8 py-4 rounded-2xl bg-slate-950/90 border-2 border-amber-400 shadow-2xl text-center">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-amber-300 mb-1">
                {mpRoom?.mode === 'x1'
                  ? 'X1 · QUEM PEGAR A 1ª MOEDA PERDE!'
                  : 'CORRIDA SINCRONIZADA'}
              </div>
              <div className="font-display text-5xl sm:text-7xl font-extrabold text-white tracking-tight">
                {countdownLabel}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Area: Ergonomic Thumb Arcade Controls (Mobile Mode) or Subtle Hint */}
        <div className="flex items-end justify-between">
          {showTouchButtons && !paused && !summary && !mpFinished && !coopSpectating ? (
            <div className="w-full flex items-end justify-between pointer-events-auto pb-1">
              <div className="flex gap-2.5">
                <button
                  type="button"
                  aria-label="Mover para esquerda"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerHaptic();
                    engineRef.current?.moveLeft();
                  }}
                  className="w-16 h-16 sm:w-14 sm:h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-500/80 text-white flex items-center justify-center active:scale-90 active:bg-slate-800 shadow-xl touch-none"
                >
                  <ArrowLeft className="w-7 h-7" />
                </button>
                <button
                  type="button"
                  aria-label="Mover para direita"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerHaptic();
                    engineRef.current?.moveRight();
                  }}
                  className="w-16 h-16 sm:w-14 sm:h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-500/80 text-white flex items-center justify-center active:scale-90 active:bg-slate-800 shadow-xl touch-none"
                >
                  <ArrowRight className="w-7 h-7" />
                </button>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  aria-label="Deslizar"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerHaptic();
                    engineRef.current?.slide();
                  }}
                  className="w-16 h-16 sm:w-14 sm:h-14 rounded-2xl bg-slate-900/90 border-2 border-sky-400 text-sky-300 flex flex-col items-center justify-center active:scale-90 active:bg-sky-950 shadow-xl touch-none"
                >
                  <ArrowDown className="w-6 h-6" />
                  <span className="text-[9px] font-extrabold uppercase leading-none mt-0.5">
                    Descer
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Pular"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerHaptic();
                    engineRef.current?.jump();
                  }}
                  className="w-16 h-16 sm:w-14 sm:h-14 rounded-2xl bg-rose-600/95 border-2 border-rose-300 text-white flex flex-col items-center justify-center active:scale-90 active:bg-rose-500 shadow-xl touch-none"
                >
                  <ArrowUp className="w-6 h-6" />
                  <span className="text-[9px] font-extrabold uppercase leading-none mt-0.5">
                    Pular
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto px-3 py-1 rounded-lg bg-slate-950/75 border border-slate-800 text-[11px] text-slate-300 font-semibold text-center">
              {mobileMode
                ? 'Deslize para os lados, cima ou baixo · Toque no ícone de controle para botões'
                : 'A/D ou ←/→ Faixas · Espaço/↑ Pular · S/↓ Deslizar · Deslize na tela no celular'}
            </div>
          )}
        </div>
      </div>

      {/* Solo Pause Modal */}
      {paused && !summary && !isMultiplayer && (
        <div className="absolute inset-0 z-30 bg-slate-950/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-white mb-1">JOGO PAUSADO</h2>
            <p className="text-xs text-slate-400 mb-5">
              {isNormalSolo
                ? `Modo Normal · ${hud.distance}m · ${hud.coins} moedas`
                : `Cronômetro Sem Moedas: ${formatStopwatch(hud.noCoinTimeMs)}`}
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={togglePause}
                className="w-full min-h-[48px] py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" /> CONTINUAR
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="w-full min-h-[48px] py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> REINICIAR
              </button>
              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={() => void onToggleFullscreen()}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 className="w-4 h-4" /> SAIR DA TELA CHEIA
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-4 h-4" /> TELA CHEIA
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onExitToMenu()}
                className="w-full min-h-[48px] py-3 rounded-xl bg-slate-950 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4" /> VOLTAR AO MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Solo Game Over Modal */}
      {summary && !isMultiplayer && (
        <div className="absolute inset-0 z-40 bg-slate-950/90 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="text-center mb-5">
              <span className="inline-block px-3 py-1 rounded-lg bg-rose-600/20 border border-rose-500/50 text-rose-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                {summary.mode === 'normal'
                  ? 'CAPTURADO PELO POLICIAL!'
                  : summary.endReason === 'coin' || summary.collectedCoin
                    ? 'VOCÊ PEGOU UMA MOEDA!'
                    : 'CAPTURADO PELO POLICIAL!'}
              </span>
              <h2 className="font-display text-3xl font-bold text-white">FIM DE PARTIDA</h2>
              {summary.mode === 'no_coin' && summary.isNewPersonalRecord && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-extrabold">
                  <Crown className="w-4 h-4" /> NOVO RECORDE PESSOAL SEM MOEDAS!
                </div>
              )}
            </div>

            {submitError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-950 border border-red-500/50 text-red-200 text-xs">
                {submitError}
              </div>
            )}

            {summary.mode === 'normal' ? (
              <>
                <div className="bg-slate-950 border-2 border-emerald-400/70 rounded-xl p-4 text-center mb-4">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                    MOEDAS COLETADAS (CREDITADAS NA CONTA)
                  </div>
                  <div className="font-mono-num text-4xl font-extrabold text-amber-300 mt-1 flex items-center justify-center gap-2">
                    <Coins className="w-8 h-8 text-amber-400" />+{summary.coins}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Distância</div>
                    <div className="font-mono-num text-xl font-bold text-white">
                      {summary.distance}m
                    </div>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Pontuação</div>
                    <div className="font-mono-num text-xl font-bold text-sky-400">
                      {summary.score.toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-slate-950 border-2 border-amber-400/70 rounded-xl p-4 text-center mb-4">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                    TEMPO SOBREVIVIDO SEM MOEDAS
                  </div>
                  <div className="font-mono-num text-4xl font-extrabold text-white mt-1">
                    {formatStopwatch(summary.noCoinTimeMs)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Tentativas No Coin não acumulam moedas na carteira.
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5 mb-5">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Distância</div>
                    <div className="font-mono-num text-lg font-bold text-white">
                      {summary.distance}m
                    </div>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Pontuação</div>
                    <div className="font-mono-num text-lg font-bold text-sky-400">
                      {summary.score.toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Ranking</div>
                    <div className="font-mono-num text-lg font-bold text-emerald-400">
                      {submitting ? '...' : summary.globalRank ? `#${summary.globalRank}` : '—'}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRestart}
                className="py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> JOGAR DE NOVO
              </button>
              <button
                type="button"
                onClick={() => onExitToMenu()}
                className="py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-display font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4" /> MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Dual 3D Result Modal for Co-op & X1 */}
      {mpFinished && mpRoom && (
        <DualResultModal
          room={mpRoom}
          participants={mpParticipants}
          currentUser={user}
          onExitToMenu={() => onExitToMenu()}
        />
      )}
    </div>
  );
}
