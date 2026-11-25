import {
  ChevronDown,
  ChevronUp,
  Headphones,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { UserProfile } from '../shared/constants.ts';
import { MicAccessStatus, VoiceCallUiPhase, useVoiceCall } from './VoiceCallProvider.tsx';

function formatCallDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function VoiceSpeakingIndicator({
  levelRef,
  colorClass,
  active,
  label,
}: {
  levelRef: React.MutableRefObject<number>;
  colorClass: string;
  active: boolean;
  label: string;
}) {
  const bar1Ref = useRef<HTMLSpanElement | null>(null);
  const bar2Ref = useRef<HTMLSpanElement | null>(null);
  const bar3Ref = useRef<HTMLSpanElement | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) {
      if (bar1Ref.current) bar1Ref.current.style.transform = 'scaleY(0.25)';
      if (bar2Ref.current) bar2Ref.current.style.transform = 'scaleY(0.25)';
      if (bar3Ref.current) bar3Ref.current.style.transform = 'scaleY(0.25)';
      if (badgeRef.current) badgeRef.current.style.opacity = '0.55';
      return;
    }

    let rafId = 0;
    const draw = () => {
      const lvl = Math.min(1, Math.max(0, levelRef.current));
      const speaking = lvl > 0.08;
      if (bar1Ref.current) bar1Ref.current.style.transform = `scaleY(${0.25 + lvl * 0.7})`;
      if (bar2Ref.current) bar2Ref.current.style.transform = `scaleY(${0.25 + Math.min(1, lvl * 1.15) * 0.75})`;
      if (bar3Ref.current) bar3Ref.current.style.transform = `scaleY(${0.25 + lvl * 0.6})`;
      if (badgeRef.current) badgeRef.current.style.opacity = speaking ? '1' : '0.65';
      rafId = window.requestAnimationFrame(draw);
    };
    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, [active, levelRef]);

  return (
    <div
      ref={badgeRef}
      className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 transition-opacity"
      title={label}
    >
      <span className="truncate max-w-[74px]">{label}</span>
      <span className="inline-flex items-end gap-0.5 h-3.5" aria-hidden="true">
        <span
          ref={bar1Ref}
          className={`w-1 h-3.5 rounded-sm origin-bottom ${colorClass}`}
          style={{ transform: 'scaleY(0.25)' }}
        />
        <span
          ref={bar2Ref}
          className={`w-1 h-3.5 rounded-sm origin-bottom ${colorClass}`}
          style={{ transform: 'scaleY(0.25)' }}
        />
        <span
          ref={bar3Ref}
          className={`w-1 h-3.5 rounded-sm origin-bottom ${colorClass}`}
          style={{ transform: 'scaleY(0.25)' }}
        />
      </span>
    </div>
  );
}

function phaseLabel(phase: VoiceCallUiPhase, elapsedMs: number): string {
  if (phase === 'calling') return 'Chamando...';
  if (phase === 'connecting') return 'Conectando...';
  if (phase === 'reconnecting') return 'Reconectando...';
  if (phase === 'connected') return `Conectada · ${formatCallDuration(elapsedMs)}`;
  return 'Encerrada';
}

function micStatusHint(micStatus: MicAccessStatus): string | null {
  if (micStatus === 'blocked') return 'Microfone bloqueado';
  if (micStatus === 'unavailable') return 'Sem microfone';
  if (micStatus === 'muted') return 'Microfone mutado';
  return null;
}

