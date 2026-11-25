import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../services/api.ts';
import {
  UserProfile,
  VoiceCallIceConfig,
  VoiceCallRecord,
  VoiceCallSignal,
} from '../shared/constants.ts';

export type VoiceCallUiPhase =
  | 'idle'
  | 'calling'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type MicAccessStatus =
  | 'idle'
  | 'ready'
  | 'muted'
  | 'blocked'
  | 'unavailable';

interface VoiceCallContextValue {
  activeCall: VoiceCallRecord | null;
  incomingInvite: VoiceCallRecord | null;
  inCallFriendIds: string[];
  phase: VoiceCallUiPhase;
  micStatus: MicAccessStatus;
  speakerEnabled: boolean;
  remoteAudioBlocked: boolean;
  errorNotice: string | null;
  connectedAtMs: number | null;
  localLevelRef: React.MutableRefObject<number>;
  remoteLevelRef: React.MutableRefObject<number>;
  startCall: (friendUserId: string, friendNickname: string) => Promise<{ ok: boolean; error?: string }>;
  acceptIncomingCall: (callId?: string) => Promise<void>;
  declineIncomingCall: (callId?: string) => Promise<void>;
  hangupCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  retryMicrophone: () => Promise<void>;
  unlockRemoteAudio: () => void;
  dismissNotice: () => void;
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

export function useVoiceCall(): VoiceCallContextValue {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) {
    throw new Error('useVoiceCall must be used inside VoiceCallProvider');
  }
  return ctx;
}

function classifyMicError(err: unknown): { status: MicAccessStatus; message: string } {
  const name = err && typeof err === 'object' ? String((err as { name?: string }).name || '') : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return {
      status: 'blocked',
      message: 'Permissão de microfone bloqueada pelo navegador. Autorize o uso do microfone nas configurações do site.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      status: 'unavailable',
      message: 'Nenhum microfone disponível foi encontrado neste dispositivo.',
    };
  }
  return {
    status: 'unavailable',
    message: 'Não foi possível acessar o microfone neste navegador.',
  };
}

function computeAnalyserLevel(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const normalized = (buf[i] - 128) / 128;
    sumSq += normalized * normalized;
  }
  const rms = Math.sqrt(sumSq / buf.length);
  return Math.min(1, rms * 4.2);
}

