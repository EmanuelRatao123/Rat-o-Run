import { ChevronLeft, ChevronRight, Coins, Crown, Medal, Timer, Trophy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import {
  CoinsLeaderboardEntry,
  LeaderboardCategory,
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

const PAGE_SIZE = 20;

export function LeaderboardModal({
  currentUser,
  onInspectPlayer,
  onClose,
}: LeaderboardModalProps) {
  const [category, setCategory] = useState<LeaderboardCategory>('no_coin');
  const [page, setPage] = useState(1);
  const [noCoinEntries, setNoCoinEntries] = useState<LeaderboardEntry[]>([]);
  const [coinEntries, setCoinEntries] = useState<CoinsLeaderboardEntry[]>([]);
  const [currentNoCoinEntry, setCurrentNoCoinEntry] = useState<LeaderboardEntry | null>(null);
  const [currentCoinEntry, setCurrentCoinEntry] = useState<CoinsLeaderboardEntry | null>(null);
  const [totalRanked, setTotalRanked] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getLeaderboard({ category, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        if (category === 'no_coin') {
          setNoCoinEntries(res.entries as LeaderboardEntry[]);
          setCurrentNoCoinEntry(res.currentUserEntry as LeaderboardEntry | null);
        } else {
          setCoinEntries(res.entries as CoinsLeaderboardEntry[]);
          setCurrentCoinEntry(res.currentUserEntry as CoinsLeaderboardEntry | null);
        }
        setTotalRanked(res.totalRanked);
        setTotalPages(Math.max(1, res.totalPages || 1));
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
  }, [category, page]);

  const handleSwitchCategory = (next: LeaderboardCategory) => {
    if (next === category) return;
    setCategory(next);
    setPage(1);
  };

  const leaderNoCoin = page === 1 && category === 'no_coin' ? noCoinEntries[0] : null;
  const leaderCoins = page === 1 && category === 'coins' ? coinEntries[0] : null;
  const currentActiveEntry = category === 'no_coin' ? currentNoCoinEntry : currentCoinEntry;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              RANKING GLOBAL
            </h2>
            <p className="text-xs text-slate-400">
              {category === 'no_coin'
                ? `Modo No Coin · Maior tempo sem pegar moedas · ${totalRanked} jogadores ranqueados`
                : `Modo Normal · Recorde de moedas em 1 partida · ${totalRanked} jogadores ranqueados`}
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

        {/* Category Switcher + Current User Position */}
        <div className="px-5 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSwitchCategory('no_coin')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                category === 'no_coin'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              NO COIN (TEMPO)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchCategory('coins')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                category === 'coins'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              MOEDAS (1 PARTIDA)
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
            <span className="text-slate-400 font-bold">Sua posição:</span>
            <span className="font-mono-num font-extrabold text-emerald-400">
              {currentActiveEntry ? `#${currentActiveEntry.rank}` : 'Não ranqueado'}
            </span>
            {category === 'no_coin' && currentNoCoinEntry && (
              <span className="font-mono-num text-amber-300 font-bold">
                ({formatStopwatch(currentNoCoinEntry.noCoinTimeMs)})
              </span>
            )}
            {category === 'coins' && currentCoinEntry && (
              <span className="font-mono-num text-emerald-300 font-bold">
                ({currentCoinEntry.bestMatchCoins.toLocaleString('pt-BR')} moedas em 1 partida)
              </span>
            )}
          </div>
        </div>

        {/* Leader Highlight Banner (#1) */}
        {!loading && leaderNoCoin && (
          <div className="mx-5 mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-slate-900 border border-amber-400/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300">
                  TOP 1 NO COIN · LÍDER GLOBAL
                </div>
                <button
                  type="button"
                  onClick={() => onInspectPlayer(leaderNoCoin.nickname)}
                  className="font-display text-lg font-bold text-white hover:text-amber-300 transition cursor-pointer"
                >
                  {leaderNoCoin.nickname}
                </button>
                <div className="text-xs text-slate-300">
                  {getSkinDefinition(leaderNoCoin.skinId).name} ·{' '}
                  {MAPS.find((m) => m.id === leaderNoCoin.mapId)?.name || leaderNoCoin.mapId}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-amber-300">MELHOR TEMPO</div>
              <div className="font-mono-num text-2xl sm:text-3xl font-extrabold text-white">
                {formatStopwatch(leaderNoCoin.noCoinTimeMs)}
              </div>
            </div>
          </div>
        )}

        {!loading && leaderCoins && (
          <div className="mx-5 mt-4 p-4 rounded-xl bg-gradient-to-r from-emerald-500/20 via-amber-500/10 to-slate-900 border border-emerald-400/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-300">
                  TOP 1 COLECIONADOR · RECORDE EM 1 PARTIDA
                </div>
                <button
                  type="button"
                  onClick={() => onInspectPlayer(leaderCoins.nickname)}
                  className="font-display text-lg font-bold text-white hover:text-emerald-300 transition cursor-pointer"
                >
                  {leaderCoins.nickname}
                </button>
                <div className="text-xs text-slate-300">
                  {getSkinDefinition(leaderCoins.skinId).name} ·{' '}
                  {MAPS.find((m) => m.id === leaderCoins.mapId)?.name || leaderCoins.mapId}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-emerald-300">
                RECORDE EM 1 PARTIDA
              </div>
              <div className="font-mono-num text-2xl sm:text-3xl font-extrabold text-white flex items-center justify-end gap-2">
                <Coins className="w-6 h-6 text-amber-400" />
                {leaderCoins.bestMatchCoins.toLocaleString('pt-BR')}
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
          ) : category === 'no_coin' ? (
            noCoinEntries.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                Nenhum recorde no Modo No Coin registrado ainda. Jogue no Modo No Coin para disputar o Top 1!
              </div>
            ) : (
              <div className="space-y-2">
                {noCoinEntries.map((entry) => {
                  const isMe = entry.userId === currentUser.id;
                  const skinDef = getSkinDefinition(entry.skinId);
                  return (
                    <div
                      key={entry.userId}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        isMe
                          ? 'bg-emerald-950/40 border-emerald-500/60'
                          : entry.rank === 1
                            ? 'bg-amber-950/30 border-amber-400/70'
                            : entry.rank === 2
                              ? 'bg-slate-800/70 border-slate-400/50'
                              : entry.rank === 3
                                ? 'bg-amber-950/20 border-amber-700/60'
                                : 'bg-slate-950/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono-num font-extrabold text-sm shrink-0 ${
                            entry.rank === 1
                              ? 'bg-amber-400 text-slate-950 shadow'
                              : entry.rank === 2
                                ? 'bg-slate-200 text-slate-950 shadow'
                                : entry.rank === 3
                                  ? 'bg-amber-700 text-white shadow'
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
                            {entry.nickname}{' '}
                            {isMe && <span className="text-emerald-400 text-xs">(Você)</span>}
                          </button>
                          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
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
            )
          ) : coinEntries.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Nenhum recorde de moedas em 1 partida registrado ainda. Jogue no Modo Normal para competir!
            </div>
          ) : (
            <div className="space-y-2">
              {coinEntries.map((entry) => {
                const isMe = entry.userId === currentUser.id;
                const skinDef = getSkinDefinition(entry.skinId);
                return (
                  <div
                    key={entry.userId}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isMe
                        ? 'bg-emerald-950/40 border-emerald-500/60'
                        : entry.rank === 1
                          ? 'bg-amber-950/30 border-amber-400/70'
                          : entry.rank === 2
                            ? 'bg-slate-800/70 border-slate-400/50'
                            : entry.rank === 3
                              ? 'bg-amber-950/20 border-amber-700/60'
                              : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono-num font-extrabold text-sm shrink-0 ${
                          entry.rank === 1
                            ? 'bg-amber-400 text-slate-950 shadow'
                            : entry.rank === 2
                              ? 'bg-slate-200 text-slate-950 shadow'
                              : entry.rank === 3
                                ? 'bg-amber-700 text-white shadow'
                                : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {entry.rank <= 3 ? <Medal className="w-4 h-4" /> : `#${entry.rank}`}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onInspectPlayer(entry.nickname)}
                          className="font-display font-bold text-sm sm:text-base text-white hover:text-emerald-300 truncate block cursor-pointer"
                        >
                          {entry.nickname}{' '}
                          {isMe && <span className="text-emerald-400 text-xs">(Você)</span>}
                        </button>
                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                          <span>{skinDef?.name || entry.skinId}</span>
                          <span>·</span>
                          <span>
                            {MAPS.find((m) => m.id === entry.mapId)?.name || entry.mapId}
                          </span>
                          <span>·</span>
                          <span>{new Date(entry.achievedAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-400" />
                      <span className="font-mono-num font-extrabold text-base sm:text-lg text-emerald-300">
                        {entry.bestMatchCoins.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            Página <strong className="text-white">{page}</strong> de{' '}
            <strong className="text-white">{totalPages}</strong> · {totalRanked} ranqueados
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
