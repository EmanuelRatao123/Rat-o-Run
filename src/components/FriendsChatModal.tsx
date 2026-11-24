import {
  Check,
  Gamepad2,
  MessageCircle,
  Search,
  Send,
  Swords,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
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
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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

  const sortedFriends = useMemo(() => {
    const order: Record<PlayerOnlineStatus, number> = { in_match: 0, online: 1, offline: 2 };
    return [...friends].sort(
      (a, b) => order[a.status] - order[b.status] || a.nickname.localeCompare(b.nickname)
    );
  }, [friends]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-5xl max-h-[92dvh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-400" />
              AMIGOS & CHAT PRIVADO
            </h2>
            <p className="text-xs text-slate-400">
              Adicione jogadores pelo nickname, converse no privado e convide para Co-op ou X1.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
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
                    return (
                      <div
                        key={friend.friendshipId}
                        className={`p-3 rounded-xl border transition ${
                          active
                            ? 'bg-slate-800 border-sky-400'
                            : 'bg-slate-950/75 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold text-sm text-white truncate">
                                {friend.nickname}
                              </span>
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

                          <div className="flex items-center gap-1 shrink-0">
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
                  Apenas amigos aceitos podem trocar mensagens privadas e receber convites rápidos de Co-op ou X1.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-display font-bold text-base text-white">
                      {selectedFriend.nickname}
                    </div>
                    <StatusBadge status={selectedFriend.status} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onDirectMultiplayerInvite(selectedFriend.nickname, 'coop');
                      }}
                      className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Gamepad2 className="w-3.5 h-3.5" /> Convidar Co-op
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onDirectMultiplayerInvite(selectedFriend.nickname, 'x1');
                      }}
                      className="min-h-[38px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Swords className="w-3.5 h-3.5" /> Desafiar X1
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
      </div>
    </div>
  );
}