export function VoiceCallOverlay({
  user,
  playing,
}: {
  user: UserProfile | null;
  playing: boolean;
}) {
  const {
    activeCall,
    incomingInvite,
    phase,
    micStatus,
    speakerEnabled,
    remoteAudioBlocked,
    errorNotice,
    connectedAtMs,
    localLevelRef,
    remoteLevelRef,
    acceptIncomingCall,
    declineIncomingCall,
    hangupCall,
    toggleMute,
    toggleSpeaker,
    retryMicrophone,
    unlockRemoteAudio,
    dismissNotice,
  } = useVoiceCall();

  const [minimized, setMinimized] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [acceptBusy, setAcceptBusy] = useState(false);

  // Auto-compact widget when entering active gameplay on mobile/desktop without losing controls
  useEffect(() => {
    if (playing) {
      setMinimized(true);
    }
  }, [playing]);

  // 1s clock tick only while activeCall or incomingInvite exists
  useEffect(() => {
    if (!activeCall && !incomingInvite) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeCall?.id, incomingInvite?.id]);

  // Auto-dismiss transient call notices after 5.5s
  useEffect(() => {
    if (!errorNotice) return;
    const id = window.setTimeout(() => dismissNotice(), 5500);
    return () => window.clearTimeout(id);
  }, [errorNotice, dismissNotice]);

  if (!user) return null;

  const peerNickname = activeCall
    ? activeCall.callerUserId === user.id
      ? activeCall.calleeNickname
      : activeCall.callerNickname
    : '';

  const elapsedMs = connectedAtMs ? Math.max(0, nowTick - connectedAtMs) : 0;
  const inviteRemainingSec = incomingInvite
    ? Math.max(0, Math.ceil((new Date(incomingInvite.expiresAt).getTime() - nowTick) / 1000))
    : 0;
  const micHint = micStatusHint(micStatus);
  const micMuted = micStatus === 'muted';
  const micBlocked = micStatus === 'blocked' || micStatus === 'unavailable';

  return (
    <>
      {/* Incoming Call Toast (clear of mobile bottom controls & track center) */}
      {incomingInvite && !activeCall && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:top-20 sm:right-4 z-[70] w-[320px] max-w-[calc(100vw-1.5rem)] bg-slate-950/95 border-2 border-emerald-400 rounded-2xl p-3.5 shadow-2xl space-y-3 pointer-events-auto"
          role="dialog"
          aria-label="Convite de chamada de voz"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-300">
              <PhoneIncoming className="w-4 h-4 animate-bounce shrink-0" />
              CHAMADA DE VOZ
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-mono-num text-[11px] font-bold">
              {inviteRemainingSec}s
            </span>
          </div>

          <div className="text-sm text-slate-200 leading-snug">
            <strong className="text-white">{incomingInvite.callerNickname}</strong> está te chamando para conversar em call.
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={acceptBusy}
              onClick={(e) => {
                e.currentTarget.blur();
                setAcceptBusy(true);
                void acceptIncomingCall(incomingInvite.id).finally(() => setAcceptBusy(false));
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Phone className="w-4 h-4" /> ACEITAR
            </button>
            <button
              type="button"
              disabled={acceptBusy}
              onClick={(e) => {
                e.currentTarget.blur();
                void declineIncomingCall(incomingInvite.id);
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" /> RECUSAR
            </button>
          </div>
        </div>
      )}

      {/* Active Call Compact Floating Widget (works in Menu, Friends, Modals & active GameView) */}
      {activeCall && (
        <div
          className={`fixed z-[65] pointer-events-auto transition-all ${
            playing
              ? 'bottom-24 right-2.5 sm:bottom-5 sm:right-4'
              : 'bottom-4 right-3 sm:bottom-5 sm:right-5'
          }`}
          role="region"
          aria-label="Controle de chamada de voz"
        >
          {minimized ? (
            <div className="bg-slate-950/95 border border-emerald-400/70 rounded-2xl px-3 py-2 shadow-2xl flex items-center gap-2 max-w-[calc(100vw-1.5rem)]">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      phase === 'connected'
                        ? 'bg-emerald-400'
                        : phase === 'reconnecting'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-sky-400 animate-pulse'
                    }`}
                  />
                  <span className="font-display font-bold text-xs text-white truncate max-w-[100px]">
                    {peerNickname}
                  </span>
                </div>
                <div className="text-[10px] font-mono-num text-emerald-300 leading-tight">
                  {phaseLabel(phase, elapsedMs)}
                </div>
              </div>

              <VoiceSpeakingIndicator
                levelRef={remoteLevelRef}
                colorClass="bg-emerald-400"
                active={phase === 'connected'}
                label="Voz"
              />

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  if (micBlocked) void retryMicrophone();
                  else toggleMute();
                }}
                title={micBlocked ? 'Liberar microfone' : micMuted ? 'Ativar microfone' : 'Mutar microfone'}
                aria-label={micMuted ? 'Ativar microfone' : 'Mutar microfone'}
                className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border cursor-pointer flex items-center justify-center ${
                  micBlocked
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : micMuted
                      ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                      : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
                }`}
              >
                {micMuted || micBlocked ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  toggleSpeaker();
                }}
                title={speakerEnabled ? 'Silenciar áudio do amigo' : 'Ativar áudio do amigo'}
                aria-label="Alternar áudio"
                className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border cursor-pointer flex items-center justify-center ${
                  speakerEnabled
                    ? 'bg-slate-800 border-slate-700 text-sky-300 hover:bg-slate-700'
                    : 'bg-rose-500/20 border-rose-400 text-rose-300'
                }`}
              >
                {speakerEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  void hangupCall();
                }}
                title="Encerrar Call"
                aria-label="Encerrar Call"
                className="min-w-[40px] min-h-[40px] p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white cursor-pointer flex items-center justify-center"
              >
                <PhoneOff className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setMinimized(false);
                }}
                title="Expandir painel da call"
                aria-label="Expandir painel da call"
                className="min-w-[36px] min-h-[40px] p-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer flex items-center justify-center"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="w-[300px] max-w-[calc(100vw-1.5rem)] bg-slate-950/95 border border-emerald-400/70 rounded-2xl p-3.5 shadow-2xl space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        phase === 'connected'
                          ? 'bg-emerald-400'
                          : phase === 'reconnecting'
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-sky-400 animate-pulse'
                      }`}
                    />
                    <span className="font-display font-bold text-sm text-white truncate">
                      {peerNickname}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-num text-emerald-300 mt-0.5">
                    {phaseLabel(phase, elapsedMs)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setMinimized(true);
                  }}
                  title="Minimizar"
                  aria-label="Minimizar painel da call"
                  className="min-w-[36px] min-h-[36px] p-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer flex items-center justify-center"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Dual Voice Activity Meters (Zero re-render rAF DOM scaling) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                <VoiceSpeakingIndicator
                  levelRef={localLevelRef}
                  colorClass="bg-sky-400"
                  active={!micMuted && !micBlocked}
                  label="Você"
                />
                <div className="h-4 w-px bg-slate-800" />
                <VoiceSpeakingIndicator
                  levelRef={remoteLevelRef}
                  colorClass="bg-emerald-400"
                  active={phase === 'connected' && speakerEnabled}
                  label={peerNickname}
                />
              </div>

              {/* Microphone Warning / Remote Autoplay Unlock */}
              {micHint && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-[11px] text-amber-200 font-semibold">
                  <span>{micHint}</span>
                  {micBlocked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        void retryMicrophone();
                      }}
                      className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold cursor-pointer"
                    >
                      Tentar Mic
                    </button>
                  )}
                </div>
              )}

              {remoteAudioBlocked && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    unlockRemoteAudio();
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Headphones className="w-3.5 h-3.5" /> Toque para liberar áudio do amigo
                </button>
              )}

              {/* Primary Action Controls */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    if (micBlocked) void retryMicrophone();
                    else toggleMute();
                  }}
                  className={`min-h-[44px] px-2 py-2 rounded-xl border text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
                    micBlocked
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : micMuted
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-slate-900 border-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  {micMuted || micBlocked ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4 text-sky-400" />
                  )}
                  <span>{micBlocked ? 'SEM MIC' : micMuted ? 'MUTADO' : 'MUTE'}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    toggleSpeaker();
                  }}
                  className={`min-h-[44px] px-2 py-2 rounded-xl border text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
                    speakerEnabled
                      ? 'bg-slate-900 border-slate-700 text-white hover:bg-slate-800'
                      : 'bg-rose-500/20 border-rose-400 text-rose-200'
                  }`}
                >
                  {speakerEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4" />
                  )}
                  <span>{speakerEnabled ? 'ÁUDIO' : 'MUDO'}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    void hangupCall();
                  }}
                  className="min-h-[44px] px-2 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 cursor-pointer transition"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>ENCERRAR</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Call Result / Error Notice Toast */}
      {errorNotice && !activeCall && !incomingInvite && (
        <div className="fixed top-20 right-4 z-[68] w-80 max-w-[calc(100vw-2rem)] bg-slate-950/95 border border-amber-400/70 rounded-xl px-3.5 py-2.5 shadow-2xl flex items-center gap-2.5 text-xs text-amber-100 font-semibold pointer-events-auto">
          <PhoneOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="flex-1 leading-snug">{errorNotice}</span>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              dismissNotice();
            }}
            aria-label="Fechar aviso de chamada"
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
