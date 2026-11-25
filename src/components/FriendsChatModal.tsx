import {
  Check,
  Gamepad2,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Search,
  Send,
  Swords,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.ts';
import {
  FriendEntry,
  FriendPrivateMessage,
  FriendRequestEntry,
  FriendSearchResult,
  MultiplayerMode,
  PlayerOnlineStatus,
  UserProfile,
  getSkinDefinition,
} from '../shared/constants.ts';
import { useVoiceCall } from './VoiceCallProvider.tsx';

interface FriendsChatModalProps {
  user: UserProfile;
  onRefreshCounts: (unreadMessages: number, pendingRequests: number) => void;
  onDirectMultiplayerInvite: (targetNickname: string, mode: MultiplayerMode) => void;
  onClose: () => void;
}

function StatusBadge({ status }: { status: PlayerOnlineStatus }) {
  if (status === 'in_match') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-300">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        EM PARTIDA
      </span>
    );
  }
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-300">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        ONLINE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
      <span className="w-2 h-2 rounded-full bg-slate-500" />
      OFFLINE
    </span>
  );
}

export function FriendsChatModal({
  user,
  onRefreshCounts,
  onDirectMultiplayerInvite,
  onClose,
}: FriendsChatModalProps) {
  const [activeTab, setActiveTab] = useState<'friends' | 'call'>('friends');
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestEntry[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestEntry[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendEntry | null>(null);
  const [messages, setMessages] = useState<FriendPrivateMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [callingFriendId, setCallingFriendId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const {
    activeCall,
    inCallFriendIds,
    phase: callPhase,
    micStatus,
    speakerEnabled,
    startCall,
    hangupCall,
    toggleMute,
    toggleSpeaker,
  } = useVoiceCall();
  const inCallFriendSet = useMemo(() => new Set(inCallFriendIds), [inCallFriendIds]);

  const loadOverview = useCallback(async () => {
    try {
      const ov = await api.friends.overview();
      setFriends(ov.friends);
      setIncoming(ov.incomingRequests);
      setOutgoing(ov.outgoingRequests);
      onRefreshCounts(ov.totalUnreadMessages, ov.pendingRequestsCount);
      setSelectedFriend((prev) => {
        if (!prev) return null;
        return ov.friends.find((f) => f.userId === prev.userId) || null;
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar amigos.',
      });
    } finally {
      setLoading(false);
    }
  }, [onRefreshCounts]);

  const loadMessages = useCallback(
    async (friendUserId: string) => {
      try {
        const res = await api.friends.getMessages(friendUserId, 80);
        setMessages(res.messages);
        // Clear local unread counter for selected friend
        setFriends((prev) =>
          prev.map((f) => (f.userId === friendUserId ? { ...f, unreadCount: 0 } : f))
        );
      } catch (err) {
        setFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : 'Erro ao carregar conversa.',
        });
      }
    },
    []
  );

  useEffect(() => {
    void loadOverview();
    const timer = window.setInterval(() => {
      void loadOverview();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedFriend) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedFriend.userId);
    const timer = window.setInterval(() => {
      void loadMessages(selectedFriend.userId);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [selectedFriend, loadMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSearch = async () => {
    setSearching(true);
    setFeedback(null);
    try {
      const res = await api.friends.search(searchQuery.trim());
      setSearchResults(res.players);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao buscar jogadores.',
      });
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetNickname: string) => {
    setFeedback(null);
    try {
      const res = await api.friends.sendRequest({ targetNickname });
      setFeedback({
        type: 'ok',
        text:
          res.status === 'accepted'
            ? `Agora você e ${res.targetNickname} são amigos!`
            : `Solicitação enviada para ${res.targetNickname}.`,
      });
      await loadOverview();
      if (searchQuery.trim()) {
        await handleSearch();
      } else {
        setSearchResults((prev) =>
          prev.map((p) =>
            p.nickname === targetNickname
              ? { ...p, relation: res.status === 'accepted' ? 'friend' : 'pending_outgoing' }
              : p
          )
        );
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao enviar solicitação.',
      });
    }
  };

  const handleRespond = async (
    friendshipId: string,
    action: 'accept' | 'decline' | 'cancel'
  ) => {
    setFeedback(null);
    try {
      await api.friends.respondRequest(friendshipId, action);
      await loadOverview();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao responder solicitação.',
      });
    }
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    setFeedback(null);
    try {
      await api.friends.removeFriend(friendshipId);
      setConfirmRemoveId(null);
      if (selectedFriend?.friendshipId === friendshipId) {
        setSelectedFriend(null);
      }
      setFeedback({ type: 'ok', text: 'Amizade removida.' });
      await loadOverview();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover amigo.',
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFriend) return;
    const text = messageInput.trim();
    if (!text) return;
    setSendingMsg(true);
    setFeedback(null);
    try {
      const res = await api.friends.sendMessage(selectedFriend.userId, text);
      setMessages((prev) => [...prev, res.message]);
      setMessageInput('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao enviar mensagem.',
      });
    } finally {
      setSendingMsg(false);
    }
  };

  const handleCallFriend = async (friend: FriendEntry) => {
    setFeedback(null);
    setCallingFriendId(friend.userId);
    try {
      const res = await startCall(friend.userId, friend.nickname);
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: res.error || 'Não foi possível iniciar a ligação.',
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `Ligando para ${friend.nickname}... Aguardando resposta.`,
        });
      }
    } finally {
      setCallingFriendId(null);
    }
  };

  const sortedFriends = useMemo(() => {
    const order: Record<PlayerOnlineStatus, number> = { in_match: 0, online: 1, offline: 2 };
    return [...friends].sort(
      (a, b) => order[a.status] - order[b.status] || a.nickname.localeCompare(b.nickname)
    );
  }, [friends]);

  const activeCallPeerId = activeCall
    ? activeCall.callerUserId === user.id
      ? activeCall.calleeUserId
      : activeCall.callerUserId
    : null;
  const activeCallPeerNick = activeCall
    ? activeCall.callerUserId === user.id
      ? activeCall.calleeNickname
      : activeCall.callerNickname
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-5xl max-h-[92dvh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-400" />
              AMIGOS, CHAT & CALL
            </h2>
            <p className="text-xs text-slate-400">
              Adicione jogadores pelo nickname, converse no privado, ligue em call de voz e convide para Co-op ou X1.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('friends')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition ${
                  activeTab === 'friends'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                AMIGOS & CHAT
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('call')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition ${
                  activeTab === 'call'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <PhoneCall className="w-3.5 h-3.5" />
                CALL
                {activeCall && (
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mx-4 mt-3 px-3.5 py-2 rounded-xl text-xs font-bold border ${
              feedback.type === 'ok'
                ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
                : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {activeTab === 'call' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Active call quick summary card inside Call tab */}
            {activeCall && (
              <div className="bg-emerald-950/45 border border-emerald-400/70 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
                    {callPhase === 'calling'
                      ? 'CHAMANDO AMIGO...'
                      : callPhase === 'reconnecting'
                        ? 'RECONECTANDO ÁUDIO...'
                        : callPhase === 'connected'
                          ? 'CALL DE VOZ CONECTADA'
                          : 'CONECTANDO ÁUDIO...'}
                  </div>
                  <div className="font-display text-lg font-bold text-white mt-0.5">
                    {activeCallPeerNick}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${
                      micStatus === 'muted'
                        ? 'bg-rose-600/30 border-rose-400 text-rose-200'
                        : 'bg-slate-900 border-slate-700 text-white hover:bg-slate-800'
                    }`}
                  >
                    {micStatus === 'muted' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-sky-400" />}
                    {micStatus === 'muted' ? 'MUTADO' : 'MUTE'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleSpeaker}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${
                      speakerEnabled
                        ? 'bg-slate-900 border-slate-700 text-white hover:bg-slate-800'
                        : 'bg-rose-600/30 border-rose-400 text-rose-200'
                    }`}
                  >
                    {speakerEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
                    {speakerEnabled ? 'ÁUDIO' : 'MUDO'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void hangupCall()}
                    className="min-h-[42px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" /> ENCERRAR CALL
                  </button>
                </div>
              </div>
            )}

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                  <Phone className="w-4 h-4" /> CHAMADA DE VOZ COM AMIGOS
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ligue em tempo real via WebRTC enquanto navega nos menus ou durante suas corridas.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                {sortedFriends.filter((f) => f.status !== 'offline').length} amigo(s) disponível(is)
              </span>
            </div>

            {loading ? (
              <div className="py-10 text-center text-xs text-slate-400">Carregando amigos...</div>
            ) : sortedFriends.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 bg-slate-950/50 rounded-xl border border-slate-800">
                Adicione amigos na aba AMIGOS & CHAT para conversar por voz.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedFriends.map((friend) => {
                  const friendBusyInCall = Boolean(friend.inCall) || inCallFriendSet.has(friend.userId);
                  const isCurrentPeer = activeCallPeerId === friend.userId;
                  const canCall =
                    friend.status !== 'offline' && !friendBusyInCall && !activeCall;
                  return (
                    <div
                      key={friend.friendshipId}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isCurrentPeer
                          ? 'bg-emerald-950/40 border-emerald-400'
                          : 'bg-slate-950/75 border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm text-white truncate">
                            {friend.nickname}
                          </span>
                          {friendBusyInCall && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-extrabold">
                              EM CALL
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge status={friend.status} />
                          <span className="text-[10px] text-slate-400">
                            {getSkinDefinition(friend.equippedSkin).name}
                          </span>
                        </div>
                      </div>

                      {isCurrentPeer ? (
                        <button
                          type="button"
                          onClick={() => void hangupCall()}
                          className="min-h-[42px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <PhoneOff className="w-4 h-4" /> ENCERRAR
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canCall || callingFriendId === friend.userId}
                          onClick={() => void handleCallFriend(friend)}
                          title={
                            friend.status === 'offline'
                              ? 'Amigo offline'
                              : friendBusyInCall
                                ? 'Amigo já está em outra call'
                                : activeCall
                                  ? 'Você já está em uma call'
                                  : `Ligar para ${friend.nickname}`
                          }
                          className={`min-h-[42px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition ${
                            canCall
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Phone className="w-4 h-4" />
                          {callingFriendId === friend.userId ? 'LIGANDO...' : 'LIGAR'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Column: Search, Requests & Friends List */}
          <div className="lg:col-span-6 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col overflow-y-auto p-4 space-y-4">
            {/* Search Players */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                Adicionar Amigo por Nickname
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                  }}
                  placeholder="Digite o nickname..."
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={searching}
                  className="min-h-[42px] px-3.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  {searching ? '...' : 'BUSCAR'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                  {searchResults.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{p.nickname}</div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={p.status} />
                          <span className="text-[10px] text-slate-400">
                            {getSkinDefinition(p.equippedSkin).name}
                          </span>
                        </div>
                      </div>
                      {p.relation === 'friend' ? (
                        <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                          AMIGO
                        </span>
                      ) : p.relation === 'pending_outgoing' ? (
                        <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-extrabold">
                          ENVIADA
                        </span>
                      ) : p.relation === 'pending_incoming' ? (
                        <span className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 text-[10px] font-extrabold">
                          TE CONVIDOU
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSendRequest(p.nickname)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold cursor-pointer"
                        >
                          ADICIONAR
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Incoming Requests */}
            {incoming.length > 0 && (
              <div className="bg-amber-950/25 border border-amber-500/40 rounded-xl p-3 space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                  Solicitações Recebidas ({incoming.length})
                </div>
                {incoming.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{req.nickname}</div>
                      <div className="text-[10px] text-slate-400">
                        {getSkinDefinition(req.equippedSkin).name}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleRespond(req.id, 'accept')}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Aceitar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRespond(req.id, 'decline')}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-200 text-[11px] font-bold cursor-pointer"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Outgoing Requests */}
            {outgoing.length > 0 && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  Solicitações Enviadas ({outgoing.length})
                </div>
                {outgoing.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {req.nickname}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRespond(req.id, 'cancel')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Accepted Friends List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Meus Amigos ({sortedFriends.length})
                </span>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Carregando amigos...</div>
              ) : sortedFriends.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-950/50 rounded-xl border border-slate-800">
                  Você ainda não tem amigos adicionados. Busque um jogador acima!
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedFriends.map((friend) => {
                    const active = selectedFriend?.userId === friend.userId;
                    const friendBusyInCall =
                      Boolean(friend.inCall) || inCallFriendSet.has(friend.userId);
                    const isCurrentPeer = activeCallPeerId === friend.userId;
                    const canCall =
                      friend.status !== 'offline' && !friendBusyInCall && !activeCall;
                    return (
                      <div
                        key={friend.friendshipId}
                        className={`p-3 rounded-xl border transition ${
                          active
                            ? 'bg-slate-800 border-sky-400'
                            : 'bg-slate-950/75 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display font-bold text-sm text-white truncate">
                                {friend.nickname}
                              </span>
                              {friendBusyInCall && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-extrabold">
                                  EM CALL
                                </span>
                              )}
                              {friend.unreadCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold tabular-nums">
                                  {friend.unreadCount} nova(s)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <StatusBadge status={friend.status} />
                              <span className="text-[10px] text-slate-400">
                                {getSkinDefinition(friend.equippedSkin).name}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 flex-wrap">
                            {isCurrentPeer ? (
                              <button
                                type="button"
                                onClick={() => void hangupCall()}
                                title="Encerrar Call"
                                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                              >
                                <PhoneOff className="w-3.5 h-3.5" /> Em Call
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!canCall || callingFriendId === friend.userId}
                                onClick={() => void handleCallFriend(friend)}
                                title={
                                  friend.status === 'offline'
                                    ? 'Amigo offline'
                                    : friendBusyInCall
                                      ? 'Amigo já está em call'
                                      : activeCall
                                        ? 'Você já está em uma call'
                                        : 'Ligar em Call de Voz'
                                }
                                className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 ${
                                  canCall
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                <Phone className="w-3.5 h-3.5" />
                                {callingFriendId === friend.userId ? '...' : 'Ligar'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedFriend(friend)}
                              title="Abrir Chat Privado"
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Chat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onDirectMultiplayerInvite(friend.nickname, 'coop');
                              }}
                              title="Convidar para Co-op"
                              className="min-h-[38px] px-2 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                            >
                              <Gamepad2 className="w-3.5 h-3.5" /> Co-op
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onDirectMultiplayerInvite(friend.nickname, 'x1');
                              }}
                              title="Desafiar para X1"
                              className="min-h-[38px] px-2 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                            >
                              <Swords className="w-3.5 h-3.5" /> X1
                            </button>
                            {confirmRemoveId === friend.friendshipId ? (
                              <button
                                type="button"
                                onClick={() => void handleRemoveFriend(friend.friendshipId)}
                                className="min-h-[38px] px-2 py-1.5 rounded-lg bg-rose-700 text-white text-[10px] font-extrabold cursor-pointer"
                              >
                                Confirmar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveId(friend.friendshipId)}
                                title="Remover Amigo"
                                className="min-h-[38px] min-w-[38px] p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/70 text-slate-400 hover:text-rose-200 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Private Chat Pane */}
          <div className="lg:col-span-6 flex flex-col bg-slate-950/60 overflow-hidden min-h-[280px]">
            {!selectedFriend ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <MessageCircle className="w-10 h-10 text-slate-600 mb-3" />
                <div className="font-display font-bold text-white text-base">
                  Selecione um amigo para conversar
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Apenas amigos aceitos podem trocar mensagens privadas, iniciar calls de voz e receber convites rápidos de Co-op ou X1.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-base text-white">
                        {selectedFriend.nickname}
                      </span>
                      {(Boolean(selectedFriend.inCall) ||
                        inCallFriendSet.has(selectedFriend.userId)) && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                          EM CALL
                        </span>
                      )}
                    </div>
                    <StatusBadge status={selectedFriend.status} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {activeCallPeerId === selectedFriend.userId ? (
                      <button
                        type="button"
                        onClick={() => void hangupCall()}
                        className="min-h-[38px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        <PhoneOff className="w-3.5 h-3.5" /> Encerrar Call
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          selectedFriend.status === 'offline' ||
                          Boolean(selectedFriend.inCall) ||
                          inCallFriendSet.has(selectedFriend.userId) ||
                          Boolean(activeCall) ||
                          callingFriendId === selectedFriend.userId
                        }
                        onClick={() => void handleCallFriend(selectedFriend)}
                        className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5" /> Ligar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onDirectMultiplayerInvite(selectedFriend.nickname, 'coop');
                      }}
                      className="min-h-[38px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Gamepad2 className="w-3.5 h-3.5" /> Co-op
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onDirectMultiplayerInvite(selectedFriend.nickname, 'x1');
                      }}
                      className="min-h-[38px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Swords className="w-3.5 h-3.5" /> X1
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {messages.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Nenhuma mensagem ainda. Mande um oi para {selectedFriend.nickname}!
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const mine = msg.senderUserId === user.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-sm break-words ${
                              mine
                                ? 'bg-sky-600 text-white rounded-br-sm'
                                : 'bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <div
                              className={`text-[10px] mt-1 tabular-nums ${
                                mine ? 'text-sky-100/80 text-right' : 'text-slate-400'
                              }`}
                            >
                              {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={(e) => void handleSendMessage(e)}
                  className="p-3 border-t border-slate-800 bg-slate-900 flex items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={500}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={`Mensagem para ${selectedFriend.nickname}...`}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || !messageInput.trim()}
                    className="min-h-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-4 h-4" /> ENVIAR
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
