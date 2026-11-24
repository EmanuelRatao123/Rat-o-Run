import {
  Check,
  Clock,
  Crown,
  Loader2,
  Map as MapIcon,
  Play,
  Search,
  Send,
  Swords,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import {
  FriendEntry,
  MAPS,
  MapId,
  MultiplayerInvite,
  MultiplayerMatchRecord,
  MultiplayerMode,
  MultiplayerParticipant,
  MultiplayerRoom,
  PlayerCompetitiveStats,
  PublicPlayerLookup,
  UserProfile,
  X1ResultRecord,
  formatStopwatch,
  getSkinDefinition,
} from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface MultiplayerModalProps {
  currentUser: UserProfile;
  initialMode: MultiplayerMode;
  selectedMap: MapId;
  initialRoom?: {
    room: MultiplayerRoom;
    participants: MultiplayerParticipant[];
  } | null;
  prefillInvite?: {
    targetNickname: string;
    mode: MultiplayerMode;
  } | null;
  onClearPrefillInvite?: () => void;
  onEnterMatch: (room: MultiplayerRoom, participants: MultiplayerParticipant[]) => void;
  onClose: () => void;
}

export function MultiplayerModal({
  currentUser,
  initialMode,
  selectedMap,
  initialRoom,
  prefillInvite,
  onClearPrefillInvite,
  onEnterMatch,
  onClose,
}: MultiplayerModalProps) {
  const [mode, setMode] = useState<MultiplayerMode>(initialMode);
  const [roomMapId, setRoomMapId] = useState<MapId>(selectedMap);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicPlayerLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PublicPlayerLookup | null>(null);

  const [incomingInvites, setIncomingInvites] = useState<MultiplayerInvite[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<MultiplayerInvite[]>([]);
  const [stats, setStats] = useState<PlayerCompetitiveStats | null>(
    currentUser.competitiveStats || null
  );
  const [recentX1, setRecentX1] = useState<X1ResultRecord[]>([]);
  const [recentMatches, setRecentMatches] = useState<MultiplayerMatchRecord[]>([]);

  const [room, setRoom] = useState<MultiplayerRoom | null>(initialRoom?.room || null);
  const [participants, setParticipants] = useState<MultiplayerParticipant[]>(
    initialRoom?.participants || []
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [friendsList, setFriendsList] = useState<FriendEntry[]>([]);

  useEffect(() => {
    if (!prefillInvite) return;
    setMode(prefillInvite.mode);
    setSearchQuery(prefillInvite.targetNickname);
    void api.multiplayer
      .search(prefillInvite.targetNickname)
      .then((res) => {
        setSearchResults(res.players);
        setSelectedPlayer(res.players[0] || null);
      })
      .catch(() => {});
    onClearPrefillInvite?.();
  }, [prefillInvite, onClearPrefillInvite]);

  const loadFriendsQuickList = useCallback(async () => {
    try {
      const ov = await api.friends.overview();
      setFriendsList(ov.friends);
    } catch {
      // Ignore
    }
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const ov = await api.multiplayer.overview();
      setIncomingInvites(ov.incomingInvites);
      setOutgoingInvites(ov.outgoingInvites);
      setStats(ov.competitiveStats);
      setRecentX1(ov.recentX1);
      setRecentMatches(ov.recentMatches);

      if (ov.activeRoom) {
        setRoom(ov.activeRoom.room);
        setParticipants(ov.activeRoom.participants);
        setRoomMapId(ov.activeRoom.room.mapId);
        if (
          ov.activeRoom.room.status === 'countdown' ||
          ov.activeRoom.room.status === 'in_progress'
        ) {
          onEnterMatch(ov.activeRoom.room, ov.activeRoom.participants);
        }
      } else {
        setRoom((prev) =>
          prev && (prev.status === 'finished' || prev.status === 'cancelled') ? null : prev
        );
      }
    } catch {
      // Transient polling errors ignored
    }
  }, [onEnterMatch]);

  // Initial load + fast room/overview polling
  useEffect(() => {
    void loadOverview();
    void loadFriendsQuickList();
    const timer = window.setInterval(() => {
      if (room && room.status !== 'finished' && room.status !== 'cancelled') {
        api.multiplayer
          .getRoom(room.id)
          .then((res) => {
            setRoom(res.room);
            setParticipants(res.participants);
            setRoomMapId(res.room.mapId);
            if (res.room.status === 'countdown' || res.room.status === 'in_progress') {
              onEnterMatch(res.room, res.participants);
            } else if (res.room.status === 'cancelled') {
              setRoom(null);
              setParticipants([]);
              setNotice('A sala foi encerrada ou o convite foi recusado.');
              void loadOverview();
            }
          })
          .catch(() => {
            void loadOverview();
          });
      } else {
        void loadOverview();
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [room, loadOverview, onEnterMatch]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setNotice(null);
    const clean = searchQuery.trim();
    if (!clean) {
      setError('Digite o nickname do jogador para procurar.');
      return;
    }
    setSearching(true);
    try {
      const res = await api.multiplayer.search(clean);
      setSearchResults(res.players);
      setSelectedPlayer(res.players[0] || null);
      if (res.players.length === 0) {
        setError('Nenhum jogador encontrado com esse nickname.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao procurar jogador.');
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (targetNickname: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.multiplayer.createInvite({
        targetNickname,
        mode,
        mapId: roomMapId,
      });
      setRoom(res.room);
      setParticipants(res.participants);
      setNotice(`Convite enviado para ${targetNickname}! Aguardando confirmação.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o convite.');
    } finally {
      setBusy(false);
    }
  };

  const handleRespondInvite = async (
    inviteId: string,
    action: 'accept' | 'decline' | 'cancel'
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.multiplayer.respondInvite(inviteId, action);
      if (action === 'accept' && res.room && res.participants) {
        setRoom(res.room);
        setParticipants(res.participants);
        setRoomMapId(res.room.mapId);
      }
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao responder convite.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleReady = async () => {
    if (!room) return;
    const me = participants.find((p) => p.userId === currentUser.id);
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.multiplayer.setReady(room.id, !me.ready, roomMapId);
      setRoom(res.room);
      setParticipants(res.participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar pronto.');
    } finally {
      setBusy(false);
    }
  };

  const handleHostChangeMap = async (newMap: MapId) => {
    setRoomMapId(newMap);
    if (!room || room.hostUserId !== currentUser.id) return;
    const me = participants.find((p) => p.userId === currentUser.id);
    try {
      const res = await api.multiplayer.setReady(room.id, Boolean(me?.ready), newMap);
      setRoom(res.room);
      setParticipants(res.participants);
    } catch {
      // Ignore transient
    }
  };

  const handleStartMatch = async () => {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.multiplayer.startRoom(room.id);
      setRoom(res.room);
      setParticipants(res.participants);
      onEnterMatch(res.room, res.participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ainda não é possível iniciar a partida.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await api.multiplayer.leaveRoom(room.id);
      setRoom(null);
      setParticipants([]);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sair da sala.');
    } finally {
      setBusy(false);
    }
  };

  const myParticipant = participants.find((p) => p.userId === currentUser.id);
  const friendParticipant = participants.find((p) => p.userId !== currentUser.id);
  const bothJoinedAndReady =
    participants.length >= 2 && participants.every((p) => p.ready);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/88 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              {mode === 'x1' ? (
                <Swords className="w-5 h-5 text-rose-400" />
              ) : (
                <Users className="w-5 h-5 text-sky-400" />
              )}
              {room
                ? room.mode === 'x1'
                  ? 'SALA X1 · QUEM PEGAR MOEDA PRIMEIRO PERDE'
                  : 'SALA JOGAR COM AMIGO'
                : 'MULTIPLAYER ONLINE EM TEMPO REAL'}
            </h2>
            <p className="text-xs text-slate-400">
              {room
                ? 'Mesma pista sincronizada por semente do servidor. Confirme Pronto para começar!'
                : 'Busque um amigo pelo nickname, envie convite na tela e corram juntos na mesma pista 3D.'}
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

        {/* Mode Switcher when not inside a room */}
        {!room && (
          <div className="px-5 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('coop')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition ${
                  mode === 'coop'
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Users className="w-4 h-4" /> JOGAR COM AMIGO
              </button>
              <button
                type="button"
                onClick={() => setMode('x1')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition ${
                  mode === 'x1'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Swords className="w-4 h-4" /> X1 SEM MOEDAS
              </button>
            </div>

            {stats && (
              <div className="flex items-center gap-3 text-xs bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
                <span className="text-slate-400 font-bold">Seu X1:</span>
                <span className="font-mono-num font-bold text-emerald-400">
                  {stats.x1Wins}V
                </span>
                <span className="font-mono-num font-bold text-rose-400">
                  {stats.x1Losses}D
                </span>
                <span className="font-mono-num font-bold text-sky-400">
                  {stats.x1Draws}E
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">
                  Co-op: <strong className="text-white">{stats.coopMatches}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="px-4 py-2.5 rounded-xl bg-red-950/90 border border-red-500/60 text-red-200 text-xs font-semibold">
              {error}
            </div>
          )}
          {notice && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-xs font-semibold">
              {notice}
            </div>
          )}

          {/* ACTIVE ROOM VIEW */}
          {room ? (
            <div className="space-y-5">
              {/* Rule & Map bar */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                    {room.mode === 'x1'
                      ? 'REGRA X1: QUEM PEGAR A 1ª MOEDA PERDE NA HORA!'
                      : 'REGRA CO-OP: CORRAM JUNTOS NA MESMA PISTA'}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Sala #{room.id.slice(0, 8)} · Status:{' '}
                    <strong className="text-white">
                      {room.status === 'invite_sent'
                        ? 'Aguardando amigo aceitar convite...'
                        : 'Na sala (Aguardando Prontos)'}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-emerald-400" />
                  <select
                    value={roomMapId}
                    disabled={room.hostUserId !== currentUser.id}
                    onChange={(e) => void handleHostChangeMap(e.target.value as MapId)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-bold disabled:opacity-70"
                  >
                    {MAPS.map((m) => (
                      <option key={m.id} value={m.id}>
                        Mapa: {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dual Player Slots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Slot 1: Current User / Host or Guest */}
                {[myParticipant || participants[0], friendParticipant].map((p, idx) => {
                  if (!p) {
                    return (
                      <div
                        key={`waiting-${idx}`}
                        className="rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 p-8 flex flex-col items-center justify-center text-center min-h-[260px]"
                      >
                        <Loader2 className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                        <div className="font-display font-bold text-base text-white">
                          Aguardando {outgoingInvites[0]?.toNickname || 'convidado'}...
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          O jogador recebeu a notificação na tela para aceitar o convite.
                        </p>
                      </div>
                    );
                  }
                  const skinDef = getSkinDefinition(p.skinId);
                  const isMe = p.userId === currentUser.id;
                  return (
                    <div
                      key={p.userId}
                      className={`rounded-2xl border-2 overflow-hidden bg-slate-950 flex flex-col ${
                        p.ready ? 'border-emerald-400' : 'border-slate-700'
                      }`}
                    >
                      <div className="h-44 relative">
                        <ScenePreview3D
                          skinId={p.skinId}
                          mapId={roomMapId}
                          customConfig={p.customConfig}
                          capeConfig={p.capeConfig}
                          skateId={p.equippedSkateId}
                          mode="turntable"
                          quality="low"
                        />
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
                          <span className="px-2 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-[10px] font-bold text-amber-300">
                            {p.role === 'host' ? 'ANFITRIÃO' : 'CONVIDADO'}
                          </span>
                          {isMe && (
                            <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400 text-[10px] font-bold text-sky-300">
                              VOCÊ
                            </span>
                          )}
                        </div>
                        <div className="absolute top-2.5 right-2.5 pointer-events-none">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 ${
                              p.ready
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {p.ready ? (
                              <>
                                <Check className="w-3.5 h-3.5" /> PRONTO
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5" /> PREPARANDO
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="font-display text-lg font-bold text-white">
                            {p.nickname}
                          </div>
                          <div className="text-xs text-slate-400">
                            Skin Equipada: <strong className="text-amber-300">{skinDef.name}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Room Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLeaveRoom}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-500/60 text-slate-200 hover:text-rose-200 font-bold text-xs cursor-pointer"
                >
                  SAIR DA SALA
                </button>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleToggleReady}
                    className={`px-5 py-3 rounded-xl font-display font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition ${
                      myParticipant?.ready
                        ? 'bg-amber-500/20 border border-amber-400 text-amber-300 hover:bg-amber-500/30'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    {myParticipant?.ready ? 'CANCELAR PRONTO' : 'ESTOU PRONTO'}
                  </button>

                  <button
                    type="button"
                    disabled={busy || !bothJoinedAndReady}
                    onClick={handleStartMatch}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 disabled:opacity-45 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" /> INICIAR PARTIDA
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* NO ACTIVE ROOM: SEARCH, INVITES & HISTORY */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Search Player + Player Card + Invite */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-bold text-white">
                      {mode === 'x1'
                        ? 'Desafiar jogador no X1 (1ª moeda perde)'
                        : 'Convidar amigo para correr junto'}
                    </h3>
                    <select
                      value={roomMapId}
                      onChange={(e) => setRoomMapId(e.target.value as MapId)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200"
                    >
                      {MAPS.map((m) => (
                        <option key={m.id} value={m.id}>
                          Mapa: {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Digite o nickname exato ou parte do nome..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      disabled={searching}
                      className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      {searching ? 'Buscando...' : 'PROCURAR'}
                    </button>
                  </form>

                  {/* Search results list */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {searchResults.map((pl) => {
                        const skinDef = getSkinDefinition(pl.equippedSkin);
                        const isSel = selectedPlayer?.id === pl.id;
                        return (
                          <div
                            key={pl.id}
                            onClick={() => setSelectedPlayer(pl)}
                            className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 cursor-pointer transition ${
                              isSel
                                ? 'bg-slate-900 border-amber-400'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center font-display font-bold text-white text-sm shrink-0"
                                style={{
                                  background: `linear-gradient(135deg, ${skinDef.primaryColor}, ${skinDef.accentColor})`,
                                }}
                              >
                                {pl.nickname.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-display font-bold text-sm text-white flex items-center gap-2">
                                  {pl.nickname}
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      pl.onlineRecently
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {pl.onlineRecently ? 'ONLINE' : 'OFFLINE'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Skin: {skinDef.name} ·{' '}
                                  {pl.rank ? `Rank #${pl.rank}` : 'Sem rank'} · X1:{' '}
                                  {pl.competitiveStats.x1Wins}V/{pl.competitiveStats.x1Losses}D
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleInvite(pl.nickname);
                              }}
                              className={`px-4 py-2 rounded-xl font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer ${
                                mode === 'x1'
                                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                              }`}
                            >
                              <Send className="w-3.5 h-3.5" />
                              CONVIDAR
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {friendsList.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Convidar Amigo Direto ({friendsList.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {friendsList.map((fr) => (
                          <button
                            key={fr.friendshipId}
                            type="button"
                            disabled={busy}
                            onClick={() => void handleInvite(fr.nickname)}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-400 text-xs font-bold text-white flex items-center gap-2 cursor-pointer"
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                fr.status === 'in_match'
                                  ? 'bg-amber-400'
                                  : fr.status === 'online'
                                    ? 'bg-emerald-400'
                                    : 'bg-slate-500'
                              }`}
                            />
                            <span>{fr.nickname}</span>
                            <span className="text-[10px] text-amber-300">
                              {mode === 'x1' ? 'X1' : 'Co-op'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected Player Preview Card */}
                {selectedPlayer && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                    <div className="sm:col-span-5 h-36 rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                      <ScenePreview3D
                        skinId={selectedPlayer.equippedSkin}
                        mapId={roomMapId}
                        mode="turntable"
                        quality="low"
                      />
                    </div>
                    <div className="sm:col-span-7 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display text-lg font-bold text-white">
                          {selectedPlayer.nickname}
                        </h4>
                        {selectedPlayer.rank && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-bold flex items-center gap-1">
                            <Crown className="w-3 h-3" /> #{selectedPlayer.rank}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-300">
                        Recorde Sem Moedas:{' '}
                        <strong className="font-mono-num text-amber-300">
                          {formatStopwatch(selectedPlayer.bestNoCoinTimeMs)}
                        </strong>
                      </div>
                      <div className="text-xs text-slate-400">
                        Skin Equipada:{' '}
                        <strong className="text-white">
                          {getSkinDefinition(selectedPlayer.equippedSkin).name}
                        </strong>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleInvite(selectedPlayer.nickname)}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold text-xs cursor-pointer"
                      >
                        {mode === 'x1'
                          ? `DESAFIAR ${selectedPlayer.nickname} NO X1`
                          : `CONVIDAR ${selectedPlayer.nickname}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Incoming/Outgoing Invites & History */}
              <div className="lg:col-span-5 space-y-4">
                {/* Pending Invites */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                    Convites Recebidos ({incomingInvites.length})
                  </h3>
                  {incomingInvites.length === 0 ? (
                    <div className="text-xs text-slate-500">
                      Nenhum convite pendente no momento.
                    </div>
                  ) : (
                    incomingInvites.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 rounded-xl bg-slate-900 border border-amber-400/50 space-y-2"
                      >
                        <div className="text-xs text-white">
                          <strong>{inv.fromNickname}</strong> convidou você para{' '}
                          <span className="text-amber-300 font-bold">
                            {inv.mode === 'x1' ? 'X1 Sem Moedas' : 'Jogar com Amigo'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRespondInvite(inv.id, 'accept')}
                            className="flex-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                          >
                            ACEITAR
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRespondInvite(inv.id, 'decline')}
                            className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
                          >
                            RECUSAR
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {outgoingInvites.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <div className="text-[11px] font-bold uppercase text-slate-400">
                        Convites Enviados
                      </div>
                      {outgoingInvites.map((inv) => (
                        <div
                          key={inv.id}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <span className="text-slate-300">
                            Para <strong>{inv.toNickname}</strong> ({inv.mode.toUpperCase()})
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleRespondInvite(inv.id, 'cancel')}
                            className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent X1 / Multiplayer Matches */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" /> Histórico Recente
                  </h3>
                  {recentX1.length === 0 && recentMatches.length === 0 ? (
                    <div className="text-xs text-slate-500">
                      Nenhuma partida multiplayer registrada ainda.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {recentX1.slice(0, 6).map((x) => {
                        const isWin = !x.isDraw && x.winnerUserId === currentUser.id;
                        const opponentName =
                          x.winnerUserId === currentUser.id
                            ? x.loserNickname || 'Adversário'
                            : x.winnerNickname || 'Adversário';
                        const myDuration =
                          x.winnerUserId === currentUser.id
                            ? x.winnerDurationMs
                            : x.loserDurationMs;
                        return (
                          <div
                            key={x.id}
                            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex items-center justify-between"
                          >
                            <div>
                              <span
                                className={`font-extrabold mr-1.5 ${
                                  isWin
                                    ? 'text-emerald-400'
                                    : x.isDraw
                                      ? 'text-sky-400'
                                      : 'text-rose-400'
                                }`}
                              >
                                {isWin ? 'VITÓRIA' : x.isDraw ? 'EMPATE' : 'DERROTA'}
                              </span>
                              <span className="text-white font-semibold">vs {opponentName}</span>
                            </div>
                            <span className="font-mono-num text-[11px] text-slate-400">
                              {formatStopwatch(myDuration)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
