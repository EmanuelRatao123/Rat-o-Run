import { BarChart3, CheckCircle2, Clock, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.ts';
import { PollItem } from '../shared/constants.ts';

interface LivePollOverlayProps {
  polls: PollItem[];
  onPollsUpdated: (updater: (prev: PollItem[]) => PollItem[]) => void;
}

export function LivePollOverlay({ polls, onPollsUpdated }: LivePollOverlayProps) {
  const sessionStartRef = useRef<number>(Date.now());
  const seenInSessionRef = useRef<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});
  const [votingOption, setVotingOption] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Track polls that were active at any time during this client session so we can display final result on end
  useEffect(() => {
    const now = Date.now();
    for (const p of polls) {
      const exp = new Date(p.expiresAt).getTime();
      if ((p.active && exp > now) || exp >= sessionStartRef.current - 5000) {
        seenInSessionRef.current.add(p.id);
      }
    }
  }, [polls]);

  const targetPoll = useMemo(() => {
    // 1. Prefer any currently active poll that user has not dismissed
    const active = polls.find((p) => {
      const exp = new Date(p.expiresAt).getTime();
      return p.active && exp > nowMs && !dismissedIds[p.id];
    });
    if (active) return active;

    // 2. Or show recently ended poll from THIS session (for up to 15s after expiration)
    const recentlyEnded = polls.find((p) => {
      if (!seenInSessionRef.current.has(p.id) || dismissedIds[p.id]) return false;
      const exp = new Date(p.expiresAt).getTime();
      const closedRecently = !p.active || exp <= nowMs;
      return closedRecently && nowMs - exp < 18000;
    });
    return recentlyEnded || null;
  }, [polls, nowMs, dismissedIds]);

  useEffect(() => {
    setErrorMsg(null);
    setVotingOption(null);
  }, [targetPoll?.id]);

  if (!targetPoll) return null;

  const expiresMs = new Date(targetPoll.expiresAt).getTime();
  const remainingSec = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  const isClosed = !targetPoll.active || remainingSec === 0;
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;

  let maxVotes = -1;
  for (const o of targetPoll.options) {
    if (o.votes > maxVotes) maxVotes = o.votes;
  }

  const handleVote = async (optionIndex: number) => {
    if (isClosed || targetPoll.userVotedIndex !== null || votingOption !== null) return;
    setVotingOption(optionIndex);
    setErrorMsg(null);
    try {
      const res = await api.votePoll(targetPoll.id, optionIndex);
      onPollsUpdated((prev) => prev.map((p) => (p.id === res.poll.id ? res.poll : p)));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao registrar voto.');
    } finally {
      setVotingOption(null);
    }
  };

  return (
    <div className="fixed right-3 bottom-24 sm:right-5 sm:bottom-6 z-30 w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl bg-slate-950/95 border-2 border-indigo-400/75 shadow-2xl p-4 text-left">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
              {isClosed ? 'Votação Encerrada' : 'Enquete Ao Vivo'}
            </div>
            <div className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              {isClosed
                ? `${targetPoll.totalVotes} votos totais`
                : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} · ${targetPoll.totalVotes} votos`}
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissedIds((prev) => ({ ...prev, [targetPoll.id]: true }))}
          aria-label="Minimizar enquete"
          className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-sm sm:text-base font-black text-white mb-3 leading-snug">
        {targetPoll.title}
      </div>

      {errorMsg && (
        <div className="mb-2 text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/40 rounded-lg px-2.5 py-1.5">
          {errorMsg}
        </div>
      )}

      <div className="space-y-1.5">
        {targetPoll.options.map((opt) => {
          const picked = targetPoll.userVotedIndex === opt.index;
          const isWinner = isClosed && maxVotes > 0 && opt.votes === maxVotes;
          const canVote = !isClosed && targetPoll.userVotedIndex === null && votingOption === null;

          return (
            <button
              key={opt.index}
              disabled={!canVote}
              onClick={() => void handleVote(opt.index)}
              className={`w-full relative overflow-hidden rounded-xl border px-3 py-2 text-left transition ${
                picked
                  ? 'border-emerald-400 bg-emerald-500/15'
                  : isWinner
                    ? 'border-amber-400 bg-amber-500/15'
                    : canVote
                      ? 'border-slate-700 bg-slate-900 hover:border-indigo-400 cursor-pointer'
                      : 'border-slate-800 bg-slate-900/80'
              }`}
            >
              {(targetPoll.userVotedIndex !== null || isClosed) && (
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                    isWinner
                      ? 'bg-amber-400/20'
                      : picked
                        ? 'bg-emerald-400/20'
                        : 'bg-indigo-500/15'
                  }`}
                  style={{ width: `${opt.percentage}%` }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2 text-xs sm:text-sm font-bold">
                <span className="text-white flex items-center gap-1.5 truncate">
                  {picked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {isWinner && <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                  <span className="truncate">{opt.label}</span>
                </span>
                {(targetPoll.userVotedIndex !== null || isClosed) ? (
                  <span className="text-slate-200 font-black tabular-nums shrink-0">
                    {opt.percentage}% ({opt.votes})
                  </span>
                ) : (
                  <span className="text-[11px] font-black text-indigo-300 shrink-0">
                    {votingOption === opt.index ? '...' : 'VOTAR'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
