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
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Swords,
  Timer,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameAudio } from '../game/audio.ts';
import { MatchLifecycleController } from '../game/matchLifecycle.ts';
import { NetworkHealthStatus, TelemetryFilter } from '../game/netSync.ts';
import { HudSnapshot, RunResultPayload, RunnerEngine } from '../game/RunnerEngine.ts';
import { api } from '../services/api.ts';
import { syncMatchToFirestore } from '../services/firestoreSync.ts';
import {
  flushPendingMatchFinishes,
  isRetriableMatchError,
  PendingMatchFinishPayload,
  submitMatchFinishWithRetry,
} from '../services/pendingMatches.ts';
import {
  getSkateDefinition,
  GraphicsQuality,
  LiveOverlayPosition,
  LiveOverlayText,
  MAPS,
  MapId,
  MatchSummary,
  MultiplayerParticipant,
  MultiplayerRoom,
  POWERUPS,
  SkateId,
  SkinId,
  SoloGameMode,
  UserProfile,
  formatStopwatch,
} from '../shared/constants.ts';
import { DualResultModal } from './DualResultModal.tsx';
import { ScenePreview3D } from './ScenePreview3D.tsx';

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
  onUserPatch?: (patch: Partial<UserProfile>) => void;
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
  onUserPatch,
  onExitToMenu,
}: GameViewProps) {
  const isMultiplayer = Boolean(multiplayerSession);
  const isNormalSolo = !isMultiplayer && soloMode === 'normal';
  const effectiveMapId = multiplayerSession?.room.mapId || mapId;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RunnerEngine | null>(null);
  const matchTokenRef = useRef<{ matchId: string; signature: string } | null>(null);
  const matchStartPromiseRef = useRef<Promise<{ matchId: string; signature: string } | null> | null>(
    null
  );
  const lastFinishPayloadRef = useRef<PendingMatchFinishPayload | null>(null);
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

  const initialSkateId = user.equippedSkateId ?? null;
  const initialSkateCharges = initialSkateId
    ? user.skateInventory?.find((item) => item.skateId === initialSkateId)?.charges ?? 0
    : 0;
  const latestUserRef = useRef(user);
  latestUserRef.current = user;
  const latestLaunchPropsRef = useRef({
    mapId,
    skinId,
    quality,
    soloMode,
    multiplayerSession,
    userId: user.id,
  });
  latestLaunchPropsRef.current = {
    mapId,
    skinId,
    quality,
    soloMode,
    multiplayerSession,
    userId: user.id,
  };
  const onUserPatchRef = useRef(onUserPatch);
  onUserPatchRef.current = onUserPatch;
  const onExitToMenuRef = useRef(onExitToMenu);
  onExitToMenuRef.current = onExitToMenu;

  const lifecycleRef = useRef<MatchLifecycleController | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = new MatchLifecycleController({
      onDiagnostic: (entry) => {
        if (
          entry.event === 'unexpected_reset_blocked' ||
          entry.event === 'duplicate_start_blocked' ||
          entry.event === 'restart_blocked' ||
          entry.event === 'engine_error' ||
          entry.event === 'reconnect_event' ||
          entry.event === 'finish_begin'
        ) {
          void api.reportMatchDiagnostic({
            matchId: entry.serverMatchId || entry.runInstanceId,
            mode: latestLaunchPropsRef.current.multiplayerSession
              ? latestLaunchPropsRef.current.multiplayerSession.room.mode
              : latestLaunchPropsRef.current.soloMode,
            stage: entry.phase,
            status: entry.event,
            detail: entry.detail,
          });
        }
      },
    });
  }

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
    speedState: 'normal',
    activePowerUps: [],
    speedKmh: 40,
    equippedSkateId: initialSkateId,
    skateChargesRemaining: initialSkateCharges,
    skateActive: false,
    skateRemainingSec: 0,
  });
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Personal Live Mode overlay state
  const liveTexts = useMemo<LiveOverlayText[]>(
    () => (user.liveModeConfig?.texts || []).filter((t) => t.enabled && t.text.trim().length > 0),
    [user.liveModeConfig]
  );
  const [liveOverlayEnabled, setLiveOverlayEnabled] = useState<boolean>(
    Boolean(user.liveModeConfig?.enabled)
  );
  const [liveTextIdx, setLiveTextIdx] = useState(0);
  const [liveVisible, setLiveVisible] = useState(true);

  useEffect(() => {
    setLiveOverlayEnabled(Boolean(user.liveModeConfig?.enabled));
  }, [user.liveModeConfig?.enabled]);

  useEffect(() => {
    if (!liveOverlayEnabled || liveTexts.length === 0) return;
    const current = liveTexts[liveTextIdx % liveTexts.length];
    const stayMs = Math.max(2000, Math.min(30000, (current?.durationSec || 5) * 1000));
    setLiveVisible(true);
    if (liveTexts.length === 1) return;
    const fadeTimer = window.setTimeout(() => setLiveVisible(false), Math.max(800, stayMs - 400));
    const nextTimer = window.setTimeout(() => {
      setLiveTextIdx((i) => (i + 1) % liveTexts.length);
      setLiveVisible(true);
    }, stayMs);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(nextTimer);
    };
  }, [liveOverlayEnabled, liveTexts, liveTextIdx]);

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
          eng.forceEndExternal(iWon ? 'victory' : 'crash');
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

  const handleSkateConsumption = useCallback(
    (skateId: SkateId, useSeq: number) => {
      const currentUser = latestUserRef.current;
      const launch = latestLaunchPropsRef.current;
      const mode = launch.multiplayerSession ? launch.multiplayerSession.room.mode : launch.soloMode;

      const executeConsume = async () => {
        let matchId = matchTokenRef.current?.matchId || mpRoom?.id || '';
        if (!matchId && matchStartPromiseRef.current) {
          const started = await matchStartPromiseRef.current.catch(() => null);
          if (started?.matchId) {
            matchId = started.matchId;
          }
        }
        if (!matchId) {
          matchId = `run_${currentUser.id}_${runKey}`;
        }
        const eventKey = `${matchId}:${useSeq}`;
        const res = await api.consumeMatchSkate({ matchId, skateId, mode, eventKey });
        engineRef.current?.syncSkateCharges(res.remainingCharges);
        if (onUserPatchRef.current) {
          const currentInv = latestUserRef.current.skateInventory || [];
          const nextInv = currentInv.map((item) =>
            item.skateId === skateId ? { ...item, charges: res.remainingCharges } : item
          );
          onUserPatchRef.current({ skateInventory: nextInv });
        }
      };

      void executeConsume().catch(() => {
        // Transient error does not block in-match skate activation
      });
    },
    [mpRoom?.id, runKey]
  );

  const handleSoloGameOver = useCallback(
    async (result: RunResultPayload, expectedRunId: string) => {
      const lifecycle = lifecycleRef.current!;
      if (expectedRunId !== lifecycle.getRunInstanceId()) {
        lifecycle.recordUnexpectedResetAttempt(
          'handleSoloGameOver',
          `Ignored stale gameOver for run=${expectedRunId}`
        );
        return;
      }
      const endReason = result.endReason || (result.collectedCoin ? 'coin' : 'police');
      if (!lifecycle.beginFinishing(expectedRunId, endReason)) {
        return;
      }

      const launch = latestLaunchPropsRef.current;
      const snapshotUser = latestUserRef.current;
      const runMapId = launch.mapId;
      const runSkinId = launch.skinId;
      const runSoloMode = launch.soloMode;

      setPaused(false);
      setSubmitting(true);
      setSubmitError(null);
      try {
        let token = matchTokenRef.current;
        if (!token && matchStartPromiseRef.current) {
          token = await matchStartPromiseRef.current.catch(() => null);
        }
        if (expectedRunId !== lifecycle.getRunInstanceId()) {
          return;
        }
        if (!token) {
          const started = await api.startMatch(runMapId, runSkinId, runSoloMode);
          if (expectedRunId !== lifecycle.getRunInstanceId()) {
            return;
          }
          token = { matchId: started.matchId, signature: started.signature };
          matchTokenRef.current = token;
          lifecycle.bindServerMatchId(expectedRunId, started.matchId);
        }
        const payload: PendingMatchFinishPayload = {
          matchId: token.matchId,
          signature: token.signature,
          ...result,
        };
        lastFinishPayloadRef.current = payload;
        const res = await submitMatchFinishWithRetry(payload, 3);
        if (expectedRunId !== lifecycle.getRunInstanceId()) {
          return;
        }
        lastFinishPayloadRef.current = null;
        const confirmedSummary: MatchSummary = {
          ...res.summary,
          confirmedByServer: true,
        };
        setSummary(confirmedSummary);
        if (onUserPatchRef.current) {
          onUserPatchRef.current({
            ...(confirmedSummary.isNewPersonalRecord && confirmedSummary.mode === 'no_coin'
              ? { bestNoCoinTimeMs: confirmedSummary.noCoinTimeMs }
              : {}),
            rank: confirmedSummary.globalRank,
          });
        }
        lifecycle.completeResult(expectedRunId, `recorded:${endReason}`);
        void syncMatchToFirestore({
          matchId: token.matchId,
          nickname: snapshotUser.nickname,
          skinId: runSkinId,
          mapId: runMapId,
          noCoinTimeMs: result.noCoinTimeMs,
          coins: result.coins,
          distance: result.distance,
          score: result.score,
          durationMs: result.durationMs,
        }).catch(() => {});
      } catch (err) {
        if (expectedRunId !== lifecycle.getRunInstanceId()) {
          return;
        }
        const retriable = isRetriableMatchError(err);
        if (!retriable) {
          lastFinishPayloadRef.current = null;
        }
        setSubmitError(
          err instanceof Error
            ? retriable
              ? `${err.message} (Resultado salvo localmente para reenvio automático.)`
              : `${err.message} (Resultado não confirmado pelo servidor.)`
            : 'Erro ao registrar partida. Resultado aguardando confirmação no servidor.'
        );
        setSummary({
          matchId: matchTokenRef.current?.matchId || 'local',
          mode: runSoloMode,
          mapId: runMapId,
          skinId: runSkinId,
          noCoinTimeMs: runSoloMode === 'normal' ? 0 : result.noCoinTimeMs,
          collectedCoin: result.collectedCoin,
          coins: result.coins,
          distance: result.distance,
          score: result.score,
          durationMs: result.durationMs,
          endReason: result.endReason,
          isNewPersonalRecord: false,
          globalRank: snapshotUser.rank ?? null,
          confirmedByServer: false,
        });
        lifecycle.completeResult(expectedRunId, `${retriable ? 'queued_offline' : 'rejected_server'}:${endReason}`);
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const engineCallbacksRef = useRef({
    handleSkateConsumption,
    handleSoloGameOver,
    sendMultiplayerSync,
  });
  engineCallbacksRef.current = {
    handleSkateConsumption,
    handleSoloGameOver,
    sendMultiplayerSync,
  };

  const handleRetrySyncSummary = useCallback(async () => {
    const payload = lastFinishPayloadRef.current;
    if (!payload) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitMatchFinishWithRetry(payload, 2);
      lastFinishPayloadRef.current = null;
      const confirmedSummary: MatchSummary = { ...res.summary, confirmedByServer: true };
      setSummary(confirmedSummary);
      if (onUserPatchRef.current) {
        onUserPatchRef.current({
          ...(confirmedSummary.isNewPersonalRecord && confirmedSummary.mode === 'no_coin'
            ? { bestNoCoinTimeMs: confirmedSummary.noCoinTimeMs }
            : {}),
          rank: confirmedSummary.globalRank,
        });
      }
    } catch (err) {
      if (!isRetriableMatchError(err)) {
        lastFinishPayloadRef.current = null;
      }
      setSubmitError(err instanceof Error ? err.message : 'Erro ao sincronizar partida.');
    } finally {
      setSubmitting(false);
    }
  }, []);

  // Main Engine Lifecycle (Solo or Multiplayer) — strictly keyed to [runKey, user.id, multiplayerSession?.room.id]
  // so incidental App re-renders, user profile patches, resizes, fullscreen, or broadcasts NEVER restart an active run.
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const launch = latestLaunchPropsRef.current;
    const lifecycle = lifecycleRef.current!;
    const runMode = launch.multiplayerSession ? launch.multiplayerSession.room.mode : launch.soloMode;
    const runMap = launch.multiplayerSession?.room.mapId || launch.mapId;
    const { started, runInstanceId: myRunId } = lifecycle.beginRun({
      mode: runMode,
      mapId: runMap,
      skinId: launch.skinId,
      caller: `GameView.useEffect(runKey=${runKey})`,
    });
    if (!started) {
      return;
    }

    let cancelled = false;
    coinEventSentRef.current = false;
    crashEventSentRef.current = false;
    matchTokenRef.current = null;
    matchStartPromiseRef.current = null;
    lastFinishPayloadRef.current = null;
    setPaused(false);
    setSummary(null);
    setSubmitError(null);
    setCoopSpectating(false);

    const activeUser = latestUserRef.current;
    const activeSkateId = activeUser.equippedSkateId ?? null;
    const activeSkateCharges = activeSkateId
      ? activeUser.skateInventory?.find((i) => i.skateId === activeSkateId)?.charges ?? 0
      : 0;

    setHud({
      noCoinTimeMs: 0,
      coinFrozen: false,
      coins: 0,
      distance: 0,
      score: 0,
      policeActive: false,
      policeRemainingSec: 0,
      collisionCount: 0,
      speedState: 'normal',
      activePowerUps: [],
      speedKmh: 40,
      equippedSkateId: activeSkateId,
      skateChargesRemaining: activeSkateCharges,
      skateActive: false,
      skateRemainingSec: 0,
    });

    void flushPendingMatchFinishes();

    if (launch.multiplayerSession) {
      const mp = launch.multiplayerSession;
      const room = mp.room;
      const participants = mp.participants;
      const opponent = participants.find((p) => p.userId !== launch.userId);
      const isHost = room.hostUserId === launch.userId;
      const initialServerNow = Date.now() + clockOffsetRef.current;
      const stillCountingDown = Boolean(room.startedAt && initialServerNow < room.startedAt);

      telemetryFilterRef.current.reset();
      pendingImmediateRef.current = false;

      const engine = new RunnerEngine({
        container,
        mapId: room.mapId,
        skinId: launch.skinId,
        quality: launch.quality,
        customConfig: activeUser.customCharacterConfig,
        capeConfig: activeUser.capeConfig,
        equippedSkateId: activeSkateId,
        skateCharges: activeSkateCharges,
        onSkateActivated: (sId, seq) => engineCallbacksRef.current.handleSkateConsumption(sId, seq),
        onEngineError: (source, error) => lifecycle.recordError(source, error),
        onHudUpdate: (snapshot) => {
          if (!cancelled && lifecycle.getRunInstanceId() === myRunId) setHud(snapshot);
        },
        onGameOver: () => {
          // Collision while slow triggers server loss/adjudication
          if (!cancelled && !crashEventSentRef.current && lifecycle.getRunInstanceId() === myRunId) {
            crashEventSentRef.current = true;
            void engineCallbacksRef.current.sendMultiplayerSync(room.id, { type: 'crashed' }, true);
          }
        },
        multiplayer: {
          mode: room.mode,
          seed: room.seed,
          isHost,
          opponentNickname: opponent?.nickname || 'Adversário',
          opponentSkin: opponent?.skinId || 'ratao',
          opponentCustomConfig: opponent?.customConfig,
          opponentCapeConfig: opponent?.capeConfig,
          opponentEquippedSkateId: opponent?.equippedSkateId,
          frozenAtStart: stillCountingDown,
          onDiscreteAction: () => {
            if (!cancelled) {
              void engineCallbacksRef.current.sendMultiplayerSync(room.id, undefined, true);
            }
          },
          onCoinCollected: (coinZ, coinLane) => {
            if (!cancelled && room.mode === 'x1' && !coinEventSentRef.current) {
              coinEventSentRef.current = true;
              void engineCallbacksRef.current.sendMultiplayerSync(
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
                void engineCallbacksRef.current.sendMultiplayerSync(room.id, { type: 'crashed' }, true);
              }
            }
          },
        },
      });
      engineRef.current = engine;
      lifecycle.transition('JOGANDO', 'multiplayer_engine_started', myRunId);
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
          void engineCallbacksRef.current.sendMultiplayerSync(room.id);
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
        if (lifecycle.getRunInstanceId() === myRunId) {
          lifecycle.exitToMenu('multiplayer_effect_cleanup');
        }
      };
    }

    // Standard Solo Mode (Normal & No Coin)
    const engine = new RunnerEngine({
      container,
      mapId: launch.mapId,
      skinId: launch.skinId,
      quality: launch.quality,
      soloMode: launch.soloMode,
      customConfig: activeUser.customCharacterConfig,
      capeConfig: activeUser.capeConfig,
      equippedSkateId: activeSkateId,
      skateCharges: activeSkateCharges,
      onSkateActivated: (sId, seq) => engineCallbacksRef.current.handleSkateConsumption(sId, seq),
      onPausedChange: (nextPaused, source) => {
        if (cancelled || lifecycle.getRunInstanceId() !== myRunId) return;
        setPaused(nextPaused);
        if (nextPaused) {
          lifecycle.transition('PAUSADO', source, myRunId);
        } else {
          lifecycle.transition('JOGANDO', source, myRunId);
        }
      },
      onEngineError: (source, error) => lifecycle.recordError(source, error),
      onHudUpdate: (snapshot) => {
        if (!cancelled && lifecycle.getRunInstanceId() === myRunId) setHud(snapshot);
      },
      onGameOver: (res) => {
        if (!cancelled && lifecycle.getRunInstanceId() === myRunId) {
          void engineCallbacksRef.current.handleSoloGameOver(res, myRunId);
        }
      },
    });
    engineRef.current = engine;

    let bgRetryTimer: number | null = null;
    let bgRetryInFlight = false;
    let bgAttempts = 0;

    const tryAcquireStartToken = async (reason: string) => {
      if (matchTokenRef.current) {
        return matchTokenRef.current;
      }
      try {
        const tok = await api.startMatch(launch.mapId, launch.skinId, launch.soloMode);
        if (cancelled || lifecycle.getRunInstanceId() !== myRunId) {
          lifecycle.recordUnexpectedResetAttempt(
            'tryAcquireStartToken',
            `Ignored delayed startMatch token=${tok.matchId} from ${reason}`
          );
          return null;
        }
        if (matchTokenRef.current) {
          return matchTokenRef.current;
        }
        const bound = { matchId: tok.matchId, signature: tok.signature };
        matchTokenRef.current = bound;
        lifecycle.bindServerMatchId(myRunId, tok.matchId);
        if (reason !== 'initial_start') {
          lifecycle.recordReconnect(
            `Acquired start token in background (${reason}) while preserving active run`
          );
        }
        return bound;
      } catch (err) {
        lifecycle.recordError(`startMatch_${reason}`, err);
        return null;
      }
    };

    const scheduleBackgroundTokenRecovery = () => {
      if (cancelled || matchTokenRef.current || lifecycle.getRunInstanceId() !== myRunId) return;
      if (bgAttempts >= 5 || !lifecycle.isActiveMatchPhase()) return;
      const delayMs = Math.min(10000, 2000 * Math.pow(1.5, bgAttempts));
      bgAttempts += 1;
      bgRetryTimer = window.setTimeout(async () => {
        if (cancelled || matchTokenRef.current || bgRetryInFlight) return;
        bgRetryInFlight = true;
        const tok = await tryAcquireStartToken(`bg_retry_${bgAttempts}`);
        bgRetryInFlight = false;
        if (!tok && !cancelled && !matchTokenRef.current) {
          scheduleBackgroundTokenRecovery();
        }
      }, delayMs);
    };

    const onBrowserOnline = () => {
      if (cancelled || lifecycle.getRunInstanceId() !== myRunId) return;
      lifecycle.recordReconnect('Browser online event detected during active match; preserving run');
      if (!matchTokenRef.current && !bgRetryInFlight) {
        bgRetryInFlight = true;
        void tryAcquireStartToken('browser_online').finally(() => {
          bgRetryInFlight = false;
        });
      }
      void flushPendingMatchFinishes();
    };
    window.addEventListener('online', onBrowserOnline);

    const startPromise = tryAcquireStartToken('initial_start');
    matchStartPromiseRef.current = startPromise;
    let engineBooted = false;
    const bootSoloEngine = () => {
      if (engineBooted || cancelled || lifecycle.getRunInstanceId() !== myRunId) return;
      engineBooted = true;
      lifecycle.transition('JOGANDO', 'solo_engine_started', myRunId);
      engine.start();
    };

    const bootWaitTimer = window.setTimeout(bootSoloEngine, 1500);
    void startPromise.finally(() => {
      window.clearTimeout(bootWaitTimer);
      bootSoloEngine();
      if (!cancelled && lifecycle.getRunInstanceId() === myRunId && !matchTokenRef.current) {
        scheduleBackgroundTokenRecovery();
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(bootWaitTimer);
      if (bgRetryTimer !== null) window.clearTimeout(bgRetryTimer);
      window.removeEventListener('online', onBrowserOnline);
      engine.dispose();
      engineRef.current = null;
      if (lifecycle.getRunInstanceId() === myRunId) {
        lifecycle.exitToMenu('solo_effect_cleanup');
      }
    };
  }, [runKey, user.id, multiplayerSession?.room.id]);

  // Esc key to pause/resume (Solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    const onKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl?.closest('[data-admin-overlay="true"]')) return;
      if (e.code === 'Escape' && !summary) {
        const currentPaused = lifecycleRef.current?.getPhase() === 'PAUSADO';
        engineRef.current?.setPaused(!currentPaused, 'esc_key');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [summary, isMultiplayer]);

  const togglePause = () => {
    if (summary || isMultiplayer) return;
    const next = !paused;
    engineRef.current?.setPaused(next, 'hud_pause_button');
  };

  const toggleMute = () => {
    gameAudio.muted = !muted;
    setMuted(gameAudio.muted);
  };

  const handleRestart = () => {
    if (isMultiplayer) return;
    const lifecycle = lifecycleRef.current!;
    const reason = summary ? 'user_gameover_retry' : 'user_pause_restart';
    const check = lifecycle.requestRestart(reason);
    if (!check.allowed) return;
    gameAudio.playUiClick();
    setRunKey((k) => k + 1);
  };

  const handleLeaveMultiplayer = async () => {
    if (mpRoom) {
      await api.multiplayer.leaveRoom(mpRoom.id).catch(() => {});
    }
    lifecycleRef.current?.exitToMenu('user_leave_multiplayer');
    onExitToMenuRef.current();
  };

  const handleExitSoloToMenu = () => {
    lifecycleRef.current?.exitToMenu('user_exit_solo');
    onExitToMenuRef.current();
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
                  onClick={(e) => {
                    e.currentTarget.blur();
                    void onToggleFullscreen();
                  }}
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
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMobileMode();
                  }}
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
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowTouchButtons((v) => !v);
                }}
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

              {liveTexts.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setLiveOverlayEnabled((v) => !v);
                  }}
                  title={liveOverlayEnabled ? 'Ocultar overlay Modo Live' : 'Mostrar overlay Modo Live'}
                  aria-label="Alternar Modo Live"
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border transition cursor-pointer flex items-center justify-center gap-1 text-xs font-bold ${
                    liveOverlayEnabled
                      ? 'bg-rose-600/90 border-rose-400 text-white'
                      : 'bg-slate-950/90 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  {!mobileMode && <span className="hidden xl:inline">LIVE</span>}
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  toggleMute();
                }}
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
                  onClick={(e) => {
                    e.currentTarget.blur();
                    togglePause();
                  }}
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

        {/* Bottom Area: Skate Activation Badge + Ergonomic Thumb Arcade Controls */}
        <div className="flex flex-col gap-2">
          {hud.equippedSkateId &&
            (hud.skateChargesRemaining > 0 || hud.skateActive) &&
            !paused &&
            !summary &&
            !mpFinished &&
            !coopSpectating && (
              <div className="flex justify-center pointer-events-auto">
                <button
                  type="button"
                  disabled={hud.skateActive}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerHaptic();
                    engineRef.current?.activateSkate();
                  }}
                  onClick={() => engineRef.current?.activateSkate()}
                  className={`min-h-[44px] px-4 py-2 rounded-xl border-2 shadow-xl flex items-center gap-2.5 transition touch-none ${
                    hud.skateActive
                      ? 'bg-emerald-950/95 border-emerald-400 text-emerald-200 cursor-default'
                      : 'bg-slate-950/95 border-amber-400 hover:bg-slate-900 text-white cursor-pointer active:scale-95'
                  }`}
                >
                  <ShieldCheck
                    className={`w-4 h-4 shrink-0 ${
                      hud.skateActive ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  />
                  <div className="text-left leading-tight">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide">
                      {getSkateDefinition(hud.equippedSkateId).name}
                    </div>
                    <div className="text-[10px] font-mono-num text-slate-300">
                      {hud.skateActive
                        ? `ESCUDO ATIVO · ${hud.skateRemainingSec.toFixed(1)}s`
                        : `${hud.skateChargesRemaining}x · ${
                            mobileMode ? '2x TOQUE ou TOQUE AQUI' : 'ESPAÇO ou CLIQUE'
                          }`}
                    </div>
                  </div>
                </button>
              </div>
            )}

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
                  ? 'Deslize para lados/cima/baixo · 2x toque ativa Skate · Ícone de controle para botões'
                  : 'A/D ou ←/→ Faixas · ↑ Pular · Espaço Skate/Pular · S/↓ Deslizar'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Personal Live Mode Text Overlay (strictly non-blocking, personal only) */}
      {liveOverlayEnabled && liveTexts.length > 0 && (() => {
        const currentLive = liveTexts[liveTextIdx % liveTexts.length];
        if (!currentLive) return null;
        const posClassMap: Record<LiveOverlayPosition, string> = {
          top_left: 'top-20 left-4 items-start text-left',
          top_center: 'top-24 left-1/2 -translate-x-1/2 items-center text-center',
          top_right: 'top-20 right-4 items-end text-right',
          center_left: 'top-1/2 -translate-y-1/2 left-4 items-start text-left',
          center_right: 'top-1/2 -translate-y-1/2 right-4 items-end text-right',
          bottom_left: 'bottom-24 left-4 items-start text-left',
          bottom_center: 'bottom-24 left-1/2 -translate-x-1/2 items-center text-center',
          bottom_right: 'bottom-24 right-4 items-end text-right',
        };
        const fontClass =
          currentLive.fontFamily === 'display'
            ? 'font-display font-extrabold'
            : currentLive.fontFamily === 'mono'
              ? 'font-mono-num font-bold'
              : 'font-sans font-extrabold';
        return (
          <div
            className={`absolute z-20 pointer-events-none flex flex-col max-w-[85vw] sm:max-w-lg transition-all duration-300 ${
              posClassMap[currentLive.position]
            } ${liveVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1.5'}`}
          >
            <div
              className={`${fontClass} px-3.5 py-1.5 rounded-xl bg-slate-950/55 border border-white/15 tracking-wide`}
              style={{
                color: currentLive.color,
                fontSize: `${Math.min(44, Math.max(12, currentLive.fontSize))}px`,
                textShadow: currentLive.shadow ? '0 3px 12px rgba(0,0,0,0.9)' : 'none',
              }}
            >
              {currentLive.text}
            </div>
          </div>
        );
      })()}

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
                onClick={handleExitSoloToMenu}
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
              {summary.mode === 'no_coin' &&
                summary.isNewPersonalRecord &&
                summary.confirmedByServer !== false &&
                !submitError && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-extrabold">
                    <Crown className="w-4 h-4" /> NOVO RECORDE PESSOAL SEM MOEDAS!
                  </div>
                )}
            </div>

            {skinId === 'cristiano_ronaldo' && (
              <div className="h-36 mb-4 rounded-xl overflow-hidden border border-amber-500/40 bg-slate-950 relative">
                <ScenePreview3D
                  skinId={skinId}
                  mapId={effectiveMapId}
                  mode="turntable"
                  quality="low"
                  animState="victory"
                />
                <div className="absolute bottom-2 left-2.5 px-2 py-0.5 rounded bg-slate-950/90 border border-amber-400/60 text-[10px] font-extrabold text-amber-300 pointer-events-none">
                  COMEMORAÇÃO #7
                </div>
              </div>
            )}

            {submitError && (
              <div className="mb-3 px-3 py-2.5 rounded-lg bg-red-950 border border-red-500/50 text-red-200 text-xs flex items-center justify-between gap-2">
                <span>{submitError}</span>
                {lastFinishPayloadRef.current && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleRetrySyncSummary()}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${submitting ? 'animate-spin' : ''}`} />
                    Tentar agora
                  </button>
                )}
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
                      {submitting
                        ? '...'
                        : summary.confirmedByServer === false
                          ? 'Não salvo'
                          : summary.globalRank
                            ? `#${summary.globalRank}`
                            : '—'}
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
                onClick={handleExitSoloToMenu}
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
