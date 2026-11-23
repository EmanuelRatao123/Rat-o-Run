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
  Megaphone,
  Pause,
  Play,
  RotateCcw,
  Swords,
  Timer,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { gameAudio } from '../game/audio.ts';
import { HudSnapshot, RunResultPayload, RunnerEngine } from '../game/RunnerEngine.ts';
import { api } from '../services/api.ts';
import { syncMatchToFirestore } from '../services/firestoreSync.ts';
import {
  GlobalMessage,
  GraphicsQuality,
  MAPS,
  MapId,
  MatchSummary,
  MultiplayerParticipant,
  MultiplayerRoom,
  POWERUPS,
  SkinId,
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
  activeMessages: GlobalMessage[];
  multiplayerSession?: MultiplayerSessionConfig | null;
  onExitToMenu: (updatedBest?: Partial<UserProfile>) => void;
}

export function GameView({
  user,
  mapId,
  skinId,
  quality,
  activeMessages,
  multiplayerSession,
  onExitToMenu,
}: GameViewProps) {
  const isMultiplayer = Boolean(multiplayerSession);
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

  const [runKey, setRunKey] = useState(1);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(gameAudio.muted);
  const [showTouchButtons, setShowTouchButtons] = useState(false);
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

  const mapInfo = MAPS.find((m) => m.id === effectiveMapId) || MAPS[0];

  const sendMultiplayerSync = useCallback(
    async (
      roomId: string,
      event?:
        | { type: 'coin_collected'; coinZ: number; coinLane: number }
        | { type: 'crashed' }
    ) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (!event && syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        const telemetry = eng.getMultiplayerTelemetry();
        const res = await api.multiplayer.syncRoom(roomId, {
          ...telemetry,
          event,
        });
        clockOffsetRef.current = res.serverNow - Date.now();
        setMpRoom(res.room);
        setMpParticipants(res.participants);

        const opp = res.participants.find((p) => p.userId !== user.id);
        if (opp) {
          eng.updateRemotePlayerState(opp);
        }

        if (res.room.status === 'finished') {
          const iWon = res.room.winnerUserId === user.id;
          eng.forceEndExternal(iWon ? 'idle' : 'crash');
        }
      } catch {
        // Transient sync error handled on next interval tick
      } finally {
        syncInFlightRef.current = false;
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
          mapId: effectiveMapId,
          skinId,
          noCoinTimeMs: result.noCoinTimeMs,
          collectedCoin: result.collectedCoin,
          coins: result.coins,
          distance: result.distance,
          score: result.score,
          durationMs: result.durationMs,
          isNewPersonalRecord: result.noCoinTimeMs > user.bestNoCoinTimeMs,
          globalRank: user.rank ?? null,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [effectiveMapId, skinId, user.bestNoCoinTimeMs, user.nickname, user.rank]
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

      const engine = new RunnerEngine({
        container,
        mapId: room.mapId,
        skinId,
        quality,
        onHudUpdate: (snapshot) => {
          if (!cancelled) setHud(snapshot);
        },
        onGameOver: () => {
          // X1 2nd collision crash triggers server loss/adjudication
          if (!cancelled && !crashEventSentRef.current) {
            crashEventSentRef.current = true;
            void sendMultiplayerSync(room.id, { type: 'crashed' });
          }
        },
        multiplayer: {
          mode: room.mode,
          seed: room.seed,
          isHost,
          opponentNickname: opponent?.nickname || 'Adversário',
          opponentSkin: opponent?.skinId || 'ratao',
          frozenAtStart: stillCountingDown,
          onCoinCollected: (coinZ, coinLane) => {
            if (!cancelled && room.mode === 'x1' && !coinEventSentRef.current) {
              coinEventSentRef.current = true;
              void sendMultiplayerSync(room.id, {
                type: 'coin_collected',
                coinZ,
                coinLane,
              });
            }
          },
          onLocalCrashed: () => {
            if (!cancelled) {
              setCoopSpectating(true);
              if (!crashEventSentRef.current) {
                crashEventSentRef.current = true;
                void sendMultiplayerSync(room.id, { type: 'crashed' });
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

      // 230ms telemetry sync loop
      const syncInterval = window.setInterval(() => {
        if (!cancelled) {
          void sendMultiplayerSync(room.id);
        }
      }, 230);

      return () => {
        cancelled = true;
        window.clearInterval(countdownInterval);
        window.clearInterval(syncInterval);
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
      onHudUpdate: (snapshot) => {
        if (!cancelled) setHud(snapshot);
      },
      onGameOver: (res) => {
        if (!cancelled) void handleSoloGameOver(res);
      },
    });
    engineRef.current = engine;

    void api
      .startMatch(mapId, skinId)
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
    multiplayerSession,
    user.id,
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

  const latestMessage = activeMessages[0];
  const opponentParticipant = mpParticipants.find((p) => p.userId !== user.id);
  const mpFinished = isMultiplayer && mpRoom?.status === 'finished';

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 game-touch-area">
      {/* Isolated WebGL Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Low-occlusion HUD Overlay (pointer-events: none wrapper, NO backdrop-filter) */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
        {/* Top Perimeter Bar */}
        <div className="flex items-start justify-between gap-2">
          {/* Top-Left: Map, Distance, Score & Active PowerUps / Opponent Status */}
          <div className="flex flex-col gap-2">
            <div className="bg-slate-950/90 border border-slate-700/80 rounded-xl px-3 py-2 flex items-center gap-3 shadow-lg">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  MAPA · {mapInfo.name}
                </div>
                <div className="flex items-baseline gap-3 mt-0.5">
                  <span className="font-mono-num font-bold text-base sm:text-lg text-white">
                    {hud.distance}m
                  </span>
                  <span className="font-mono-num font-bold text-sm text-sky-300">
                    {hud.score.toLocaleString('pt-BR')} pts
                  </span>
                </div>
              </div>
            </div>

            {isMultiplayer && opponentParticipant && (
              <div className="bg-slate-950/90 border border-sky-500/60 rounded-xl px-3 py-2 shadow-lg">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-300">
                  {mpRoom?.mode === 'x1' ? (
                    <Swords className="w-3 h-3 text-rose-400" />
                  ) : (
                    <Users className="w-3 h-3 text-sky-400" />
                  )}
                  {opponentParticipant.nickname}
                </div>
                <div className="flex items-center gap-2.5 mt-0.5 text-xs">
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
              <div className="flex flex-col gap-1.5">
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

          {/* Top-Center: PROMINENT NO-COIN STOPWATCH / X1 RULE */}
          <div className="flex flex-col items-center">
            <div
              className={`px-4 sm:px-6 py-2 rounded-2xl border-2 shadow-xl flex flex-col items-center transition-colors ${
                mpRoom?.mode === 'x1'
                  ? 'bg-rose-950/95 border-rose-400 text-white'
                  : hud.coinFrozen
                    ? 'bg-sky-950/95 border-sky-400 text-sky-200'
                    : 'bg-slate-950/95 border-amber-400 text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-extrabold uppercase tracking-widest">
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
              <div className="font-mono-num font-extrabold text-2xl sm:text-4xl tracking-tight leading-tight">
                {formatStopwatch(hud.noCoinTimeMs)}
              </div>
            </div>

            {coopSpectating && opponentParticipant && (
              <div className="mt-2 px-3.5 py-1.5 rounded-xl bg-sky-950/95 border border-sky-400 text-sky-200 text-xs font-extrabold flex items-center gap-2 shadow-lg">
                <Eye className="w-4 h-4" />
                VOCÊ CAIU · ASSISTINDO {opponentParticipant.nickname}
              </div>
            )}

            {/* Police Chase Warning Banner */}
            {hud.policeActive && !coopSpectating && (
              <div className="mt-2 px-3.5 py-1.5 rounded-xl bg-red-600 border border-red-300 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg">
                <AlertTriangle className="w-4 h-4" />
                POLÍCIA NA COLA ({hud.policeRemainingSec.toFixed(1)}s) · NÃO BATA DE NOVO!
              </div>
            )}

            {/* Global Admin Broadcast Banner inside game */}
            {latestMessage && !hud.policeActive && !coopSpectating && (
              <div className="mt-2 max-w-md px-3.5 py-1.5 rounded-xl bg-indigo-950/95 border border-indigo-400/70 text-indigo-100 text-xs flex items-center gap-2 shadow-lg">
                <Megaphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-bold text-amber-300 shrink-0">{latestMessage.title}:</span>
                <span className="truncate">{latestMessage.content}</span>
              </div>
            )}
          </div>

          {/* Top-Right: Coins + Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="bg-slate-950/90 border border-amber-500/50 rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="font-mono-num font-extrabold text-base sm:text-lg text-amber-300">
                {hud.coins}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowTouchButtons((v) => !v)}
              title="Controles na tela"
              className={`p-2.5 rounded-xl border transition cursor-pointer ${
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
              className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {isMultiplayer ? (
              <button
                type="button"
                onClick={() => void handleLeaveMultiplayer()}
                title="Abandonar sala"
                className="p-2.5 rounded-xl bg-rose-950/95 border border-rose-500/70 text-rose-200 hover:bg-rose-900 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={togglePause}
                title="Pausar (Esc)"
                className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <Pause className="w-4 h-4" />
              </button>
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

        {/* Bottom Area: Optional Touch Buttons + Subtle Hint */}
        <div className="flex items-end justify-between">
          {showTouchButtons && !paused && !summary && !mpFinished && !coopSpectating ? (
            <div className="w-full flex items-end justify-between pointer-events-auto pb-2 px-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  onPointerDown={() => engineRef.current?.moveLeft()}
                  className="w-14 h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-600 text-white flex items-center justify-center active:scale-95"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onPointerDown={() => engineRef.current?.moveRight()}
                  className="w-14 h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-600 text-white flex items-center justify-center active:scale-95"
                >
                  <ArrowRight className="w-6 h-6" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onPointerDown={() => engineRef.current?.slide()}
                  className="w-14 h-14 rounded-2xl bg-slate-900/90 border-2 border-sky-500 text-sky-300 flex items-center justify-center active:scale-95"
                >
                  <ArrowDown className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onPointerDown={() => engineRef.current?.jump()}
                  className="w-14 h-14 rounded-2xl bg-rose-600/95 border-2 border-rose-300 text-white flex items-center justify-center active:scale-95"
                >
                  <ArrowUp className="w-6 h-6" />
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto px-3 py-1 rounded-lg bg-slate-950/75 border border-slate-800 text-[11px] text-slate-300 font-semibold">
              A/D ou ←/→ Faixas · Espaço/↑ Pular · S/↓ Deslizar · Deslize na tela no celular
            </div>
          )}
        </div>
      </div>

      {/* Solo Pause Modal */}
      {paused && !summary && !isMultiplayer && (
        <div className="absolute inset-0 z-30 bg-slate-950/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-white mb-1">JOGO PAUSADO</h2>
            <p className="text-xs text-slate-400 mb-6">
              Cronômetro Sem Moedas: {formatStopwatch(hud.noCoinTimeMs)}
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={togglePause}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" /> CONTINUAR
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> REINICIAR
              </button>
              <button
                type="button"
                onClick={() => onExitToMenu()}
                className="w-full py-3 rounded-xl bg-slate-950 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold flex items-center justify-center gap-2 cursor-pointer"
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
                CAPTURADO PELO POLICIAL!
              </span>
              <h2 className="font-display text-3xl font-bold text-white">FIM DE PARTIDA</h2>
              {summary.isNewPersonalRecord && (
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

            {/* Highlighted No-Coin Result */}
            <div className="bg-slate-950 border-2 border-amber-400/70 rounded-xl p-4 text-center mb-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                TEMPO SEM PEGAR MOEDAS {summary.collectedCoin ? '(CONGELADO NA 1ª MOEDA)' : '(ZERO MOEDAS!)'}
              </div>
              <div className="font-mono-num text-4xl font-extrabold text-white mt-1">
                {formatStopwatch(summary.noCoinTimeMs)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Moedas</div>
                <div className="font-mono-num text-xl font-bold text-amber-400">{summary.coins}</div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Distância</div>
                <div className="font-mono-num text-xl font-bold text-white">{summary.distance}m</div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Pontuação</div>
                <div className="font-mono-num text-xl font-bold text-sky-400">
                  {summary.score.toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-bold uppercase">Ranking Global</div>
                <div className="font-mono-num text-xl font-bold text-emerald-400">
                  {submitting ? '...' : summary.globalRank ? `#${summary.globalRank}` : '—'}
                </div>
              </div>
            </div>

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
