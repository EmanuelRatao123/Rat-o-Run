import { CheckCircle2, Megaphone, Vote, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api.ts';
import { GlobalMessage, PollItem } from '../shared/constants.ts';

interface PollsAndMessagesModalProps {
  messages: GlobalMessage[];
  polls: PollItem[];
  onPollsUpdated: (polls: PollItem[]) => void;
  onClose: () => void;
}

export function PollsAndMessagesModal({
  messages,
  polls,
  onPollsUpdated,
  onClose,
}: PollsAndMessagesModalProps) {
  const [votingId, setVotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVote = async (pollId: string, optionIndex: number) => {
    setVotingId(pollId);
    setError(null);
    try {
      const res = await api.votePoll(pollId, optionIndex);
      const next = polls.map((p) => (p.id === pollId ? res.poll : p));
      onPollsUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar voto.');
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Vote className="w-5 h-5 text-sky-400" />
              VOTAÇÕES & AVISOS GLOBAIS
            </h2>
            <p className="text-xs text-slate-400">
              Participe das decisões da comunidade e acompanhe comunicados oficiais.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-red-950 border border-red-500/60 text-red-200 text-xs">
              {error}
            </div>
          )}

          {/* Global Messages */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2.5">
              <Megaphone className="w-4 h-4" /> Mensagens Globais ({messages.length})
            </h3>
            {messages.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400">
                Nenhum comunicado global ativo no momento.
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/40"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-display font-bold text-white text-sm">
                        {m.title}
                      </span>
                      <span className="text-[10px] text-indigo-300">
                        Expira {new Date(m.expiresAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-indigo-100">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Polls */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 mb-2.5">
              <Vote className="w-4 h-4" /> Votações ({polls.length})
            </h3>
            {polls.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400">
                Nenhuma votação publicada ainda.
              </div>
            ) : (
              <div className="space-y-4">
                {polls.map((poll) => {
                  const hasVoted = poll.userVotedIndex !== null;
                  const showResults = hasVoted || !poll.active;
                  return (
                    <div
                      key={poll.id}
                      className="p-4 rounded-xl bg-slate-950/80 border border-slate-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h4 className="font-display font-bold text-base text-white">
                          {poll.title}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            poll.active
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {poll.active ? 'ABERTA' : 'ENCERRADA'} · {poll.totalVotes} votos
                        </span>
                      </div>

                      <div className="space-y-2">
                        {poll.options.map((opt) => {
                          const isUserChoice = poll.userVotedIndex === opt.index;
                          return (
                            <button
                              key={opt.index}
                              type="button"
                              disabled={!poll.active || hasVoted || votingId === poll.id}
                              onClick={() => handleVote(poll.id, opt.index)}
                              className={`w-full relative overflow-hidden rounded-xl border p-3 text-left transition ${
                                isUserChoice
                                  ? 'border-sky-400 bg-sky-950/40'
                                  : poll.active && !hasVoted
                                  ? 'border-slate-700 bg-slate-900 hover:border-amber-400 cursor-pointer'
                                  : 'border-slate-800 bg-slate-900/60'
                              }`}
                            >
                              {showResults && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-sky-500/20 transition-all"
                                  style={{ width: `${opt.percentage}%` }}
                                />
                              )}
                              <div className="relative z-10 flex items-center justify-between gap-2 text-sm">
                                <span className="font-semibold text-white flex items-center gap-2">
                                  {isUserChoice && (
                                    <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                                  )}
                                  {opt.label}
                                </span>
                                {showResults && (
                                  <span className="font-mono-num text-xs font-bold text-sky-300">
                                    {opt.percentage}% ({opt.votes})
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
