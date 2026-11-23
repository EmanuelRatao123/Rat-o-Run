import { Crown, Medal, Timer, Trophy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import {
  LeaderboardEntry,
  MAPS,
  UserProfile,
  formatStopwatch,
  getSkinDefinition,
} from '../shared/constants.ts';

interface LeaderboardModalProps {
  currentUser: UserProfile;
  onInspectPlayer: (nickname: string) => void;
  onClose: () => void;
}

export function LeaderboardModal({
  currentUser,
  onInspectPlayer,
  onClose,
}: LeaderboardModalProps) {
  const [limit, setLimit] = useState<10 | 50 | 100>(10);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [totalRanked, setTotalRanked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getLeaderboard(limit)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setCurrentUserEntry(res.currentUserEntry);
        setTotalRanked(res.totalRanked);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar ranking.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const leader = entries[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              SEM PEGAR MOEDAS — RANKING GLOBAL
            </h2>
            <p className="text-xs text-slate-400">
              Maior tempo sobrevivido antes de coletar a primeira moeda · {totalRanked} jogadores ranqueados
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

        {/* Top 10 / 50 / 100 Filter & Player Position */}
        <div className="px-5 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {([10, 50, 100] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLimit(tab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  limit === tab
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                TOP {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
            <span className="text-slate-400 font-bold">Sua posição:</span>
            <span className="font-mono-num font-extrabold text-emerald-400">
              {currentUserEntry ? `#${currentUserEntry.rank}` : 'Sem partidas ainda'}
            </span>
            {currentUserEntry && (
              <span className="font-mono-num text-amber-300 font-bold">
                ({formatStopwatch(currentUserEntry.noCoinTimeMs)})
              </span>
            )}
          </div>
        </div>

        {/* Leader Highlight Banner */}
        {leader && !loading && (
          <div className="mx-5 mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-slate-900 border border-amber-400/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300">
                  LÍDER GLOBAL · #1
                </div>
                <button
                  type="button"
                  onClick={() => onInspectPlayer(leader.nickname)}
                  className="font-display text-lg font-bold text-white hover:text-amber-300 transition cursor-pointer"
                >
                  {leader.nickname}
                </button>
                <div className="text-xs text-slate-300">
                  {getSkinDefinition(leader.skinId).name} ·{' '}
                  {MAPS.find((m) => m.id === leader.mapId)?.name || leader.mapId}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-amber-300">TEMPO SEM MOEDAS</div>
              <div className="font-mono-num text-2xl sm:text-3xl font-extrabold text-white">
                {formatStopwatch(leader.noCoinTimeMs)}
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Carregando ranking global...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-300 text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Nenhum recorde registrado ainda. Seja o primeiro a jogar e conquistar o #1!
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => {
                const isMe = entry.userId === currentUser.id;
                const skinDef = getSkinDefinition(entry.skinId);
                return (
                  <div
                    key={entry.userId}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isMe
                        ? 'bg-emerald-950/40 border-emerald-500/60'
                        : entry.rank === 1
                        ? 'bg-amber-950/30 border-amber-500/50'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono-num font-extrabold text-sm shrink-0 ${
                          entry.rank === 1
                            ? 'bg-amber-500 text-slate-950'
                            : entry.rank === 2
                            ? 'bg-slate-300 text-slate-950'
                            : entry.rank === 3
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {entry.rank <= 3 ? <Medal className="w-4 h-4" /> : `#${entry.rank}`}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onInspectPlayer(entry.nickname)}
                          className="font-display font-bold text-sm sm:text-base text-white hover:text-amber-300 truncate block cursor-pointer"
                        >
                          {entry.nickname} {isMe && <span className="text-emerald-400 text-xs">(Você)</span>}
                        </button>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{skinDef?.name || entry.skinId}</span>
                          <span>·</span>
                          <span>{new Date(entry.achievedAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-2">
                      <Timer className="w-4 h-4 text-amber-400 hidden sm:block" />
                      <span className="font-mono-num font-extrabold text-base sm:text-lg text-amber-300">
                        {formatStopwatch(entry.noCoinTimeMs)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