export function VoiceCallProvider({
  user,
  children,
}: {
  user: UserProfile | null;
  children: React.ReactNode;
}) {
  const [activeCall, setActiveCall] = useState<VoiceCallRecord | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<VoiceCallRecord | null>(null);
  const [inCallFriendIds, setInCallFriendIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<VoiceCallUiPhase>('idle');
  const [micStatus, setMicStatus] = useState<MicAccessStatus>('idle');
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [remoteAudioBlocked, setRemoteAudioBlocked] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [connectedAtMs, setConnectedAtMs] = useState<number | null>(null);

  const userRef = useRef(user);
  userRef.current = user;
  const activeCallRef = useRef<VoiceCallRecord | null>(null);
  activeCallRef.current = activeCall;
  const incomingInviteRef = useRef<VoiceCallRecord | null>(null);
  incomingInviteRef.current = incomingInvite;
  const speakerEnabledRef = useRef(speakerEnabled);
  speakerEnabledRef.current = speakerEnabled;
  const micMutedRef = useRef(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const iceConfigCacheRef = useRef<VoiceCallIceConfig | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const lastSignalSeqRef = useRef<number>(0);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const offerSentForCallIdRef = useRef<string | null>(null);
  const makingOfferRef = useRef(false);
  const iceRestartAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const handledTerminalCallIdsRef = useRef<Set<string>>(new Set());

  // AudioContext + Analysers for real speaking indicators
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const localLevelRef = useRef(0);
  const remoteLevelRef = useRef(0);

  const ensureAudioElement = useCallback(() => {
    if (!audioElRef.current && typeof document !== 'undefined') {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.muted = !speakerEnabledRef.current;
      el.volume = speakerEnabledRef.current ? 1 : 0;
      el.style.display = 'none';
      document.body.appendChild(el);
      audioElRef.current = el;
    }
    return audioElRef.current;
  }, []);

  const setupAudioAnalyser = useCallback(
    (stream: MediaStream, kind: 'local' | 'remote') => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        src.connect(analyser);
        // Never connect analyser to ctx.destination to avoid local microphone loopback / echo.
        if (kind === 'local') localAnalyserRef.current = analyser;
        else remoteAnalyserRef.current = analyser;
      } catch {
        // Non-critical if Web Audio API analyser is unavailable
      }
    },
    []
  );

  const teardownMediaAndPeer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // Ignore close errors
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      }
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.srcObject = null;
      } catch {
        // Ignore audio element reset errors
      }
    }
    localAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close().catch(() => {});
      } catch {
        // Ignore AudioContext close error
      }
      audioCtxRef.current = null;
    }
    localLevelRef.current = 0;
    remoteLevelRef.current = 0;
    pendingIceCandidatesRef.current = [];
    processedSignalIdsRef.current.clear();
    lastSignalSeqRef.current = 0;
    offerSentForCallIdRef.current = null;
    makingOfferRef.current = false;
    iceRestartAttemptsRef.current = 0;
    micMutedRef.current = false;
    setRemoteAudioBlocked(false);
    setConnectedAtMs(null);
    setMicStatus('idle');
    setPhase('idle');
  }, []);

  // Remove injected audio element cleanly on unmount
  useEffect(() => {
    return () => {
      teardownMediaAndPeer();
      if (audioElRef.current && audioElRef.current.parentNode) {
        audioElRef.current.parentNode.removeChild(audioElRef.current);
        audioElRef.current = null;
      }
    };
  }, [teardownMediaAndPeer]);

  const fetchIceConfig = useCallback(async (): Promise<VoiceCallIceConfig> => {
    if (iceConfigCacheRef.current) return iceConfigCacheRef.current;
    try {
      const cfg = await api.calls.getIceConfig();
      iceConfigCacheRef.current = cfg;
      return cfg;
    } catch {
      return {
        iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
        inviteTimeoutSec: 30,
        hasTurn: false,
      };
    }
  }, []);

  const requestMicrophone = useCallback(async (): Promise<{
    stream: MediaStream | null;
    status: MicAccessStatus;
    errorMessage?: string;
  }> => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      const msg = 'Seu navegador não suporta captura de áudio via WebRTC.';
      setMicStatus('unavailable');
      return { stream: null, status: 'unavailable', errorMessage: msg };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      micMutedRef.current = false;
      setMicStatus('ready');
      setupAudioAnalyser(stream, 'local');
      return { stream, status: 'ready' };
    } catch (err) {
      const classified = classifyMicError(err);
      setMicStatus(classified.status);
      return { stream: null, status: classified.status, errorMessage: classified.message };
    }
  }, [setupAudioAnalyser]);

  const createAndSendOffer = useCallback(
    async (callId: string, pc: RTCPeerConnection, iceRestart = false) => {
      if (makingOfferRef.current) return;
      makingOfferRef.current = true;
      try {
        const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
        await pc.setLocalDescription(offer);
        await api.calls.signal(callId, 'offer', {
          type: offer.type,
          sdp: offer.sdp,
        });
      } finally {
        makingOfferRef.current = false;
      }
    },
    []
  );

  const ensurePeerConnection = useCallback(
    async (call: VoiceCallRecord): Promise<RTCPeerConnection> => {
      if (pcRef.current) return pcRef.current;

      const iceCfg = await fetchIceConfig();
      const pc = new RTCPeerConnection({
        iceServers: iceCfg.iceServers,
      });
      pcRef.current = pc;

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
        }
      } else {
        // Fallback receive-only transceiver so user with blocked mic can still hear friend
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const current = activeCallRef.current;
        if (!current || current.id !== call.id) return;
        const candidateJson = ev.candidate.toJSON();
        void api.calls
          .signal(call.id, 'ice', { candidate: candidateJson })
          .catch(() => {});
      };

      pc.ontrack = (ev) => {
        const streamFromEvent = ev.streams?.[0] || new MediaStream([ev.track]);
        remoteStreamRef.current = streamFromEvent;
        setupAudioAnalyser(streamFromEvent, 'remote');
        const audioEl = ensureAudioElement();
        if (audioEl) {
          audioEl.srcObject = streamFromEvent;
          audioEl.muted = !speakerEnabledRef.current;
          audioEl.volume = speakerEnabledRef.current ? 1 : 0;
          void audioEl
            .play()
            .then(() => setRemoteAudioBlocked(false))
            .catch(() => setRemoteAudioBlocked(true));
        }
      };

      const handleConnState = () => {
        const current = activeCallRef.current;
        if (!current || current.id !== call.id) return;
        const conn = pc.connectionState || pc.iceConnectionState;
        const iceState = pc.iceConnectionState;

        if (conn === 'connected' || iceState === 'connected' || iceState === 'completed') {
          if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          iceRestartAttemptsRef.current = 0;
          setPhase('connected');
          setConnectedAtMs((prev) => prev ?? Date.now());
          return;
        }

        if (conn === 'disconnected' || iceState === 'disconnected' || conn === 'failed' || iceState === 'failed') {
          setPhase('reconnecting');
          if (reconnectTimerRef.current !== null) return;

          const delay = conn === 'failed' || iceState === 'failed' ? 400 : 2500;
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            const liveCall = activeCallRef.current;
            const livePc = pcRef.current;
            const me = userRef.current;
            if (!liveCall || !livePc || !me || liveCall.id !== call.id) return;
            if (livePc.iceConnectionState === 'connected' || livePc.iceConnectionState === 'completed') {
              setPhase('connected');
              return;
            }
            if (iceRestartAttemptsRef.current >= 2) {
              setErrorNotice('Conexão de áudio perdida com seu amigo.');
              teardownMediaAndPeer();
              setActiveCall(null);
              void api.calls.end(call.id, 'ice_failed').catch(() => {});
              return;
            }
            iceRestartAttemptsRef.current += 1;
            if (liveCall.callerUserId === me.id) {
              void createAndSendOffer(call.id, livePc, true).catch(() => {});
            } else {
              void api.calls
                .signal(call.id, 'renegotiate', { reason: 'ice_disconnected' })
                .catch(() => {});
            }
          }, delay);
        }
      };

      pc.oniceconnectionstatechange = handleConnState;
      pc.onconnectionstatechange = handleConnState;

      return pc;
    },
    [createAndSendOffer, ensureAudioElement, fetchIceConfig, setupAudioAnalyser, teardownMediaAndPeer]
  );

  const processIncomingSignals = useCallback(
    async (call: VoiceCallRecord, signals: VoiceCallSignal[]) => {
      if (!signals.length) return;
      const me = userRef.current;
      if (!me) return;

      for (const sig of signals) {
        lastSignalSeqRef.current = Math.max(lastSignalSeqRef.current, sig.seq);
        if (processedSignalIdsRef.current.has(sig.id)) continue;
        processedSignalIdsRef.current.add(sig.id);

        try {
          if (sig.type === 'offer') {
            const sdp = sig.payload?.sdp;
            const sdpType = sig.payload?.type;
            if (typeof sdp !== 'string' || typeof sdpType !== 'string') continue;
            const pc = await ensurePeerConnection(call);
            await pc.setRemoteDescription(
              new RTCSessionDescription({ type: sdpType as RTCSdpType, sdp })
            );
            // Flush queued ICE candidates that arrived before SDP offer
            while (pendingIceCandidatesRef.current.length > 0) {
              const cand = pendingIceCandidatesRef.current.shift()!;
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await api.calls.signal(call.id, 'answer', {
              type: answer.type,
              sdp: answer.sdp,
            });
          } else if (sig.type === 'answer') {
            const sdp = sig.payload?.sdp;
            const sdpType = sig.payload?.type;
            if (typeof sdp !== 'string' || typeof sdpType !== 'string') continue;
            const pc = pcRef.current;
            if (!pc) continue;
            if (pc.signalingState !== 'have-local-offer') continue;
            await pc.setRemoteDescription(
              new RTCSessionDescription({ type: sdpType as RTCSdpType, sdp })
            );
            while (pendingIceCandidatesRef.current.length > 0) {
              const cand = pendingIceCandidatesRef.current.shift()!;
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          } else if (sig.type === 'ice') {
            const rawCand = sig.payload?.candidate as RTCIceCandidateInit | undefined;
            if (!rawCand || typeof rawCand !== 'object') continue;
            const pc = pcRef.current;
            if (!pc || !pc.remoteDescription) {
              pendingIceCandidatesRef.current.push(rawCand);
            } else {
              await pc.addIceCandidate(new RTCIceCandidate(rawCand)).catch(() => {});
            }
          } else if (sig.type === 'renegotiate') {
            const pc = pcRef.current;
            if (pc && call.callerUserId === me.id) {
              await createAndSendOffer(call.id, pc, true);
            }
          }
        } catch {
          // Transient SDP/ICE error handled on reconnect
        }
      }
    },
    [createAndSendOffer, ensurePeerConnection]
  );

  // Speaking level animation ref loop (no React re-renders!)
  useEffect(() => {
    if (!activeCall) {
      localLevelRef.current = 0;
      remoteLevelRef.current = 0;
      return;
    }

    const localBuf = new Uint8Array(new ArrayBuffer(128));
    const remoteBuf = new Uint8Array(new ArrayBuffer(128));
    let rafId = 0;

    const sample = () => {
      if (localAnalyserRef.current && !micMutedRef.current) {
        const raw = computeAnalyserLevel(localAnalyserRef.current, localBuf);
        localLevelRef.current = localLevelRef.current * 0.65 + raw * 0.35;
      } else {
        localLevelRef.current *= 0.7;
      }

      if (remoteAnalyserRef.current && speakerEnabledRef.current) {
        const raw = computeAnalyserLevel(remoteAnalyserRef.current, remoteBuf);
        remoteLevelRef.current = remoteLevelRef.current * 0.65 + raw * 0.35;
      } else {
        remoteLevelRef.current *= 0.7;
      }

      rafId = window.requestAnimationFrame(sample);
    };

    rafId = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeCall?.id]);

  // Adaptive Serverless Signaling Poll Loop
  useEffect(() => {
    if (!user) {
      teardownMediaAndPeer();
      setActiveCall(null);
      setIncomingInvite(null);
      setInCallFriendIds([]);
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      const currentCall = activeCallRef.current;
      try {
        const state = await api.calls.getState(
          currentCall?.id,
          currentCall ? lastSignalSeqRef.current : 0
        );
        if (cancelled) return;

        setInCallFriendIds(state.inCallFriendIds || []);
        setIncomingInvite(state.incomingInvite || null);

        if (state.activeCall) {
          const call = state.activeCall;
          setActiveCall(call);

          if (call.status === 'ringing') {
            setPhase('calling');
          } else if (call.status === 'accepted') {
            setPhase((prev) =>
              prev === 'connected' || prev === 'reconnecting' ? prev : 'connecting'
            );
            // Caller initiates SDP offer as soon as callee accepts
            if (
              call.callerUserId === user.id &&
              offerSentForCallIdRef.current !== call.id
            ) {
              offerSentForCallIdRef.current = call.id;
              const pc = await ensurePeerConnection(call);
              await createAndSendOffer(call.id, pc, false);
            } else if (call.calleeUserId === user.id && !pcRef.current) {
              await ensurePeerConnection(call);
            }
          }

          if (state.signals.length > 0) {
            await processIncomingSignals(call, state.signals);
          }
        } else {
          // If we had an active call and it ended/declined/timed out remotely
          if (currentCall) {
            teardownMediaAndPeer();
            setActiveCall(null);
            const terminal = state.recentTerminalCall;
            if (terminal && !handledTerminalCallIdsRef.current.has(terminal.id)) {
              handledTerminalCallIdsRef.current.add(terminal.id);
              const peerName =
                terminal.callerUserId === user.id
                  ? terminal.calleeNickname
                  : terminal.callerNickname;
              if (terminal.status === 'declined') {
                setErrorNotice(`${peerName} recusou a chamada.`);
              } else if (terminal.status === 'missed') {
                setErrorNotice(`${peerName} não atendeu a chamada.`);
              } else if (terminal.endReason === 'timeout') {
                setErrorNotice(`Chamada com ${peerName} encerrada por tempo limite.`);
              } else if (terminal.endReason !== 'cancelled' && terminal.endReason !== 'hangup') {
                setErrorNotice(`Chamada com ${peerName} encerrada.`);
              } else {
                setErrorNotice(`${peerName} encerrou a chamada.`);
              }
            }
          }
        }
      } catch {
        // Transient network hiccup — next poll recovers automatically
      }

      if (cancelled) return;
      const liveCall = activeCallRef.current;
      let nextDelay = 3000;
      if (liveCall) {
        nextDelay =
          liveCall.status === 'ringing' || !pcRef.current || pcRef.current.iceConnectionState !== 'connected'
            ? 700
            : 3200;
      } else if (incomingInviteRef.current) {
        nextDelay = 1200;
      }
      timerId = window.setTimeout(() => void poll(), nextDelay);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [
    user?.id,
    createAndSendOffer,
    ensurePeerConnection,
    processIncomingSignals,
    teardownMediaAndPeer,
  ]);

  // Clean hardware release and server call cleanup on tab close / pagehide
  useEffect(() => {
    const onUnload = () => {
      const live = activeCallRef.current;
      if (live && (live.status === 'ringing' || live.status === 'accepted')) {
        api.calls.endKeepalive(live.id, 'pagehide');
      }
      teardownMediaAndPeer();
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [teardownMediaAndPeer]);

  const startCall = useCallback(
    async (
      friendUserId: string,
      _friendNickname: string
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!userRef.current) {
        return { ok: false, error: 'Faça login para iniciar uma chamada.' };
      }
      if (activeCallRef.current) {
        const msg = 'Você já está em uma chamada ativa.';
        setErrorNotice(msg);
        return { ok: false, error: msg };
      }

      setErrorNotice(null);
      const mic = await requestMicrophone();
      if (!mic.stream) {
        const msg = mic.errorMessage || 'Microfone indisponível.';
        setErrorNotice(msg);
        return { ok: false, error: msg };
      }

      try {
        const res = await api.calls.invite(friendUserId);
        lastSignalSeqRef.current = 0;
        processedSignalIdsRef.current.clear();
        offerSentForCallIdRef.current = null;
        setActiveCall(res.call);
        setPhase('calling');
        return { ok: true };
      } catch (err) {
        teardownMediaAndPeer();
        const msg = err instanceof Error ? err.message : 'Não foi possível iniciar a chamada.';
        setErrorNotice(msg);
        return { ok: false, error: msg };
      }
    },
    [requestMicrophone, teardownMediaAndPeer]
  );

  const acceptIncomingCall = useCallback(
    async (callId?: string) => {
      const invite = incomingInviteRef.current;
      const targetCallId = callId || invite?.id;
      if (!targetCallId) return;

      setErrorNotice(null);
      // Explicit user action ("ACEITAR") -> request microphone (with listen-only fallback if blocked)
      const mic = await requestMicrophone();
      if (!mic.stream && mic.errorMessage) {
        setErrorNotice(`${mic.errorMessage} Conectando apenas para ouvir.`);
      }

      try {
        const res = await api.calls.respond(targetCallId, 'accept');
        lastSignalSeqRef.current = 0;
        processedSignalIdsRef.current.clear();
        setIncomingInvite(null);
        setActiveCall(res.call);
        setPhase('connecting');
        await ensurePeerConnection(res.call);
      } catch (err) {
        teardownMediaAndPeer();
        setIncomingInvite(null);
        const msg = err instanceof Error ? err.message : 'Não foi possível aceitar a chamada.';
        setErrorNotice(msg);
      }
    },
    [ensurePeerConnection, requestMicrophone, teardownMediaAndPeer]
  );

  const declineIncomingCall = useCallback(async (callId?: string) => {
    const targetCallId = callId || incomingInviteRef.current?.id;
    if (!targetCallId) return;
    handledTerminalCallIdsRef.current.add(targetCallId);
    setIncomingInvite(null);
    await api.calls.respond(targetCallId, 'decline').catch(() => {});
  }, []);

  const hangupCall = useCallback(async () => {
    const live = activeCallRef.current;
    if (!live) {
      teardownMediaAndPeer();
      return;
    }
    handledTerminalCallIdsRef.current.add(live.id);
    teardownMediaAndPeer();
    setActiveCall(null);
    if (live.status === 'ringing') {
      await api.calls.respond(live.id, 'cancel').catch(() => {});
    } else {
      await api.calls.end(live.id, 'hangup').catch(() => {});
    }
  }, [teardownMediaAndPeer]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const nextMuted = !micMutedRef.current;
    micMutedRef.current = nextMuted;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setMicStatus(nextMuted ? 'muted' : 'ready');
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerEnabledRef.current;
    speakerEnabledRef.current = next;
    setSpeakerEnabled(next);
    const el = audioElRef.current;
    if (el) {
      el.muted = !next;
      el.volume = next ? 1 : 0;
      if (next && el.srcObject) {
        void el
          .play()
          .then(() => setRemoteAudioBlocked(false))
          .catch(() => setRemoteAudioBlocked(true));
      }
    }
  }, []);

  const unlockRemoteAudio = useCallback(() => {
    const el = audioElRef.current;
    if (el && el.srcObject) {
      el.muted = !speakerEnabledRef.current;
      el.volume = speakerEnabledRef.current ? 1 : 0;
      void el
        .play()
        .then(() => setRemoteAudioBlocked(false))
        .catch(() => setRemoteAudioBlocked(true));
    }
  }, []);

  const retryMicrophone = useCallback(async () => {
    const mic = await requestMicrophone();
    if (!mic.stream) {
      if (mic.errorMessage) setErrorNotice(mic.errorMessage);
      return;
    }
    setErrorNotice(null);
    const pc = pcRef.current;
    const liveCall = activeCallRef.current;
    if (pc && liveCall) {
      const audioTrack = mic.stream.getAudioTracks()[0];
      if (audioTrack) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio' || !s.track);
        if (sender) {
          await sender.replaceTrack(audioTrack).catch(() => {});
        } else {
          pc.addTrack(audioTrack, mic.stream);
        }
        if (liveCall.callerUserId === userRef.current?.id) {
          await createAndSendOffer(liveCall.id, pc, false).catch(() => {});
        } else {
          await api.calls
            .signal(liveCall.id, 'renegotiate', { reason: 'mic_enabled' })
            .catch(() => {});
        }
      }
    }
  }, [createAndSendOffer, requestMicrophone]);

  const dismissNotice = useCallback(() => {
    setErrorNotice(null);
  }, []);

  const value = useMemo<VoiceCallContextValue>(
    () => ({
      activeCall,
      incomingInvite,
      inCallFriendIds,
      phase,
      micStatus,
      speakerEnabled,
      remoteAudioBlocked,
      errorNotice,
      connectedAtMs,
      localLevelRef,
      remoteLevelRef,
      startCall,
      acceptIncomingCall,
      declineIncomingCall,
      hangupCall,
      toggleMute,
      toggleSpeaker,
      retryMicrophone,
      unlockRemoteAudio,
      dismissNotice,
    }),
    [
      activeCall,
      incomingInvite,
      inCallFriendIds,
      phase,
      micStatus,
      speakerEnabled,
      remoteAudioBlocked,
      errorNotice,
      connectedAtMs,
      startCall,
      acceptIncomingCall,
      declineIncomingCall,
      hangupCall,
      toggleMute,
      toggleSpeaker,
      retryMicrophone,
      unlockRemoteAudio,
      dismissNotice,
    ]
  );

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
}
