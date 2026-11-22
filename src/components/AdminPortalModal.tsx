import {
  BarChart3,
  CheckCircle2,
  Gift,
  History,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Users,
  Vote,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { api, setMemoryAdminToken, setMemorySessionToken } from '../services/api.ts';
import {
  AdminLogItem,
  AdminPlayerRecord,
  AdminStats,
  GlobalMessage,
  PollItem,
  SKINS,
  SkinGiftItem,
  SkinId,
  UserProfile,
  formatStopwatch,
} from '../shared/constants.ts';

interface AdminPortalModalProps {
  entryMode: 'f8' | 'classic';
  currentUser: UserProfile | null;
  onUserUpdated: (user: UserProfile) => void;
  onSocialRefresh: () => void;
  onClose: () => void;
}

type AdminTab = 'stats' | 'messages' | 'polls' | 'gifts' | 'players' | 'logs';

export function AdminPortalModal({
  entryMode,
  currentUser,
  onUserUpdated,
  onSocialRefresh,
  onClose,
}: AdminPortalModalProps) {
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [adminProfile, setAdminProfile] = useState<UserProfile | null>(
    currentUser?.role === 'admin' ? currentUser : null
  );

  // Auth / Password change forms
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Admin Dashboard state
  const [tab, setTab] = useState<AdminTab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [gifts, setGifts] = useState<SkinGiftItem[]>([]);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Message form
  const [msgTitle, setMsgTitle] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [msgDuration, setMsgDuration] = useState(60);

  // Poll form
  const [pollTitle, setPollTitle] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState(120);

  // Gift form (with confirmation step)
  const [giftNickname, setGiftNickname] = useState('');
  const [giftSkinId, setGiftSkinId] = useState<SkinId>('ratao');
  const [pendingGiftConfirm, setPendingGiftConfirm] = useState<{
    nickname: string;
    skinId: SkinId;
  } | null>(null);
  const [giftLoading, setGiftLoading] = useState(false);

  // Player management / search
  const [playerQuery, setPlayerQuery] = useState('');
  const [players, setPlayers] = useState<AdminPlayerRecord[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<AdminPlayerRecord | null>(null);

  const isVerifiedAdmin = Boolean(adminProfile && !adminProfile.mustChangePassword);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.getAdminStats();
      setStats(res.stats);
      setMessages(res.messages);
      setPolls(res.polls);
      setGifts(res.gifts);
      setLogs(res.logs);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao carregar painel.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadPlayers = useCallback(async (q: string) => {
    setPlayersLoading(true);
    try {
      const res = await api.searchAdminPlayers(q);
      setPlayers(res.players);
      setSelectedPlayer((prev) =>
        prev ? res.players.find((p) => p.id === prev.id) || res.players[0] || null : res.players[0] || null
      );
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao pesquisar jogadores.');
    } finally {
      setPlayersLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getAdminBootstrapStatus().catch(() => ({ needsBootstrap: false })),
      api.getAdminSessionStatus().catch(() => null),
    ])
      .then(([boot, sess]) => {
        if (cancelled) return;
        setNeedsBootstrap(boot.needsBootstrap);
        if (sess?.admin) {
          setAdminProfile(sess.admin);
        } else if (currentUser?.role === 'admin') {
          setAdminProfile(currentUser);
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (isVerifiedAdmin) {
      void loadDashboard();
    }
  }, [isVerifiedAdmin, loadDashboard]);

  useEffect(() => {
    if (isVerifiedAdmin && tab === 'players') {
      void loadPlayers(playerQuery);
    }
  }, [isVerifiedAdmin, tab, loadPlayers, playerQuery]);

  const handleSecretF8Login = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await api.secretAdminLogin(loginPass);
      setMemoryAdminToken(res.adminSessionToken);
      setAdminProfile(res.admin);
      setLoginPass('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Senha incorreta.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleClassicOrBootstrapLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (needsBootstrap) {
        const res = await api.bootstrapAdmin({
          nickname: loginUser,
          password: loginPass,
          confirmPassword: confirmPass,
        });
        setMemoryAdminToken(res.adminSessionToken);
        if (!currentUser) {
          setMemorySessionToken(res.sessionToken);
          onUserUpdated(res.user);
        }
        setNeedsBootstrap(false);
        setAdminProfile(res.user);
        setLoginPass('');
        setConfirmPass('');
      } else {
        const res = await api.login({ nickname: loginUser, password: loginPass });
        if (res.user.role !== 'admin') {
          setAuthError('Credenciais sem permissão administrativa.');
          return;
        }
        setMemoryAdminToken(res.sessionToken);
        if (!currentUser) {
          setMemorySessionToken(res.sessionToken);
          onUserUpdated(res.user);
        }
        setAdminProfile(res.user);
        setLoginPass('');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForceChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await api.adminChangePassword({
        currentPassword: currentPass,
        newPassword: loginPass,
        confirmPassword: confirmPass,
      });
      setAdminProfile(res.user);
      if (currentUser?.id === res.user.id) {
        onUserUpdated(res.user);
      }
      setCurrentPass('');
      setLoginPass('');
      setConfirmPass('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    await api.adminLogout().catch(() => {});
    setMemoryAdminToken(null);
    setAdminProfile(null);
    onClose();
  };

  const handlePublishMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    try {
      await api.createGlobalMessage({
        title: msgTitle,
        content: msgContent,
        durationMinutes: msgDuration,
      });
      setMsgTitle('');
      setMsgContent('');
      setActionMsg('Mensagem global publicada para todos os jogadores!');
      await loadDashboard();
      onSocialRefresh();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao publicar mensagem.');
    }
  };

  const handleDeleteMessage = async (id: string) => {
    setActionErr(null);
    try {
      await api.deleteGlobalMessage(id);
      await loadDashboard();
      onSocialRefresh();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao excluir mensagem.');
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    try {
      await api.createPoll({
        title: pollTitle,
        options: pollOptions,
        durationMinutes: pollDuration,
      });
      setPollTitle('');
      setPollOptions(['', '']);
      setActionMsg('Votação global publicada!');
      await loadDashboard();
      onSocialRefresh();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao criar votação.');
    }
  };

  const handleClosePoll = async (id: string) => {
    setActionErr(null);
    try {
      await api.closePoll(id);
      await loadDashboard();
      onSocialRefresh();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao encerrar votação.');
    }
  };

  const handleRequestGiftConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    const trimmed = giftNickname.trim();
    if (!trimmed) {
      setActionErr('Informe o nickname do jogador.');
      return;
    }
    setPendingGiftConfirm({ nickname: trimmed, skinId: giftSkinId });
  };

  const handleConfirmGiftSkin = async () => {
    if (!pendingGiftConfirm) return;
    setGiftLoading(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.giftSkin(pendingGiftConfirm);
      const skinName =
        SKINS.find((s) => s.id === pendingGiftConfirm.skinId)?.name || pendingGiftConfirm.skinId;
      setGiftNickname('');
      setPendingGiftConfirm(null);
      setActionMsg(
        `Skin "${skinName}" presenteada para ${res.gift.targetNickname} e salva no banco de dados!`
      );
      await loadDashboard();
      onSocialRefresh();
    } catch (err) {
      setPendingGiftConfirm(null);
      setActionErr(err instanceof Error ? err.message : 'Erro ao presentear skin.');
    } finally {
      setGiftLoading(false);
    }
  };

  const nowMs = Date.now();
  const activeMessages = messages.filter(
    (m) => m.active && new Date(m.expiresAt).getTime() > nowMs
  );
  const historyMessages = messages.filter(
    (m) => !m.active || new Date(m.expiresAt).getTime() <= nowMs
  );

  // Compact F8 Secret Password Modal before authentication
  if (!checkingStatus && !adminProfile && !needsBootstrap && entryMode === 'f8') {
    return (
      <div
        data-admin-overlay="true"
        className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm bg-slate-900 border border-rose-500/50 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Acesso Administrativo
              </h2>
              <p className="text-[11px] text-slate-400">
                Verificação protegida no servidor
              </p>
            </div>
          </div>

          <form onSubmit={handleSecretF8Login} className="space-y-3.5">
            {authError && (
              <div className="px-3 py-2 rounded-xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs">
                {authError}
              </div>
            )}

            <input
              type="password"
              required
              autoFocus
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              placeholder="Senha administrativa"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
            />

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="submit"
                disabled={authLoading}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-xs tracking-wide cursor-pointer disabled:opacity-60"
              >
                {authLoading ? 'VALIDANDO...' : 'ACESSAR'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold text-xs tracking-wide cursor-pointer"
              >
                CANCELAR
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      data-admin-overlay="true"
      className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-3 sm:p-6"
    >
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Top Header + Section F Controls */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white leading-tight">
                PAINEL ADMINISTRATIVO · RATÃO RUN 3D
              </h2>
              {adminProfile && (
                <span className="text-[11px] text-emerald-400 font-semibold">
                  Sessão ativa: {adminProfile.nickname} (expira automaticamente)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {isVerifiedAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => void loadDashboard()}
                  disabled={refreshing}
                  title="Atualizar estatísticas"
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Atualizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('logs')}
                  title="Histórico administrativo"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                    tab === 'logs'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-amber-300'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Histórico</span>
                </button>
                <button
                  type="button"
                  onClick={handleAdminLogout}
                  title="Sair do modo administrador"
                  className="px-3 py-1.5 rounded-xl bg-rose-950 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sair do Admin</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Fechar painel"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Gate 1: Not authenticated as admin (bootstrap or classic mode) */}
        {!adminProfile ? (
          <div className="p-6 max-w-md mx-auto w-full my-6">
            {checkingStatus ? (
              <div className="text-center text-sm text-slate-400">Verificando estado...</div>
            ) : (
              <form onSubmit={handleClassicOrBootstrapLogin} className="space-y-4">
                <div className="text-center mb-2">
                  <Lock className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                  <h3 className="font-display text-xl font-bold text-white">
                    {needsBootstrap ? 'Configuração Inicial de Acesso' : 'Autenticação Restrita'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {needsBootstrap
                      ? 'Defina a conta mestre inicial para gerenciar mensagens, votações e presentes.'
                      : 'Informe as credenciais autorizadas.'}
                  </p>
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-red-950 border border-red-500/60 text-red-200 text-xs">
                    {authError}
                  </div>
                )}

                <input
                  type="text"
                  required
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="Usuário"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
                <input
                  type="password"
                  required
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Senha"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
                {needsBootstrap && (
                  <input
                    type="password"
                    required
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder="Confirmar Senha"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-xs cursor-pointer"
                  >
                    {authLoading
                      ? 'VALIDANDO...'
                      : needsBootstrap
                      ? 'ATIVAR GESTÃO'
                      : 'ACESSAR'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold text-xs cursor-pointer"
                  >
                    CANCELAR
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : adminProfile.mustChangePassword ? (
          /* Gate 2: Must change initial env password on first access */
          <div className="p-6 max-w-md mx-auto w-full my-6">
            <form onSubmit={handleForceChangePassword} className="space-y-4">
              <div className="text-center">
                <KeyRound className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <h3 className="font-display text-xl font-bold text-white">
                  Troca Obrigatória de Senha
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Por segurança, altere sua senha inicial no primeiro acesso.
                </p>
              </div>
              {authError && (
                <div className="p-3 rounded-xl bg-red-950 border border-red-500/60 text-red-200 text-xs">
                  {authError}
                </div>
              )}
              <input
                type="password"
                required
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="Senha inicial atual"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
              <input
                type="password"
                required
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
              <input
                type="password"
                required
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Confirmar nova senha"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
              >
                SALVAR NOVA SENHA E ENTRAR
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Admin Dashboard */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Navigation Tabs */}
            <div className="px-4 sm:px-5 py-2.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap gap-2">
              {(
                [
                  { id: 'stats', label: 'Estatísticas', icon: BarChart3 },
                  { id: 'messages', label: 'Mensagens Globais', icon: Megaphone },
                  { id: 'polls', label: 'Votações Globais', icon: Vote },
                  { id: 'gifts', label: 'Presentear Skins', icon: Gift },
                  { id: 'players', label: 'Jogadores', icon: Users },
                  { id: 'logs', label: 'Histórico Admin', icon: History },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id);
                      setActionErr(null);
                      setActionMsg(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      tab === t.id
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-950/60'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
              {actionMsg && (
                <div className="px-4 py-2.5 rounded-xl bg-emerald-950 border border-emerald-500/60 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{actionMsg}</span>
                </div>
              )}
              {actionErr && (
                <div className="px-4 py-2.5 rounded-xl bg-red-950 border border-red-500/60 text-red-200 text-xs font-semibold">
                  {actionErr}
                </div>
              )}

              {/* Tab E: Statistics */}
              {tab === 'stats' && stats && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Jogadores Cadastrados
                      </div>
                      <div className="font-mono-num text-2xl font-extrabold text-white mt-1">
                        {stats.totalUsers}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Jogadores Ativos (5m)
                      </div>
                      <div className="font-mono-num text-2xl font-extrabold text-emerald-400 mt-1">
                        {stats.onlineRecently}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Partidas Realizadas
                      </div>
                      <div className="font-mono-num text-2xl font-extrabold text-sky-400 mt-1">
                        {stats.totalMatches}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Skin Mais Usada
                      </div>
                      <div className="font-display text-base font-bold text-amber-300 mt-1 truncate">
                        {SKINS.find((s) => s.id === stats.mostUsedSkin)?.name || stats.mostUsedSkin}
                      </div>
                    </div>
                    <div className="col-span-2 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Recorde Global ({stats.highestRecordHolder})
                      </div>
                      <div className="font-mono-num text-2xl font-extrabold text-amber-400 mt-1">
                        {formatStopwatch(stats.highestGlobalRecordMs)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Mensagens / Votações
                      </div>
                      <div className="font-mono-num text-xl font-bold text-white mt-1">
                        {stats.publishedMessagesCount} / {stats.pollsCount}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Presentes Enviados
                      </div>
                      <div className="font-mono-num text-xl font-bold text-fuchsia-400 mt-1">
                        {stats.giftsSentCount}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab A: Global Messages (Active + History) */}
              {tab === 'messages' && (
                <div className="space-y-5">
                  <form
                    onSubmit={handlePublishMessage}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                  >
                    <h4 className="font-display font-bold text-sm text-white">
                      Publicar Mensagem Global
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        value={msgTitle}
                        onChange={(e) => setMsgTitle(e.target.value)}
                        placeholder="Título do aviso"
                        maxLength={80}
                        className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                      />
                      <input
                        type="number"
                        min={1}
                        max={10080}
                        value={msgDuration}
                        onChange={(e) => setMsgDuration(Number(e.target.value))}
                        placeholder="Duração (min)"
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                      />
                    </div>
                    <textarea
                      required
                      rows={2}
                      value={msgContent}
                      onChange={(e) => setMsgContent(e.target.value)}
                      placeholder="Conteúdo visível em tempo real para todos os jogadores conectados..."
                      maxLength={400}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      PUBLICAR GLOBALMENTE
                    </button>
                  </form>

                  <div className="space-y-2">
                    <h4 className="text-xs font-extrabold uppercase text-emerald-400">
                      Mensagens Ativas ({activeMessages.length})
                    </h4>
                    {activeMessages.length === 0 ? (
                      <div className="text-xs text-slate-500">Nenhuma mensagem ativa no momento.</div>
                    ) : (
                      activeMessages.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-bold text-sm text-white">{m.title}</div>
                            <div className="text-xs text-slate-300">{m.content}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Duração: {m.durationMinutes} min · Expira{' '}
                              {new Date(m.expiresAt).toLocaleString('pt-BR')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(m.id)}
                            className="p-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {historyMessages.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold uppercase text-slate-400">
                        Histórico de Mensagens ({historyMessages.length})
                      </h4>
                      {historyMessages.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 opacity-80"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-300">{m.title}</div>
                            <div className="text-xs text-slate-400">{m.content}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Expirou em {new Date(m.expiresAt).toLocaleString('pt-BR')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(m.id)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab B: Global Polls */}
              {tab === 'polls' && (
                <div className="space-y-5">
                  <form
                    onSubmit={handleCreatePoll}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                  >
                    <h4 className="font-display font-bold text-sm text-white">
                      Criar Nova Votação Global
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        value={pollTitle}
                        onChange={(e) => setPollTitle(e.target.value)}
                        placeholder="Pergunta da votação"
                        maxLength={120}
                        className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                      />
                      <input
                        type="number"
                        min={1}
                        max={10080}
                        value={pollDuration}
                        onChange={(e) => setPollDuration(Number(e.target.value))}
                        placeholder="Duração (min)"
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      {pollOptions.map((opt, idx) => (
                        <input
                          key={idx}
                          type="text"
                          required
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[idx] = e.target.value;
                            setPollOptions(next);
                          }}
                          placeholder={`Alternativa ${idx + 1}`}
                          maxLength={60}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                        />
                      ))}
                      {pollOptions.length < 6 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions([...pollOptions, ''])}
                          className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Adicionar alternativa
                        </button>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      PUBLICAR VOTAÇÃO
                    </button>
                  </form>

                  <div className="space-y-3">
                    {polls.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-white">
                            {p.title} ({p.totalVotes} votos)
                          </span>
                          {p.active ? (
                            <button
                              type="button"
                              onClick={() => handleClosePoll(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                            >
                              Encerrar Votação
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-bold">ENCERRADA</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-300">
                          {p.options.map((o) => (
                            <div key={o.index} className="bg-slate-900 px-2.5 py-1 rounded">
                              {o.label}: <span className="font-mono-num text-amber-300">{o.votes}</span> ({o.percentage}%)
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab C: Gift Skins (10 skins visual grid + confirmation) */}
              {tab === 'gifts' && (
                <div className="space-y-5">
                  <form
                    onSubmit={handleRequestGiftConfirm}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4"
                  >
                    <h4 className="font-display font-bold text-sm text-fuchsia-300 flex items-center gap-2">
                      <Gift className="w-4 h-4" /> PRESENTEAR SKIN
                    </h4>

                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                        Nickname do Jogador
                      </label>
                      <input
                        type="text"
                        required
                        value={giftNickname}
                        onChange={(e) => {
                          setGiftNickname(e.target.value);
                          setPendingGiftConfirm(null);
                        }}
                        placeholder="Digite o nickname exato do jogador"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-400 mb-2">
                        Selecione uma das 10 Skins
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {SKINS.map((s) => {
                          const selected = giftSkinId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setGiftSkinId(s.id);
                                setPendingGiftConfirm(null);
                              }}
                              className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                selected
                                  ? 'bg-fuchsia-950/60 border-fuchsia-400 text-white'
                                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span
                                  className="w-3 h-3 rounded-sm shrink-0"
                                  style={{ backgroundColor: s.primaryColor }}
                                />
                                <span
                                  className="w-2 h-3 rounded-sm shrink-0"
                                  style={{ backgroundColor: s.accentColor }}
                                />
                              </div>
                              <div className="font-bold text-xs truncate">{s.name}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {!pendingGiftConfirm ? (
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-display font-bold text-xs cursor-pointer"
                      >
                        PRESENTEAR
                      </button>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-fuchsia-950/40 border border-fuchsia-400/60 space-y-2.5">
                        <div className="text-xs text-fuchsia-100">
                          Confirmar envio da skin{' '}
                          <strong>
                            {SKINS.find((s) => s.id === pendingGiftConfirm.skinId)?.name}
                          </strong>{' '}
                          para <strong>{pendingGiftConfirm.nickname}</strong>?
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={giftLoading}
                            onClick={handleConfirmGiftSkin}
                            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                          >
                            {giftLoading ? 'ENVIANDO...' : 'CONFIRMAR PRESENTE'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingGiftConfirm(null)}
                            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
                          >
                            CANCELAR
                          </button>
                        </div>
                      </div>
                    )}
                  </form>

                  <div className="space-y-2">
                    <h4 className="text-xs font-extrabold uppercase text-slate-400">
                      Presentes Registrados ({gifts.length})
                    </h4>
                    {gifts.map((g) => (
                      <div
                        key={g.id}
                        className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                      >
                        <span>
                          <strong className="text-fuchsia-300">{g.targetNickname}</strong> recebeu{' '}
                          <strong className="text-white">
                            {SKINS.find((s) => s.id === g.skinId)?.name || g.skinId}
                          </strong>
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(g.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab D: Player Management (Read-only inspection) */}
              {tab === 'players' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={playerQuery}
                        onChange={(e) => setPlayerQuery(e.target.value)}
                        placeholder="Pesquisar jogador por nickname..."
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadPlayers(playerQuery)}
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs cursor-pointer"
                    >
                      Buscar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {playersLoading ? (
                        <div className="text-xs text-slate-400">Carregando jogadores...</div>
                      ) : players.length === 0 ? (
                        <div className="text-xs text-slate-500">Nenhum jogador encontrado.</div>
                      ) : (
                        players.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedPlayer(p)}
                            className={`w-full p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                              selectedPlayer?.id === p.id
                                ? 'bg-slate-800 border-sky-400'
                                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-sm text-white flex items-center gap-2">
                                {p.nickname}
                                {p.role === 'admin' && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                                    ADMIN
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {p.totalMatches} partidas ·{' '}
                                {SKINS.find((s) => s.id === p.equippedSkin)?.name || p.equippedSkin}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono-num text-xs font-bold text-amber-300">
                                {formatStopwatch(p.bestNoCoinTimeMs)}
                              </div>
                              <div className="text-[10px] text-slate-500">{p.bestDistance}m</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    {selectedPlayer && (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-display text-lg font-bold text-white">
                              {selectedPlayer.nickname}
                            </h4>
                            <div className="text-[11px] text-slate-400">
                              Cadastro: {new Date(selectedPlayer.createdAt).toLocaleDateString('pt-BR')} ·
                              Último acesso: {new Date(selectedPlayer.lastSeenAt).toLocaleString('pt-BR')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setGiftNickname(selectedPlayer.nickname);
                              setTab('gifts');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-fuchsia-600/20 border border-fuchsia-400/50 text-fuchsia-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Gift className="w-3.5 h-3.5" /> Presentear
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase">Recorde Sem Moedas</div>
                            <div className="font-mono-num font-bold text-amber-300 text-sm">
                              {formatStopwatch(selectedPlayer.bestNoCoinTimeMs)}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase">Melhor Distância</div>
                            <div className="font-mono-num font-bold text-white text-sm">
                              {selectedPlayer.bestDistance}m
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase">Melhor Pontuação</div>
                            <div className="font-mono-num font-bold text-sky-300 text-sm">
                              {selectedPlayer.bestScore.toLocaleString('pt-BR')}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase">Partidas / Moedas</div>
                            <div className="font-mono-num font-bold text-emerald-300 text-sm">
                              {selectedPlayer.totalMatches} / {selectedPlayer.totalCoins}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Skins Desbloqueadas ({selectedPlayer.unlockedSkins.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPlayer.unlockedSkins.map((sk) => (
                              <span
                                key={sk}
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  selectedPlayer.giftedSkins.includes(sk)
                                    ? 'bg-fuchsia-950 border border-fuchsia-500/50 text-fuchsia-200'
                                    : 'bg-slate-900 border border-slate-800 text-slate-300'
                                }`}
                              >
                                {SKINS.find((s) => s.id === sk)?.name || sk}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                            Histórico de Presentes ({selectedPlayer.giftsHistory.length})
                          </div>
                          {selectedPlayer.giftsHistory.length === 0 ? (
                            <div className="text-xs text-slate-500">Nenhum presente registrado.</div>
                          ) : (
                            <div className="space-y-1 max-h-28 overflow-y-auto">
                              {selectedPlayer.giftsHistory.map((g) => (
                                <div
                                  key={g.id}
                                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] flex justify-between"
                                >
                                  <span className="text-fuchsia-300 font-semibold">
                                    {SKINS.find((s) => s.id === g.skinId)?.name || g.skinId}
                                  </span>
                                  <span className="text-slate-500">
                                    {new Date(g.createdAt).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab F: Admin Audit Logs */}
              {tab === 'logs' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase text-slate-400">
                      Histórico Administrativo & Auditoria ({logs.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => void loadDashboard()}
                      className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Atualizar logs
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-xs text-slate-500">Nenhuma ação registrada.</div>
                    ) : (
                      logs.map((l) => (
                        <div
                          key={l.id}
                          className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-bold text-rose-400 mr-2">{l.action}</span>
                            <span className="text-slate-200">{l.details}</span>
                            <span className="text-slate-500 ml-2">({l.adminNickname})</span>
                          </div>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {new Date(l.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
