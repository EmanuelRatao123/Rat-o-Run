import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Crown,
  Gift,
  History,
  KeyRound,
  Layers,
  Lightbulb,
  Lock,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Ticket,
  Trash2,
  Unlock,
  Users,
  Vote,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { api, setMemoryAdminToken, setMemorySessionToken } from '../services/api.ts';
import {
  AdminExclusiveSkinOwner,
  AdminLogItem,
  AdminPlayerRecord,
  AdminPlayerSkinsSummary,
  AdminSecuritySummary,
  AdminStats,
  BULK_GRANTABLE_ALL_SKIN_IDS,
  GlobalMessage,
  LOCKED_EXCLUSIVE_SKINS,
  PlayerSuggestion,
  PollItem,
  PromoCodeRecord,
  PromoCodeRedemptionRecord,
  PromoRewardType,
  SKINS,
  SPECIAL_UNLOCKABLE_SKINS,
  SecurityAuditLogItem,
  SkinGiftItem,
  SkinGrantHistoryRecord,
  SkinId,
  SuggestionStatus,
  UserProfile,
  formatStopwatch,
  getSkinDefinition,
} from '../shared/constants.ts';

interface AdminPortalModalProps {
  entryMode: 'f8' | 'classic' | 'button';
  currentUser: UserProfile | null;
  onUserUpdated: (user: UserProfile) => void;
  onSocialRefresh: () => void;
  onClose: () => void;
}

type AdminTab =
  | 'stats'
  | 'admin_skins'
  | 'manage_skins'
  | 'messages'
  | 'polls'
  | 'gifts'
  | 'suggestions'
  | 'promo_codes'
  | 'players'
  | 'logs';

const GIFTABLE_SKINS = [...SKINS, ...SPECIAL_UNLOCKABLE_SKINS, ...LOCKED_EXCLUSIVE_SKINS];
const MANAGEABLE_LOCKED_SKINS = [...LOCKED_EXCLUSIVE_SKINS, ...SPECIAL_UNLOCKABLE_SKINS];

const SUGGESTION_STATUS_META: Record<
  SuggestionStatus,
  { label: string; badgeClass: string }
> = {
  received: { label: 'Recebida', badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  in_review: { label: 'Em Análise', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  approved: { label: 'Aprovada', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  rejected: { label: 'Recusada', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
};

export function AdminPortalModal({
  entryMode,
  currentUser,
  onUserUpdated,
  onSocialRefresh,
  onClose,
}: AdminPortalModalProps) {
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [adminProfile, setAdminProfile] = useState<UserProfile | null>(null);

  // Auth / Password change forms
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Voluntary in-panel password change modal
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [panelCurrentPass, setPanelCurrentPass] = useState('');
  const [panelNewPass, setPanelNewPass] = useState('');
  const [panelConfirmPass, setPanelConfirmPass] = useState('');
  const [panelPassErr, setPanelPassErr] = useState<string | null>(null);
  const [panelPassBusy, setPanelPassBusy] = useState(false);

  // Admin Dashboard state
  const [tab, setTab] = useState<AdminTab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [gifts, setGifts] = useState<SkinGiftItem[]>([]);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditLogItem[]>([]);
  const [securitySummary, setSecuritySummary] = useState<AdminSecuritySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Admin King Skin & Locked Exclusive Skins management state
  const [unlockKingBusy, setUnlockKingBusy] = useState(false);
  const [exclusiveOwners, setExclusiveOwners] = useState<AdminExclusiveSkinOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownerSkinFilter, setOwnerSkinFilter] = useState<'all' | SkinId>('all');
  const [grantSkinNickname, setGrantSkinNickname] = useState('');
  const [grantSkinId, setGrantSkinId] = useState<SkinId>('homem_aranha');
  const [grantBusy, setGrantBusy] = useState(false);
  const [revokeBusyKey, setRevokeBusyKey] = useState<string | null>(null);
  const [quickPlayerMatches, setQuickPlayerMatches] = useState<AdminPlayerRecord[]>([]);

  // Secret Admin Skin (Plankton) management state
  const [secretOwners, setSecretOwners] = useState<AdminExclusiveSkinOwner[]>([]);
  const [secretOwnersLoading, setSecretOwnersLoading] = useState(false);
  const [secretGrantNickname, setSecretGrantNickname] = useState('');
  const [secretQuickMatches, setSecretQuickMatches] = useState<AdminPlayerRecord[]>([]);
  const [secretGrantBusy, setSecretGrantBusy] = useState(false);
  const [secretRevokeBusyId, setSecretRevokeBusyId] = useState<string | null>(null);

  // Admin Exclusive Skin (Baby Yoda) management state
  const [babyYodaOwners, setBabyYodaOwners] = useState<AdminExclusiveSkinOwner[]>([]);
  const [babyYodaOwnersLoading, setBabyYodaOwnersLoading] = useState(false);
  const [babyYodaGrantNickname, setBabyYodaGrantNickname] = useState('');
  const [babyYodaQuickMatches, setBabyYodaQuickMatches] = useState<AdminPlayerRecord[]>([]);
  const [babyYodaGrantBusy, setBabyYodaGrantBusy] = useState(false);
  const [babyYodaRevokeBusyId, setBabyYodaRevokeBusyId] = useState<string | null>(null);
  const [babyYodaEquipBusy, setBabyYodaEquipBusy] = useState(false);

  // GERENCIAR SKINS (Bulk grant / revoke / player skin count / grant history)
  const [skinsSearchNickname, setSkinsSearchNickname] = useState('');
  const [manageQuickMatches, setManageQuickMatches] = useState<AdminPlayerRecord[]>([]);
  const [playerSkinsSummary, setPlayerSkinsSummary] = useState<AdminPlayerSkinsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [grantHistory, setGrantHistory] = useState<SkinGrantHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilterNickname, setHistoryFilterNickname] = useState('');
  const [showBulkGrantModal, setShowBulkGrantModal] = useState(false);
  const [bulkModalNickname, setBulkModalNickname] = useState('');
  const [bulkModalMatches, setBulkModalMatches] = useState<AdminPlayerRecord[]>([]);
  const [bulkGrantBusy, setBulkGrantBusy] = useState(false);
  const [pendingBulkRevokeTarget, setPendingBulkRevokeTarget] = useState<{
    userId: string;
    nickname: string;
    bulkCount: number;
    legitCount: number;
  } | null>(null);
  const [bulkRevokeBusy, setBulkRevokeBusy] = useState(false);

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

  // Suggestions moderation state
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [sugSearch, setSugSearch] = useState('');
  const [sugTypeFilter, setSugTypeFilter] = useState<'all' | 'map' | 'skin'>('all');
  const [sugStatusFilter, setSugStatusFilter] = useState<'all' | SuggestionStatus>('all');
  const [sugDraftNotes, setSugDraftNotes] = useState<Record<string, string>>({});
  const [sugDraftStatus, setSugDraftStatus] = useState<Record<string, SuggestionStatus>>({});
  const [sugLoading, setSugLoading] = useState(false);

  // Promo codes management state
  const [promoCodes, setPromoCodes] = useState<PromoCodeRecord[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoDescInput, setPromoDescInput] = useState('');
  const [promoRewardType, setPromoRewardType] = useState<PromoRewardType>('skin');
  const [promoSkinId, setPromoSkinId] = useState<SkinId>('meu_ratao');
  const [promoCoinAmount, setPromoCoinAmount] = useState(100);
  const [promoSpecialLabel, setPromoSpecialLabel] = useState('Passe Especial Beta');
  const [promoInfinite, setPromoInfinite] = useState(false);
  const [promoMaxUses, setPromoMaxUses] = useState(25);
  const [promoExpiresAt, setPromoExpiresAt] = useState('');
  const [promoActive, setPromoActive] = useState(true);
  const [selectedPromoRedemptions, setSelectedPromoRedemptions] = useState<{
    code: string;
    records: PromoCodeRedemptionRecord[];
  } | null>(null);

  // Player management / search
  const [playerQuery, setPlayerQuery] = useState('');
  const [players, setPlayers] = useState<AdminPlayerRecord[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<AdminPlayerRecord | null>(null);

  const isVerifiedAdmin = Boolean(adminProfile && !adminProfile.mustChangePassword);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const [res, secRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminSecurityLogs({ limit: 50 }).catch(() => null),
      ]);
      setStats(res.stats);
      setMessages(res.messages);
      setPolls(res.polls);
      setGifts(res.gifts);
      setLogs(res.logs);
      if (secRes) {
        setSecurityLogs(secRes.logs);
        setSecuritySummary(secRes.summary);
      }
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

  const loadSuggestions = useCallback(async () => {
    setSugLoading(true);
    try {
      const res = await api.adminListSuggestions({
        search: sugSearch.trim() || undefined,
        type: sugTypeFilter,
        status: sugStatusFilter,
      });
      setSuggestions(res.suggestions);
      setSugDraftNotes((prev) => {
        const next = { ...prev };
        for (const s of res.suggestions) {
          if (next[s.id] === undefined) next[s.id] = s.adminNote || '';
        }
        return next;
      });
      setSugDraftStatus((prev) => {
        const next = { ...prev };
        for (const s of res.suggestions) {
          if (next[s.id] === undefined) next[s.id] = s.status;
        }
        return next;
      });
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao carregar sugestões.');
    } finally {
      setSugLoading(false);
    }
  }, [sugSearch, sugStatusFilter, sugTypeFilter]);

  const loadPromoCodes = useCallback(async () => {
    setPromoLoading(true);
    try {
      const res = await api.adminListPromoCodes();
      setPromoCodes(res.promoCodes);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao carregar códigos promocionais.');
    } finally {
      setPromoLoading(false);
    }
  }, []);

  const loadExclusiveOwners = useCallback(async (skinFilter: 'all' | SkinId = 'all') => {
    setOwnersLoading(true);
    try {
      const res = await api.adminListExclusiveSkinOwners(
        skinFilter === 'all' ? undefined : skinFilter
      );
      setExclusiveOwners(res.owners);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao consultar donos das skins.');
    } finally {
      setOwnersLoading(false);
    }
  }, []);

  const loadSecretOwners = useCallback(async () => {
    setSecretOwnersLoading(true);
    try {
      const res = await api.adminListSecretSkinOwners('plankton');
      setSecretOwners(res.owners);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao carregar skin secreta.');
    } finally {
      setSecretOwnersLoading(false);
    }
  }, []);

  const loadBabyYodaOwners = useCallback(async () => {
    setBabyYodaOwnersLoading(true);
    try {
      const res = await api.adminListSecretSkinOwners('baby_yoda');
      setBabyYodaOwners(res.owners);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao consultar donos da skin Baby Yoda.');
    } finally {
      setBabyYodaOwnersLoading(false);
    }
  }, []);

  const loadGrantHistory = useCallback(async (nicknameFilter?: string) => {
    setHistoryLoading(true);
    try {
      const res = await api.adminListSkinGrantHistory(nicknameFilter);
      setGrantHistory(res.history);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao carregar histórico de concessões.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadPlayerSkinsSummary = useCallback(async (nickname: string) => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setActionErr('Informe o nickname do jogador para consultar as skins.');
      return;
    }
    setSummaryLoading(true);
    setActionErr(null);
    try {
      const res = await api.adminGetPlayerSkinsSummary(trimmed);
      setPlayerSkinsSummary(res.summary);
      setSkinsSearchNickname(res.summary.nickname);
    } catch (err) {
      setPlayerSkinsSummary(null);
      setActionErr(err instanceof Error ? err.message : 'Erro ao consultar inventário de skins.');
    } finally {
      setSummaryLoading(false);
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
        if (sess?.admin && sess.admin.role === 'admin') {
          setAdminProfile(sess.admin);
        } else {
          setAdminProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.role]);

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

  useEffect(() => {
    if (isVerifiedAdmin && tab === 'suggestions') {
      void loadSuggestions();
    }
  }, [isVerifiedAdmin, tab, loadSuggestions]);

  useEffect(() => {
    if (isVerifiedAdmin && tab === 'promo_codes') {
      void loadPromoCodes();
    }
  }, [isVerifiedAdmin, tab, loadPromoCodes]);

  useEffect(() => {
    if (isVerifiedAdmin && tab === 'admin_skins') {
      void loadExclusiveOwners(ownerSkinFilter);
      void loadSecretOwners();
      void loadBabyYodaOwners();
    }
  }, [isVerifiedAdmin, tab, ownerSkinFilter, loadExclusiveOwners, loadSecretOwners, loadBabyYodaOwners]);

  useEffect(() => {
    if (!isVerifiedAdmin || tab !== 'admin_skins') return;
    const q = grantSkinNickname.trim();
    if (q.length < 1) {
      setQuickPlayerMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api
        .searchAdminPlayers(q)
        .then((res) => setQuickPlayerMatches(res.players.slice(0, 6)))
        .catch(() => {});
    }, 220);
    return () => window.clearTimeout(t);
  }, [isVerifiedAdmin, tab, grantSkinNickname]);

  useEffect(() => {
    if (!isVerifiedAdmin || tab !== 'admin_skins') return;
    const q = secretGrantNickname.trim();
    if (q.length < 1) {
      setSecretQuickMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api
        .searchAdminPlayers(q)
        .then((res) => setSecretQuickMatches(res.players.slice(0, 6)))
        .catch(() => {});
    }, 220);
    return () => window.clearTimeout(t);
  }, [isVerifiedAdmin, tab, secretGrantNickname]);

  useEffect(() => {
    if (!isVerifiedAdmin || tab !== 'admin_skins') return;
    const q = babyYodaGrantNickname.trim();
    if (q.length < 1) {
      setBabyYodaQuickMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api
        .searchAdminPlayers(q)
        .then((res) => setBabyYodaQuickMatches(res.players.slice(0, 6)))
        .catch(() => {});
    }, 220);
    return () => window.clearTimeout(t);
  }, [isVerifiedAdmin, tab, babyYodaGrantNickname]);

  useEffect(() => {
    if (isVerifiedAdmin && tab === 'manage_skins') {
      void loadGrantHistory(historyFilterNickname);
    }
  }, [isVerifiedAdmin, tab, historyFilterNickname, loadGrantHistory]);

  useEffect(() => {
    if (!isVerifiedAdmin || tab !== 'manage_skins') return;
    const q = skinsSearchNickname.trim();
    if (q.length < 1) {
      setManageQuickMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api
        .searchAdminPlayers(q)
        .then((res) => setManageQuickMatches(res.players.slice(0, 6)))
        .catch(() => {});
    }, 220);
    return () => window.clearTimeout(t);
  }, [isVerifiedAdmin, tab, skinsSearchNickname]);

  useEffect(() => {
    if (!isVerifiedAdmin || !showBulkGrantModal) return;
    const q = bulkModalNickname.trim();
    if (q.length < 1) {
      setBulkModalMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api
        .searchAdminPlayers(q)
        .then((res) => setBulkModalMatches(res.players.slice(0, 6)))
        .catch(() => {});
    }, 200);
    return () => window.clearTimeout(t);
  }, [isVerifiedAdmin, showBulkGrantModal, bulkModalNickname]);

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

  const handlePanelChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPanelPassErr(null);
    if (panelNewPass.length < 6 || panelNewPass.length > 100) {
      setPanelPassErr('A nova senha deve ter entre 6 e 100 caracteres.');
      return;
    }
    if (panelNewPass !== panelConfirmPass) {
      setPanelPassErr('A confirmação da nova senha não confere.');
      return;
    }
    setPanelPassBusy(true);
    try {
      const res = await api.adminChangePassword({
        currentPassword: panelCurrentPass,
        newPassword: panelNewPass,
        confirmPassword: panelConfirmPass,
      });
      setAdminProfile(res.user);
      if (currentUser?.id === res.user.id) {
        onUserUpdated(res.user);
      }
      setPanelCurrentPass('');
      setPanelNewPass('');
      setPanelConfirmPass('');
      setShowChangePasswordModal(false);
      setActionMsg('Senha administrativa atualizada com sucesso!');
      await loadDashboard();
    } catch (err) {
      setPanelPassErr(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setPanelPassBusy(false);
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
      const skinName = getSkinDefinition(pendingGiftConfirm.skinId).name;
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

  const handleUnlockKingSkin = async () => {
    setUnlockKingBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminUnlockKingSkin();
      setAdminProfile((prev) =>
        prev
          ? {
              ...prev,
              allowedExclusiveSkins: res.allowedExclusiveSkins,
            }
          : prev
      );
      if (currentUser && adminProfile && currentUser.id === adminProfile.id) {
        onUserUpdated({
          ...currentUser,
          allowedExclusiveSkins: res.allowedExclusiveSkins,
        });
      }
      setActionMsg(
        res.alreadyUnlocked
          ? 'A skin Ratão Rei já estava desbloqueada na sua conta administrativa!'
          : 'Skin Ratão Rei desbloqueada para sua conta administrativa! Você já pode equipá-la no menu Skins.'
      );
      await loadDashboard();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao desbloquear Ratão Rei.');
    } finally {
      setUnlockKingBusy(false);
    }
  };

  const handleGrantExclusiveSkin = async (
    nicknameOverride?: string,
    skinOverride?: SkinId
  ) => {
    const targetNickname = (nicknameOverride ?? grantSkinNickname).trim();
    const targetSkinId = skinOverride ?? grantSkinId;
    if (!targetNickname) {
      setActionErr('Informe o nickname do jogador para liberar a skin.');
      return;
    }
    setGrantBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminGrantExclusiveSkin({
        nickname: targetNickname,
        skinId: targetSkinId,
      });
      const skinName = getSkinDefinition(targetSkinId).name;
      setActionMsg(
        `Skin "${skinName}" liberada para ${res.owner.nickname}!`
      );
      if (currentUser && currentUser.id === res.owner.userId) {
        const nextAllowed = Array.from(
          new Set([...(currentUser.allowedExclusiveSkins || []), targetSkinId])
        );
        onUserUpdated({
          ...currentUser,
          allowedExclusiveSkins: nextAllowed,
          unlockedSkins: Array.from(new Set([...currentUser.unlockedSkins, targetSkinId])),
        });
      }
      if (!nicknameOverride) setGrantSkinNickname('');
      await Promise.all([
        loadExclusiveOwners(ownerSkinFilter),
        tab === 'players' ? loadPlayers(playerQuery) : Promise.resolve(),
        loadDashboard(),
      ]);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao liberar skin.');
    } finally {
      setGrantBusy(false);
    }
  };

  const handleRevokeExclusiveSkin = async (
    userId: string,
    skinId: SkinId,
    nickname: string
  ) => {
    const busyKey = `${userId}:${skinId}`;
    setRevokeBusyKey(busyKey);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminRevokeExclusiveSkin({ userId, skinId });
      const skinName = getSkinDefinition(skinId).name;
      setActionMsg(
        `Permissão da skin "${skinName}" removida de ${res.targetNickname || nickname}${
          res.resetEquipped ? ' (skin equipada voltou para Ratão)' : ''
        }.`
      );
      if (currentUser && currentUser.id === userId) {
        const nextAllowed = (currentUser.allowedExclusiveSkins || []).filter((s) => s !== skinId);
        onUserUpdated({
          ...currentUser,
          allowedExclusiveSkins: nextAllowed,
          unlockedSkins: currentUser.unlockedSkins.filter((s) => s !== skinId),
          equippedSkin: res.resetEquipped ? 'ratao' : currentUser.equippedSkin,
        });
      }
      await Promise.all([
        loadExclusiveOwners(ownerSkinFilter),
        tab === 'players' ? loadPlayers(playerQuery) : Promise.resolve(),
        loadDashboard(),
      ]);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao remover permissão da skin.');
    } finally {
      setRevokeBusyKey(null);
    }
  };

  const handleGrantSecretSkin = async (nicknameOverride?: string) => {
    const targetNickname = (nicknameOverride ?? secretGrantNickname).trim();
    setSecretGrantBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminGrantSecretSkin({
        nickname: targetNickname || undefined,
        skinId: 'plankton',
      });
      setActionMsg(
        `Skin Secreta "Plankton" liberada exclusivamente para ${res.owner.nickname}!`
      );
      if (currentUser && currentUser.id === res.owner.userId) {
        const nextAllowed = Array.from(
          new Set([...(currentUser.allowedExclusiveSkins || []), 'plankton' as SkinId])
        );
        onUserUpdated({
          ...currentUser,
          allowedExclusiveSkins: nextAllowed,
          unlockedSkins: Array.from(new Set([...currentUser.unlockedSkins, 'plankton' as SkinId])),
        });
      }
      if (!nicknameOverride) setSecretGrantNickname('');
      await Promise.all([loadSecretOwners(), loadDashboard()]);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao liberar skin secreta.');
    } finally {
      setSecretGrantBusy(false);
    }
  };

  const handleRevokeSecretSkin = async (userId: string, nickname: string) => {
    setSecretRevokeBusyId(userId);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminRevokeSecretSkin({ userId, skinId: 'plankton' });
      setActionMsg(
        `Skin secreta Plankton removida de ${res.targetNickname || nickname}${
          res.resetEquipped ? ' (skin equipada voltou para Ratão)' : ''
        }.`
      );
      if (currentUser && currentUser.id === userId) {
        onUserUpdated({
          ...currentUser,
          allowedExclusiveSkins: (currentUser.allowedExclusiveSkins || []).filter(
            (s) => s !== 'plankton'
          ),
          unlockedSkins: currentUser.unlockedSkins.filter((s) => s !== 'plankton'),
          equippedSkin: res.resetEquipped ? 'ratao' : currentUser.equippedSkin,
        });
      }
      await Promise.all([loadSecretOwners(), loadDashboard()]);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao remover skin secreta.');
    } finally {
      setSecretRevokeBusyId(null);
    }
  };

  const handleGrantBabyYoda = async (nicknameOverride?: string) => {
    const targetNickname = (nicknameOverride ?? babyYodaGrantNickname).trim();
    if (!targetNickname) {
      setActionErr('Informe o nickname do jogador para conceder Baby Yoda.');
      return;
    }
    setBabyYodaGrantBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminGrantSecretSkin({
        nickname: targetNickname,
        skinId: 'baby_yoda',
      });
      setActionMsg(
        `Skin administrativa "Baby Yoda" concedida para ${res.owner.nickname} por ${res.owner.grantedBy || adminProfile?.nickname || 'Admin'}!`
      );
      if (currentUser && currentUser.id === res.owner.userId) {
        const nextAllowed = Array.from(
          new Set([...(currentUser.allowedExclusiveSkins || []), 'baby_yoda' as SkinId])
        );
        onUserUpdated({
          ...currentUser,
          allowedExclusiveSkins: nextAllowed,
          unlockedSkins: Array.from(new Set([...currentUser.unlockedSkins, 'baby_yoda' as SkinId])),
        });
      }
      if (!nicknameOverride) setBabyYodaGrantNickname('');
      await Promise.all([loadBabyYodaOwners(), loadDashboard()]);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao conceder skin Baby Yoda.');
    } finally {
      setBabyYodaGrantBusy(false);
    }
  };

  const handleRevokeBabyYoda = async (userId: string, nickname: string) => {
    setBabyYodaRevokeBusyId(userId);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminRevokeSecretSkin({ userId, skinId: 'baby_yoda' });
      setActionMsg(
        `Autorização da skin Baby Yoda revogada para ${res.targetNickname || nickname}${
          res.resetEquipped ? ' (skin equipada voltou para Ratão)' : ''
        }.`
      );
      if (currentUser && currentUser.id === userId) {
        onUserUpdated({
          ...currentUser,
          allowedExclusiveSkins: (currentUser.allowedExclusiveSkins || []).filter(
            (s) => s !== 'baby_yoda'
          ),
          unlockedSkins: currentUser.unlockedSkins.filter((s) => s !== 'baby_yoda'),
          equippedSkin: res.resetEquipped ? 'ratao' : currentUser.equippedSkin,
        });
      }
      await Promise.all([loadBabyYodaOwners(), loadDashboard()]);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao revogar skin Baby Yoda.');
    } finally {
      setBabyYodaRevokeBusyId(null);
    }
  };

  const handleEquipBabyYodaForAdmin = async () => {
    if (!currentUser || currentUser.role !== 'admin') return;
    setBabyYodaEquipBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.equipSkin('baby_yoda');
      onUserUpdated({
        ...currentUser,
        equippedSkin: res.equippedSkin,
        allowedExclusiveSkins: Array.from(
          new Set([...(currentUser.allowedExclusiveSkins || []), 'baby_yoda' as SkinId])
        ),
        unlockedSkins: Array.from(new Set([...currentUser.unlockedSkins, 'baby_yoda' as SkinId])),
      });
      setActionMsg('Skin administrativa Baby Yoda equipada com sucesso!');
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao equipar Baby Yoda.');
    } finally {
      setBabyYodaEquipBusy(false);
    }
  };

  const openBulkGrantModal = (prefillNickname?: string) => {
    const initial =
      (prefillNickname ?? playerSkinsSummary?.nickname ?? skinsSearchNickname ?? '').trim();
    setBulkModalNickname(initial);
    setActionErr(null);
    setShowBulkGrantModal(true);
  };

  const handleConfirmBulkGrantAllSkins = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetNick = bulkModalNickname.trim();
    if (!targetNick) {
      setActionErr('Informe o nickname do jogador para conceder todas as skins.');
      return;
    }
    setBulkGrantBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminGrantAllSkins(targetNick);
      setPlayerSkinsSummary(res.summary);
      setSkinsSearchNickname(res.summary.nickname);
      setShowBulkGrantModal(false);

      if (currentUser && currentUser.id === res.summary.userId) {
        const nextAllowed = res.summary.unlockedSkinIds.filter(
          (id) =>
            !['ratao', 'capivara', 'macaco', 'tartaruga', 'cachorro', 'galo_doido', 'rato_craque', 'macaco_ninja', 'robo_dourado', 'galo_guerreiro'].includes(
              id
            )
        );
        onUserUpdated({
          ...currentUser,
          unlockedSkins: res.summary.unlockedSkinIds,
          allowedExclusiveSkins: nextAllowed,
        });
      }

      if (res.alreadyHadAll) {
        setActionMsg(
          `${res.summary.nickname} já possuía todas as ${res.summary.totalGrantableSkins} skins elegíveis desbloqueadas!`
        );
      } else {
        setActionMsg(
          `Concessão concluída: ${res.grantedSkins.length} nova(s) skin(s) desbloqueada(s) para ${res.summary.nickname} (total: ${res.summary.totalUnlockedCount}/${res.summary.totalCatalogSkins}). Skins Ratão Rei e Top 1/2/3 permanecem protegidas.`
        );
      }

      await Promise.all([loadGrantHistory(historyFilterNickname), loadDashboard()]);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao conceder todas as skins.');
    } finally {
      setBulkGrantBusy(false);
    }
  };

  const handleConfirmBulkRevokeSkins = async () => {
    if (!pendingBulkRevokeTarget) return;
    setBulkRevokeBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await api.adminRevokeBulkSkins({
        userId: pendingBulkRevokeTarget.userId,
        nickname: pendingBulkRevokeTarget.nickname,
      });
      setPlayerSkinsSummary(res.summary);
      setPendingBulkRevokeTarget(null);

      if (currentUser && currentUser.id === res.summary.userId) {
        const nextAllowed = res.summary.unlockedSkinIds.filter(
          (id) =>
            !['ratao', 'capivara', 'macaco', 'tartaruga', 'cachorro', 'galo_doido', 'rato_craque', 'macaco_ninja', 'robo_dourado', 'galo_guerreiro'].includes(
              id
            )
        );
        onUserUpdated({
          ...currentUser,
          unlockedSkins: res.summary.unlockedSkinIds,
          allowedExclusiveSkins: nextAllowed,
          equippedSkin: res.summary.equippedSkin,
        });
      }

      if (res.revokedSkins.length === 0) {
        setActionMsg(
          `${res.summary.nickname} não possuía skins concedidas pelo recurso em massa para remover.`
        );
      } else {
        setActionMsg(
          `${res.revokedSkins.length} skin(s) concedida(s) em massa removida(s) de ${res.summary.nickname}. ${res.summary.legitimateSpecialCount} skin(s) obtida(s) por códigos/presentes foram preservadas.${
            res.resetEquipped ? ' A skin equipada foi redefinida para Ratão.' : ''
          }`
        );
      }

      await Promise.all([loadGrantHistory(historyFilterNickname), loadDashboard()]);
    } catch (err) {
      setPendingBulkRevokeTarget(null);
      setActionErr(err instanceof Error ? err.message : 'Erro ao remover concessão em massa.');
    } finally {
      setBulkRevokeBusy(false);
    }
  };

  const handleSaveSuggestionModeration = async (id: string) => {
    setActionErr(null);
    setActionMsg(null);
    const status = sugDraftStatus[id] || 'received';
    const note = sugDraftNotes[id] ?? '';
    try {
      await api.adminUpdateSuggestion(id, {
        status,
        adminNote: note.trim() || null,
      });
      setActionMsg('Sugestão atualizada! O jogador será notificado automaticamente se aprovada/recusada.');
      await loadSuggestions();
      await loadDashboard();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao atualizar sugestão.');
    }
  };

  const handleDeleteSuggestion = async (id: string) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await api.adminDeleteSuggestion(id);
      setActionMsg('Sugestão removida.');
      await loadSuggestions();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao excluir sugestão.');
    }
  };

  const resetPromoForm = () => {
    setEditingPromoId(null);
    setPromoCodeInput('');
    setPromoDescInput('');
    setPromoRewardType('skin');
    setPromoSkinId('meu_ratao');
    setPromoCoinAmount(100);
    setPromoSpecialLabel('Passe Especial Beta');
    setPromoInfinite(false);
    setPromoMaxUses(25);
    setPromoExpiresAt('');
    setPromoActive(true);
  };

  const handleSavePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    try {
      const isoExpires = promoExpiresAt.trim()
        ? new Date(promoExpiresAt).toISOString()
        : null;
      const payload = {
        code: promoCodeInput.trim().toUpperCase(),
        description: promoDescInput.trim(),
        rewardType: promoRewardType,
        rewardSkinId: promoRewardType === 'skin' ? promoSkinId : null,
        rewardAmount: promoRewardType === 'coins' ? Math.max(1, Number(promoCoinAmount) || 0) : 0,
        rewardMetadata:
          promoRewardType === 'special' || promoRewardType === 'future_item'
            ? { label: promoSpecialLabel.trim() || 'Item Especial' }
            : {},
        maxUses: promoInfinite ? null : Math.max(1, Number(promoMaxUses) || 1),
        isInfinite: promoInfinite,
        active: promoActive,
        expiresAt: isoExpires,
      };
      if (editingPromoId) {
        await api.adminUpdatePromoCode(editingPromoId, payload);
        setActionMsg(`Código ${payload.code} atualizado com sucesso!`);
      } else {
        await api.adminCreatePromoCode(payload);
        setActionMsg(`Código promocional ${payload.code} criado com sucesso!`);
      }
      resetPromoForm();
      await loadPromoCodes();
      await loadDashboard();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao salvar código promocional.');
    }
  };

  const handleEditPromo = (p: PromoCodeRecord) => {
    setEditingPromoId(p.id);
    setPromoCodeInput(p.code);
    setPromoDescInput(p.description);
    setPromoRewardType(p.rewardType);
    setPromoSkinId(p.rewardSkinId || 'meu_ratao');
    setPromoCoinAmount(p.rewardAmount || 100);
    setPromoSpecialLabel(String(p.rewardMetadata?.label || 'Item Especial'));
    setPromoInfinite(p.isInfinite);
    setPromoMaxUses(p.maxUses || 25);
    setPromoExpiresAt(p.expiresAt ? p.expiresAt.slice(0, 16) : '');
    setPromoActive(p.active);
  };

  const handleTogglePromoActive = async (p: PromoCodeRecord) => {
    setActionErr(null);
    try {
      await api.adminUpdatePromoCode(p.id, { active: !p.active });
      await loadPromoCodes();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao alterar status do código.');
    }
  };

  const handleDeletePromo = async (id: string) => {
    setActionErr(null);
    try {
      await api.adminDeletePromoCode(id);
      if (selectedPromoRedemptions?.records.some((r) => r.promoCodeId === id)) {
        setSelectedPromoRedemptions(null);
      }
      setActionMsg('Código promocional excluído.');
      await loadPromoCodes();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao excluir código.');
    }
  };

  const handleInspectPromoRedemptions = async (p: PromoCodeRecord) => {
    setActionErr(null);
    try {
      const res = await api.adminListPromoRedemptions(p.id);
      setSelectedPromoRedemptions({ code: p.code, records: res.redemptions });
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Erro ao carregar resgates.');
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
                  onClick={() => {
                    setPanelPassErr(null);
                    setPanelCurrentPass('');
                    setPanelNewPass('');
                    setPanelConfirmPass('');
                    setShowChangePasswordModal(true);
                  }}
                  title="Alterar minha senha administrativa"
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Alterar Senha</span>
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
                  { id: 'manage_skins', label: 'Gerenciar Skins', icon: Layers },
                  { id: 'admin_skins', label: 'Skins Admin', icon: Crown },
                  { id: 'messages', label: 'Mensagens Globais', icon: Megaphone },
                  { id: 'polls', label: 'Votações Globais', icon: Vote },
                  { id: 'gifts', label: 'Presentear Skins', icon: Gift },
                  { id: 'suggestions', label: 'Sugestões', icon: Lightbulb },
                  { id: 'promo_codes', label: 'Códigos', icon: Ticket },
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
                        {getSkinDefinition(stats.mostUsedSkin).name}
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

              {/* Tab: GERENCIAR SKINS (Conceder Todas / Consultar / Revogar em Massa / Histórico) */}
              {tab === 'manage_skins' && (
                <div className="space-y-5">
                  {/* Destaque Principal: CONCEDER TODAS AS SKINS */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/30 border-2 border-amber-500/50 space-y-4 shadow-lg">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5 max-w-2xl">
                        <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                          GERENCIAR SKINS · CONCESSÃO COMPLETA
                        </span>
                        <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                          <Layers className="w-5 h-5 text-amber-400" />
                          GERENCIAR SKINS DO CATÁLOGO
                        </h3>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Desbloqueie de uma só vez todas as{' '}
                          <strong className="text-white">
                            {BULK_GRANTABLE_ALL_SKIN_IDS.length} skins elegíveis
                          </strong>{' '}
                          (skins comuns, Meu Ratão e todas as skins famosas/especiais) para um
                          jogador específico no Neon PostgreSQL.
                        </p>
                        <p className="text-[11px] text-amber-200/80">
                          Segurança ativa: <strong>Ratão Rei</strong>, <strong>Top 1</strong>,{' '}
                          <strong>Top 2</strong>, <strong>Top 3</strong>, cargos administrativos e
                          posições no ranking nunca são concedidos por este recurso.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => openBulkGrantModal()}
                        className="px-5 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:via-orange-400 hover:to-rose-500 text-white font-display font-extrabold text-sm tracking-wide flex items-center gap-2 shadow-xl shadow-amber-950/50 cursor-pointer shrink-0"
                      >
                        <Sparkles className="w-4 h-4" />
                        CONCEDER TODAS AS SKINS
                      </button>
                    </div>
                  </div>

                  {/* Consultar Quantidade & Inventário de Skins de um Jogador */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                    <div>
                      <h4 className="font-display text-base font-bold text-white flex items-center gap-2">
                        <Search className="w-4 h-4 text-sky-400" />
                        CONSULTAR SKINS DE UM JOGADOR
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Pesquise um jogador pelo nickname para conferir quantas skins ele possui,
                        conceder todas ou remover somente as skins concedidas em massa.
                      </p>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void loadPlayerSkinsSummary(skinsSearchNickname);
                      }}
                      className="flex flex-wrap items-center gap-2.5"
                    >
                      <div className="relative flex-1 min-w-[220px]">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={skinsSearchNickname}
                          onChange={(e) => setSkinsSearchNickname(e.target.value)}
                          placeholder="Digite o nickname do jogador..."
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={summaryLoading}
                        className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-xs cursor-pointer disabled:opacity-60"
                      >
                        {summaryLoading ? 'CONSULTANDO...' : 'CONSULTAR INVENTÁRIO'}
                      </button>
                    </form>

                    {manageQuickMatches.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                          Sugestões:
                        </span>
                        {manageQuickMatches.map((mp) => (
                          <button
                            key={mp.id}
                            type="button"
                            onClick={() => void loadPlayerSkinsSummary(mp.nickname)}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-400 text-[11px] font-bold text-slate-200 cursor-pointer"
                          >
                            {mp.nickname}
                          </button>
                        ))}
                      </div>
                    )}

                    {playerSkinsSummary && (
                      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-lg font-bold text-white">
                                {playerSkinsSummary.nickname}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  playerSkinsSummary.role === 'admin'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {playerSkinsSummary.role === 'admin' ? 'Administrador' : 'Jogador'}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                Equipada: {getSkinDefinition(playerSkinsSummary.equippedSkin).name}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openBulkGrantModal(playerSkinsSummary.nickname)}
                              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              CONCEDER TODAS AS SKINS
                            </button>

                            <button
                              type="button"
                              disabled={playerSkinsSummary.bulkGrantedCount === 0}
                              onClick={() =>
                                setPendingBulkRevokeTarget({
                                  userId: playerSkinsSummary.userId,
                                  nickname: playerSkinsSummary.nickname,
                                  bulkCount: playerSkinsSummary.bulkGrantedCount,
                                  legitCount: playerSkinsSummary.legitimateSpecialCount,
                                })
                              }
                              className="px-3.5 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 border border-rose-700/60 text-rose-200 font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              REMOVER SKINS CONCEDIDAS EM MASSA ({playerSkinsSummary.bulkGrantedCount})
                            </button>
                          </div>
                        </div>

                        {/* Contadores de Skins */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Total Desbloqueadas
                            </div>
                            <div className="font-mono-num text-xl font-extrabold text-white mt-0.5">
                              {playerSkinsSummary.totalUnlockedCount} / {playerSkinsSummary.totalCatalogSkins}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Skins Comuns
                            </div>
                            <div className="font-mono-num text-xl font-extrabold text-sky-300 mt-0.5">
                              {playerSkinsSummary.commonUnlockedCount} / {playerSkinsSummary.commonTotalCount}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Especiais & Famosas
                            </div>
                            <div className="font-mono-num text-xl font-extrabold text-amber-300 mt-0.5">
                              {playerSkinsSummary.specialUnlockedCount} / {playerSkinsSummary.specialTotalCount}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Via Concessão em Massa
                            </div>
                            <div className="font-mono-num text-xl font-extrabold text-orange-300 mt-0.5">
                              {playerSkinsSummary.bulkGrantedCount}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Legítimas (Preservadas)
                            </div>
                            <div className="font-mono-num text-xl font-extrabold text-emerald-300 mt-0.5">
                              {playerSkinsSummary.legitimateSpecialCount}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Protegidas (Rei / Top 1-3)
                            </div>
                            <div className="font-mono-num text-xl font-extrabold text-fuchsia-300 mt-0.5">
                              {playerSkinsSummary.protectedExclusiveOwned.length}
                            </div>
                          </div>
                        </div>

                        {/* Lista das Skins do Jogador */}
                        <div>
                          <div className="text-[11px] font-bold uppercase text-slate-400 mb-2">
                            Inventário Atual ({playerSkinsSummary.unlockedSkinIds.length} skins)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {playerSkinsSummary.unlockedSkinIds.map((skinId) => {
                              const isProtected =
                                playerSkinsSummary.protectedExclusiveOwned.includes(skinId);
                              const isBulk =
                                playerSkinsSummary.bulkGrantedSkinIds.includes(skinId);
                              const isLegitSpecial =
                                playerSkinsSummary.legitimateSpecialSkinIds.includes(skinId);
                              return (
                                <span
                                  key={skinId}
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                    isProtected
                                      ? 'bg-fuchsia-950/60 border-fuchsia-500/50 text-fuchsia-200'
                                      : isLegitSpecial
                                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                                      : isBulk
                                      ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                                      : 'bg-slate-950 border-slate-800 text-slate-300'
                                  }`}
                                >
                                  {getSkinDefinition(skinId).name}
                                  {isBulk ? ' · Massa' : isLegitSpecial ? ' · Legítima' : isProtected ? ' · Protegida' : ''}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Histórico de Concessões */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-display text-base font-bold text-white flex items-center gap-2">
                          <History className="w-4 h-4 text-amber-400" />
                          HISTÓRICO DE CONCESSÕES ({grantHistory.length})
                        </h4>
                        <p className="text-xs text-slate-400">
                          Registro persistente de concessões completas e remoções em massa.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={historyFilterNickname}
                          onChange={(e) => setHistoryFilterNickname(e.target.value)}
                          placeholder="Filtrar por nickname..."
                          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void loadGrantHistory(historyFilterNickname)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                          Atualizar
                        </button>
                      </div>
                    </div>

                    {historyLoading ? (
                      <div className="text-xs text-slate-400">Carregando histórico de concessões...</div>
                    ) : grantHistory.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 text-center">
                        Nenhuma concessão ou remoção em massa registrada ainda.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {grantHistory.map((h) => {
                          const isGrant = h.action === 'grant_all';
                          const previewNames = h.skinsAffected
                            .slice(0, 6)
                            .map((s) => getSkinDefinition(s).name)
                            .join(', ');
                          const remainingCount = Math.max(0, h.skinsAffected.length - 6);
                          return (
                            <div
                              key={h.id}
                              className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                      isGrant
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    }`}
                                  >
                                    {isGrant ? 'CONCEDER TODAS' : 'REMOÇÃO EM MASSA'}
                                  </span>
                                  <span className="font-bold text-sm text-white">
                                    {h.targetNickname}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    por <strong className="text-slate-200">{h.adminNickname}</strong>
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500">
                                  {new Date(h.createdAt).toLocaleString('pt-BR')}
                                </span>
                              </div>
                              <div className="text-xs text-slate-300">
                                {isGrant ? (
                                  <>
                                    <strong className="text-emerald-300">+{h.skinsCount}</strong>{' '}
                                    skin(s) desbloqueada(s) ({h.alreadyOwnedCount} já possuía) · Total
                                    após: <strong>{h.totalSkinsAfter}</strong>
                                  </>
                                ) : (
                                  <>
                                    <strong className="text-rose-300">-{h.skinsCount}</strong>{' '}
                                    skin(s) removida(s) ({h.alreadyOwnedCount} especiais legítimas
                                    preservadas) · Total após: <strong>{h.totalSkinsAfter}</strong>
                                  </>
                                )}
                              </div>
                              {h.skinsAffected.length > 0 && (
                                <div className="text-[11px] text-slate-400 truncate">
                                  Skins: {previewNames}
                                  {remainingCount > 0 ? ` e +${remainingCount} outra(s)` : ''}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Skins Admin (Desbloquear Skin Ratão Rei) */}
              {tab === 'admin_skins' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-slate-950 border-2 border-amber-500/50 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                          EXCLUSIVA DO ADMINISTRADOR
                        </span>
                        <h3 className="font-display text-xl font-bold text-white mt-2 flex items-center gap-2">
                          <Crown className="w-5 h-5 text-amber-400" />
                          DESBLOQUEAR SKIN RATÃO REI
                        </h3>
                        <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                          Coroa dourada, manto real e escolta de 5 ratinhos. Esta skin permanece
                          estritamente exclusiva para contas administrativas: jogadores comuns nunca
                          podem desbloqueá-la e ela nunca pode ser enviada como presente.
                        </p>
                      </div>

                      <div
                        className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold ${
                          adminProfile?.allowedExclusiveSkins?.includes('ratao_rei')
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-rose-500/20 border-rose-400 text-rose-300'
                        }`}
                      >
                        {adminProfile?.allowedExclusiveSkins?.includes('ratao_rei')
                          ? 'DESBLOQUEADA PARA SUA CONTA'
                          : 'BLOQUEADA (CLIQUE ABAIXO)'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        disabled={unlockKingBusy}
                        onClick={() => void handleUnlockKingSkin()}
                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-display font-bold text-sm flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-60"
                      >
                        <Crown className="w-4 h-4" />
                        {unlockKingBusy ? 'DESBLOQUEANDO...' : 'DESBLOQUEAR PARA MIM'}
                      </button>
                      <span className="text-[11px] text-slate-400">
                        Após desbloquear, abra o menu <strong>SKINS</strong> para equipar o Ratão Rei.
                      </span>
                    </div>
                  </div>

                  {/* Skin Secreta Exclusiva do Admin: Plankton */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/60 via-slate-950 to-slate-950 border-2 border-emerald-500/45 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                          SKIN SECRETA · INVISÍVEL NO CATÁLOGO PÚBLICO
                        </span>
                        <h3 className="font-display text-xl font-bold text-white mt-2 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-emerald-400" />
                          SKIN SECRETA: PLANKTON
                        </h3>
                        <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                          Oculta completamente para jogadores comuns (não aparece bloqueada, nem em presentes, códigos promocionais ou concessão em massa). Apenas quem receber acesso por esta seção pode vê-la e equipá-la.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={secretGrantBusy}
                        onClick={() => void handleGrantSecretSkin(adminProfile?.nickname || undefined)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-60"
                      >
                        <Unlock className="w-4 h-4" />
                        {secretGrantBusy ? 'LIBERANDO...' : 'LIBERAR PLANKTON PARA MIM'}
                      </button>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleGrantSecretSkin();
                      }}
                      className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={secretGrantNickname}
                            onChange={(e) => setSecretGrantNickname(e.target.value)}
                            placeholder="Liberar Plankton para outro jogador (nickname exato)..."
                            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={secretGrantBusy || !secretGrantNickname.trim()}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          CONCEDER SECRETA
                        </button>
                      </div>

                      {secretQuickMatches.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                            Jogadores:
                          </span>
                          {secretQuickMatches.map((mp) => (
                            <button
                              key={mp.id}
                              type="button"
                              onClick={() => setSecretGrantNickname(mp.nickname)}
                              className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 hover:border-emerald-400 text-[11px] font-bold text-slate-200 cursor-pointer"
                            >
                              {mp.nickname}
                            </button>
                          ))}
                        </div>
                      )}
                    </form>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase text-emerald-300">
                          Contas com Plankton ({secretOwners.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => void loadSecretOwners()}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${secretOwnersLoading ? 'animate-spin' : ''}`} />
                          Atualizar
                        </button>
                      </div>
                      {secretOwnersLoading ? (
                        <div className="text-xs text-slate-400">Consultando skin secreta...</div>
                      ) : secretOwners.length === 0 ? (
                        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400">
                          Nenhuma conta possui a skin secreta Plankton no momento.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {secretOwners.map((owner) => (
                            <div
                              key={owner.id}
                              className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-white">{owner.nickname}</span>
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                  PLANKTON
                                </span>
                                {owner.equipped && (
                                  <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                                    EQUIPADA
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={secretRevokeBusyId === owner.userId}
                                onClick={() =>
                                  void handleRevokeSecretSkin(owner.userId, owner.nickname)
                                }
                                className="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <Trash2 className="w-3 h-3" />
                                {secretRevokeBusyId === owner.userId ? 'Removendo...' : 'Revogar'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Skin Administrativa Exclusiva: Baby Yoda */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-lime-950/60 via-slate-950 to-slate-950 border-2 border-lime-500/45 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="px-2.5 py-1 rounded bg-lime-500/20 border border-lime-400/50 text-lime-300 text-[10px] font-extrabold uppercase tracking-wider">
                          EXCLUSIVA DE ADMINISTRADOR · INVISÍVEL NO CATÁLOGO PÚBLICO
                        </span>
                        <h3 className="font-display text-xl font-bold text-white mt-2 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-lime-400" />
                          SKIN ADMINISTRATIVA: BABY YODA
                        </h3>
                        <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                          Modelo 3D voxel com túnica bege de gola alta, orelhas animadas e celebração da Força. Nunca aparece bloqueada ou em silhueta para jogadores comuns, nem pode ser resgatada por códigos ou concessão em massa. <strong>Ratão</strong> e <strong>Samuka</strong> já possuem acesso direto automático.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1.5 rounded-xl bg-lime-500/15 border border-lime-400/50 text-lime-300 text-[11px] font-extrabold">
                          ACESSO NATIVO: RATÃO & SAMUKA
                        </span>
                        {currentUser?.role === 'admin' && (
                          <button
                            type="button"
                            disabled={babyYodaEquipBusy || currentUser.equippedSkin === 'baby_yoda'}
                            onClick={() => void handleEquipBabyYodaForAdmin()}
                            className="px-4 py-2 rounded-xl bg-lime-600 hover:bg-lime-500 text-slate-950 font-display font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-60"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {currentUser.equippedSkin === 'baby_yoda'
                              ? 'BABY YODA EQUIPADA'
                              : babyYodaEquipBusy
                                ? 'EQUIPANDO...'
                                : 'EQUIPAR BABY YODA'}
                          </button>
                        )}
                      </div>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleGrantBabyYoda();
                      }}
                      className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={babyYodaGrantNickname}
                            onChange={(e) => setBabyYodaGrantNickname(e.target.value)}
                            placeholder="Conceder Baby Yoda a um jogador (nickname exato)..."
                            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={babyYodaGrantBusy || !babyYodaGrantNickname.trim()}
                          className="px-4 py-2 rounded-lg bg-lime-600 hover:bg-lime-500 disabled:opacity-50 text-slate-950 font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          {babyYodaGrantBusy ? 'CONCEDENDO...' : 'CONCEDER BABY YODA'}
                        </button>
                      </div>

                      {babyYodaQuickMatches.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                            Jogadores:
                          </span>
                          {babyYodaQuickMatches.map((mp) => (
                            <button
                              key={mp.id}
                              type="button"
                              onClick={() => setBabyYodaGrantNickname(mp.nickname)}
                              className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 hover:border-lime-400 text-[11px] font-bold text-slate-200 cursor-pointer"
                            >
                              {mp.nickname}
                            </button>
                          ))}
                        </div>
                      )}
                    </form>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase text-lime-300">
                          Jogadores com autorização Baby Yoda ({babyYodaOwners.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => void loadBabyYodaOwners()}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${babyYodaOwnersLoading ? 'animate-spin' : ''}`} />
                          Atualizar
                        </button>
                      </div>
                      {babyYodaOwnersLoading ? (
                        <div className="text-xs text-slate-400">Consultando autorizações da skin Baby Yoda...</div>
                      ) : babyYodaOwners.length === 0 ? (
                        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400">
                          Nenhum jogador comum possui autorização para Baby Yoda no momento (apenas Ratão e Samuka).
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {babyYodaOwners.map((owner) => (
                            <div
                              key={owner.id}
                              className="p-2.5 rounded-xl bg-slate-900/80 border border-lime-500/30 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-xs text-white">{owner.nickname}</span>
                                <span className="px-2 py-0.5 rounded bg-lime-500/20 text-lime-300 text-[10px] font-bold">
                                  BABY YODA
                                </span>
                                {owner.equipped && (
                                  <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                                    EQUIPADA
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-400">
                                  Concedida por <strong className="text-slate-200">{owner.grantedBy || 'Admin'}</strong>
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={babyYodaRevokeBusyId === owner.userId}
                                onClick={() =>
                                  void handleRevokeBabyYoda(owner.userId, owner.nickname)
                                }
                                className="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <Trash2 className="w-3 h-3" />
                                {babyYodaRevokeBusyId === owner.userId ? 'Revogando...' : 'Revogar'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gerenciar Skins Exclusivas Bloqueadas + Meu Ratão */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-5">
                    <div>
                      <span className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/50 text-sky-300 text-[10px] font-extrabold uppercase tracking-wider">
                        CONTROLE DE PERMISSÕES POR JOGADOR
                      </span>
                      <h3 className="font-display text-lg font-bold text-white mt-2 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-rose-400" />
                        SKINS EXCLUSIVAS BLOQUEADAS (LIBERAR, CONSULTAR & REVOGAR)
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Todas as skins exclusivas começam bloqueadas para todos os jogadores. Libere
                        para um jogador específico pelo nickname, consulte quem possui cada skin ou
                        remova a permissão a qualquer momento.
                      </p>
                    </div>

                    {/* Formulário de Liberação */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleGrantExclusiveSkin();
                      }}
                      className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Selecionar Skin Bloqueada
                          </label>
                          <select
                            value={grantSkinId}
                            onChange={(e) => setGrantSkinId(e.target.value as SkinId)}
                            className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-semibold"
                          >
                            {MANAGEABLE_LOCKED_SKINS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-5 relative">
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Pesquisar Jogador pelo Nickname
                          </label>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={grantSkinNickname}
                              onChange={(e) => setGrantSkinNickname(e.target.value)}
                              placeholder="Digite o nickname..."
                              className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2 flex items-end">
                          <button
                            type="submit"
                            disabled={grantBusy}
                            className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            {grantBusy ? 'LIBERANDO...' : 'LIBERAR'}
                          </button>
                        </div>
                      </div>

                      {quickPlayerMatches.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                            Jogadores encontrados:
                          </span>
                          {quickPlayerMatches.map((mp) => {
                            const alreadyHas = mp.activeExclusivePermissions?.includes(grantSkinId);
                            return (
                              <button
                                key={mp.id}
                                type="button"
                                onClick={() => setGrantSkinNickname(mp.nickname)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                                  alreadyHas
                                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                    : 'bg-slate-950 border-slate-700 text-slate-200 hover:border-sky-400'
                                }`}
                              >
                                {mp.nickname} {alreadyHas ? '✓ já possui' : ''}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </form>

                    {/* Consultar Quem Possui Cada Skin + Revogar */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-extrabold uppercase text-slate-300">
                          Consultar Possuidores ({exclusiveOwners.length})
                        </h4>
                        <div className="flex items-center gap-2">
                          <select
                            value={ownerSkinFilter}
                            onChange={(e) => setOwnerSkinFilter(e.target.value as 'all' | SkinId)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          >
                            <option value="all">Todas as Skins Bloqueadas</option>
                            {MANAGEABLE_LOCKED_SKINS.map((s) => (
                              <option key={s.id} value={s.id}>
                                Apenas: {s.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void loadExclusiveOwners(ownerSkinFilter)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${ownersLoading ? 'animate-spin' : ''}`} />
                            Atualizar
                          </button>
                        </div>
                      </div>

                      {ownersLoading ? (
                        <div className="text-xs text-slate-400">Consultando permissões ativas...</div>
                      ) : exclusiveOwners.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 text-center">
                          Nenhum jogador possui permissão ativa para este filtro.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {exclusiveOwners.map((owner) => {
                            const skinDef = getSkinDefinition(owner.skinId);
                            const busyKey = `${owner.userId}:${owner.skinId}`;
                            return (
                              <div
                                key={owner.id}
                                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className="w-8 h-8 rounded-lg shrink-0 border border-white/20"
                                    style={{
                                      background: `linear-gradient(135deg, ${skinDef.primaryColor}, ${skinDef.accentColor})`,
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-bold text-sm text-white">
                                        {owner.nickname}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                                        {skinDef.name}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                                        {owner.reason === 'promo_code'
                                          ? 'Código Promocional'
                                          : owner.reason === 'admin_bulk_grant'
                                          ? 'Concessão em Massa'
                                          : 'Liberada pelo Admin'}
                                      </span>
                                      {owner.equipped && (
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                          EQUIPADA
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                      Liberada em {new Date(owner.grantedAt).toLocaleString('pt-BR')}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={revokeBusyKey === busyKey}
                                  onClick={() =>
                                    void handleRevokeExclusiveSkin(
                                      owner.userId,
                                      owner.skinId,
                                      owner.nickname
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  {revokeBusyKey === busyKey ? 'Removendo...' : 'Remover Permissão'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
                        Selecione uma Skin Presenteável (Ratão Rei e Top 1/2/3 são intransferíveis)
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                        {GIFTABLE_SKINS.map((s) => {
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
                          <strong>{getSkinDefinition(pendingGiftConfirm.skinId).name}</strong> para{' '}
                          <strong>{pendingGiftConfirm.nickname}</strong>?
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
                            {getSkinDefinition(g.skinId).name}
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

              {/* Tab: Sugestões dos Jogadores */}
              {tab === 'suggestions' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-display font-bold text-sm text-amber-300 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" /> SUGESTÕES DOS JOGADORES
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        Sugestões aprovadas enviam notificação ao jogador e nunca são publicadas automaticamente.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div className="sm:col-span-2 relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={sugSearch}
                          onChange={(e) => setSugSearch(e.target.value)}
                          placeholder="Buscar por jogador, título ou código SUG-..."
                          className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                      </div>
                      <select
                        value={sugTypeFilter}
                        onChange={(e) => setSugTypeFilter(e.target.value as 'all' | 'map' | 'skin')}
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                      >
                        <option value="all">Todos os Tipos</option>
                        <option value="map">Apenas Mapas</option>
                        <option value="skin">Apenas Skins</option>
                      </select>
                      <select
                        value={sugStatusFilter}
                        onChange={(e) =>
                          setSugStatusFilter(e.target.value as 'all' | SuggestionStatus)
                        }
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                      >
                        <option value="all">Todos os Status</option>
                        <option value="received">Recebida</option>
                        <option value="in_review">Em Análise</option>
                        <option value="approved">Aprovada</option>
                        <option value="rejected">Recusada</option>
                      </select>
                    </div>
                  </div>

                  {sugLoading ? (
                    <div className="text-xs text-slate-400">Carregando sugestões...</div>
                  ) : suggestions.length === 0 ? (
                    <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                      Nenhuma sugestão encontrada para os filtros selecionados.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {suggestions.map((s) => {
                        const meta = SUGGESTION_STATUS_META[s.status];
                        const draftStatus = sugDraftStatus[s.id] || s.status;
                        const draftNote = sugDraftNotes[s.id] ?? (s.adminNote || '');
                        return (
                          <div
                            key={s.id}
                            className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                                    {s.code}
                                  </span>
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                    {s.type === 'map' ? 'Sugestão de Mapa' : 'Sugestão de Skin'}
                                  </span>
                                  <span
                                    className={`text-[11px] font-bold px-2 py-0.5 rounded border ${meta.badgeClass}`}
                                  >
                                    {meta.label}
                                  </span>
                                </div>
                                <h5 className="font-display text-base font-bold text-white mt-1.5">
                                  {s.title}
                                </h5>
                                <div className="text-[11px] text-slate-400">
                                  Enviada por <strong className="text-slate-200">{s.authorNickname}</strong> em{' '}
                                  {new Date(s.createdAt).toLocaleString('pt-BR')}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDeleteSuggestion(s.id)}
                                title="Excluir sugestão"
                                className="p-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <p className="text-xs text-slate-200 whitespace-pre-wrap bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                              {s.description}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                              <select
                                value={draftStatus}
                                onChange={(e) =>
                                  setSugDraftStatus((prev) => ({
                                    ...prev,
                                    [s.id]: e.target.value as SuggestionStatus,
                                  }))
                                }
                                className="sm:col-span-3 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                              >
                                <option value="received">Recebida</option>
                                <option value="in_review">Em Análise</option>
                                <option value="approved">Aprovada</option>
                                <option value="rejected">Recusada</option>
                              </select>
                              <input
                                type="text"
                                value={draftNote}
                                onChange={(e) =>
                                  setSugDraftNotes((prev) => ({
                                    ...prev,
                                    [s.id]: e.target.value,
                                  }))
                                }
                                placeholder="Observação do administrador (opcional)"
                                maxLength={300}
                                className="sm:col-span-6 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveSuggestionModeration(s.id)}
                                className="sm:col-span-3 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                              >
                                Salvar Revisão
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Gerenciar Códigos Promocionais */}
              {tab === 'promo_codes' && (
                <div className="space-y-5">
                  <form
                    onSubmit={handleSavePromoCode}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-display font-bold text-sm text-emerald-300 flex items-center gap-2">
                        <Ticket className="w-4 h-4" />
                        {editingPromoId
                          ? `EDITAR CÓDIGO PROMOCIONAL (${promoCodeInput})`
                          : 'GERENCIAR CÓDIGOS — CRIAR NOVO'}
                      </h4>
                      {editingPromoId && (
                        <button
                          type="button"
                          onClick={resetPromoForm}
                          className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                        >
                          Cancelar edição
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        disabled={Boolean(editingPromoId)}
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                        placeholder="CÓDIGO (EX: MEURATAO2026)"
                        maxLength={32}
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono-num uppercase text-sm disabled:opacity-60"
                      />
                      <input
                        type="text"
                        required
                        value={promoDescInput}
                        onChange={(e) => setPromoDescInput(e.target.value)}
                        placeholder="Descrição da recompensa"
                        maxLength={140}
                        className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Tipo de Recompensa
                        </label>
                        <select
                          value={promoRewardType}
                          onChange={(e) => setPromoRewardType(e.target.value as PromoRewardType)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        >
                          <option value="skin">Skin (Inclui Bloqueadas e Meu Ratão)</option>
                          <option value="coins">Moedas Coletadas</option>
                          <option value="special">Recompensa Especial</option>
                          <option value="future_item">Item Futuro</option>
                        </select>
                      </div>

                      {promoRewardType === 'skin' ? (
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Skin Entregue
                          </label>
                          <select
                            value={promoSkinId}
                            onChange={(e) => setPromoSkinId(e.target.value as SkinId)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          >
                            {GIFTABLE_SKINS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : promoRewardType === 'coins' ? (
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Quantidade de Moedas
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={1000000}
                            value={promoCoinAmount}
                            onChange={(e) => setPromoCoinAmount(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Nome do Item / Benefício
                          </label>
                          <input
                            type="text"
                            value={promoSpecialLabel}
                            onChange={(e) => setPromoSpecialLabel(e.target.value)}
                            maxLength={80}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Expiração (opcional)
                        </label>
                        <input
                          type="datetime-local"
                          value={promoExpiresAt}
                          onChange={(e) => setPromoExpiresAt(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-200">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={promoInfinite}
                          onChange={(e) => setPromoInfinite(e.target.checked)}
                        />
                        Usos Ilimitados (1 resgate por jogador)
                      </label>

                      {!promoInfinite && (
                        <label className="flex items-center gap-2">
                          <span>Limite total de usos:</span>
                          <input
                            type="number"
                            min={1}
                            max={1000000}
                            value={promoMaxUses}
                            onChange={(e) => setPromoMaxUses(Number(e.target.value))}
                            className="w-24 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        </label>
                      )}

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={promoActive}
                          onChange={(e) => setPromoActive(e.target.checked)}
                        />
                        Código Ativo
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-xs cursor-pointer"
                    >
                      {editingPromoId ? 'SALVAR ALTERAÇÕES' : 'CRIAR CÓDIGO PROMOCIONAL'}
                    </button>
                  </form>

                  <div className="space-y-2.5">
                    <h4 className="text-xs font-extrabold uppercase text-slate-400">
                      Códigos Cadastrados ({promoCodes.length})
                    </h4>
                    {promoLoading ? (
                      <div className="text-xs text-slate-400">Carregando códigos...</div>
                    ) : promoCodes.length === 0 ? (
                      <div className="text-xs text-slate-500">Nenhum código criado ainda.</div>
                    ) : (
                      promoCodes.map((p) => (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono-num text-sm font-extrabold text-amber-300">
                                {p.code}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  p.active
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {p.active ? 'ATIVO' : 'INATIVO'}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-bold">
                                {p.rewardType === 'skin' && p.rewardSkinId
                                  ? `Skin: ${getSkinDefinition(p.rewardSkinId).name}`
                                  : p.rewardType === 'coins'
                                    ? `+${p.rewardAmount} moedas`
                                    : String(p.rewardMetadata?.label || p.rewardType)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300">{p.description}</div>
                            <div className="text-[11px] text-slate-500">
                              Resgates: <strong className="text-slate-200">{p.usedCount}</strong> /{' '}
                              {p.isInfinite ? 'Ilimitado' : p.maxUses} ·{' '}
                              {p.expiresAt
                                ? `Expira ${new Date(p.expiresAt).toLocaleString('pt-BR')}`
                                : 'Sem expiração'}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleInspectPromoRedemptions(p)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold cursor-pointer"
                            >
                              Ver Resgates
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditPromo(p)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleTogglePromoActive(p)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer"
                            >
                              {p.active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeletePromo(p.id)}
                              className="p-1.5 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {selectedPromoRedemptions && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-sky-500/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-extrabold uppercase text-sky-300">
                          Histórico de Resgates · {selectedPromoRedemptions.code} (
                          {selectedPromoRedemptions.records.length})
                        </h5>
                        <button
                          type="button"
                          onClick={() => setSelectedPromoRedemptions(null)}
                          className="text-xs text-slate-400 hover:text-white cursor-pointer"
                        >
                          Fechar
                        </button>
                      </div>
                      {selectedPromoRedemptions.records.length === 0 ? (
                        <div className="text-xs text-slate-500">Nenhum resgate registrado ainda.</div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {selectedPromoRedemptions.records.map((r) => (
                            <div
                              key={r.id}
                              className="px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs flex items-center justify-between"
                            >
                              <span>
                                <strong className="text-white">{r.nickname}</strong> — {r.rewardSummary}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(r.redeemedAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
                                {getSkinDefinition(p.equippedSkin).name}
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
                                {getSkinDefinition(sk).name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5 text-rose-400" /> Permissões das Skins Bloqueadas
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {MANAGEABLE_LOCKED_SKINS.map((sk) => {
                              const hasPerm = Boolean(
                                selectedPlayer.activeExclusivePermissions?.includes(sk.id)
                              );
                              const busyKey = `${selectedPlayer.id}:${sk.id}`;
                              return (
                                <div
                                  key={sk.id}
                                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                                    hasPerm
                                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                                      : 'bg-slate-900 border-slate-800 text-slate-400'
                                  }`}
                                >
                                  <span className="truncate font-semibold">{sk.name}</span>
                                  {hasPerm ? (
                                    <button
                                      type="button"
                                      disabled={revokeBusyKey === busyKey}
                                      onClick={() =>
                                        void handleRevokeExclusiveSkin(
                                          selectedPlayer.id,
                                          sk.id,
                                          selectedPlayer.nickname
                                        )
                                      }
                                      className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 border border-rose-700/50 text-rose-200 text-[10px] font-bold cursor-pointer shrink-0"
                                    >
                                      Remover
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={grantBusy}
                                      onClick={() =>
                                        void handleGrantExclusiveSkin(
                                          selectedPlayer.nickname,
                                          sk.id
                                        )
                                      }
                                      className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold cursor-pointer shrink-0"
                                    >
                                      Liberar
                                    </button>
                                  )}
                                </div>
                              );
                            })}
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
                                    {getSkinDefinition(g.skinId).name}
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
                <div className="space-y-4">
                  {/* Alertas e Auditoria de Segurança */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold uppercase text-amber-300 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" /> Monitoramento & Alertas de Segurança ({securityLogs.length})
                      </h4>
                      {securitySummary && (
                        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                          <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-500/40 text-rose-300">
                            Críticos: {securitySummary.criticalCount}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-500/40 text-amber-300">
                            Altos: {securitySummary.highCount}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                            Bloqueios: {securitySummary.blockedAttemptsCount}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {securityLogs.length === 0 ? (
                        <div className="text-xs text-slate-500">
                          Nenhum evento suspeito recente registrado.
                        </div>
                      ) : (
                        securityLogs.slice(0, 25).map((ev) => (
                          <div
                            key={ev.id}
                            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <span
                                className={`font-bold mr-1.5 ${
                                  ev.severity === 'critical'
                                    ? 'text-rose-400'
                                    : ev.severity === 'high'
                                      ? 'text-amber-300'
                                      : 'text-sky-300'
                                }`}
                              >
                                [{ev.severity.toUpperCase()}] {ev.eventType}
                              </span>
                              <span className="text-slate-200 break-words">{ev.details}</span>
                              {ev.nickname && (
                                <span className="text-slate-400 ml-1.5">({ev.nickname})</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              {new Date(ev.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

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
                  <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
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

        {/* Modal de Confirmação: CONCEDER TODAS AS SKINS */}
        {showBulkGrantModal && (
          <div className="fixed inset-0 z-[60] bg-slate-950/85 flex items-center justify-center p-4">
            <form
              onSubmit={handleConfirmBulkGrantAllSkins}
              className="w-full max-w-md bg-slate-900 border-2 border-amber-500/70 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-white">
                      CONCEDER TODAS AS SKINS
                    </h3>
                    <p className="text-[11px] text-amber-300 font-semibold">
                      Desbloqueio em massa no Neon PostgreSQL
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkGrantModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-semibold text-white">
                Tem certeza de que deseja desbloquear todas as skins para um jogador?
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-bold uppercase text-slate-300">
                  Escolher Jogador pelo Nickname
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={bulkModalNickname}
                    onChange={(e) => setBulkModalNickname(e.target.value)}
                    placeholder="Digite o nickname exato do jogador..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
                {bulkModalMatches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {bulkModalMatches.map((mp) => (
                      <button
                        key={mp.id}
                        type="button"
                        onClick={() => setBulkModalNickname(mp.nickname)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          bulkModalNickname.trim().toLowerCase() === mp.nickname.toLowerCase()
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-sky-400'
                        }`}
                      >
                        {mp.nickname}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-slate-300 space-y-1">
                <div>
                  <strong className="text-emerald-300">Desbloqueia:</strong>{' '}
                  {BULK_GRANTABLE_ALL_SKIN_IDS.length} skins (comuns, Meu Ratão e todas as 16 skins
                  famosas/especiais).
                </div>
                <div>
                  <strong className="text-rose-300">NÃO concede:</strong> Ratão Rei, Top 1, Top 2,
                  Top 3, privilégios administrativos ou posição no ranking.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={bulkGrantBusy || !bulkModalNickname.trim()}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-display font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {bulkGrantBusy ? 'CONCEDENDO...' : 'CONFIRMAR E CONCEDER'}
                </button>
                <button
                  type="button"
                  disabled={bulkGrantBusy}
                  onClick={() => setShowBulkGrantModal(false)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold text-xs cursor-pointer"
                >
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal de Confirmação: REMOVER SKINS CONCEDIDAS EM MASSA */}
        {pendingBulkRevokeTarget && (
          <div className="fixed inset-0 z-[60] bg-slate-950/85 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500/70 rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-300 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-white">
                    REMOVER CONCESSÃO EM MASSA
                  </h3>
                  <p className="text-[11px] text-rose-300 font-semibold">
                    Jogador: {pendingBulkRevokeTarget.nickname}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 space-y-1.5 leading-relaxed">
                <p>
                  Serão removidas apenas as{' '}
                  <strong className="text-rose-300">
                    {pendingBulkRevokeTarget.bulkCount} skin(s)
                  </strong>{' '}
                  desbloqueadas por este recurso de concessão em massa.
                </p>
                <p>
                  Skins obtidas legitimamente (
                  <strong className="text-emerald-300">
                    {pendingBulkRevokeTarget.legitCount} por códigos promocionais / presentes
                  </strong>
                  , além das comuns e conquistas de ranking) serão{' '}
                  <strong className="text-emerald-300">totalmente preservadas</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={bulkRevokeBusy}
                  onClick={() => void handleConfirmBulkRevokeSkins()}
                  className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {bulkRevokeBusy ? 'REMOVENDO...' : 'CONFIRMAR REMOÇÃO'}
                </button>
                <button
                  type="button"
                  disabled={bulkRevokeBusy}
                  onClick={() => setPendingBulkRevokeTarget(null)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold text-xs cursor-pointer"
                >
                  CANCELAR
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Modal: Alterar Senha Administrativa */}
        {showChangePasswordModal && (
          <div className="fixed inset-0 z-[60] bg-slate-950/85 flex items-center justify-center p-4">
            <form
              onSubmit={handlePanelChangePassword}
              className="w-full max-w-md bg-slate-900 border border-emerald-500/60 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex items-center justify-center shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-white">
                      Alterar Senha Administrativa
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Conta: {adminProfile?.nickname}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {panelPassErr && (
                <div className="p-3 rounded-xl bg-red-950 border border-red-500/60 text-red-200 text-xs">
                  {panelPassErr}
                </div>
              )}

              <input
                type="password"
                required
                autoFocus
                value={panelCurrentPass}
                onChange={(e) => setPanelCurrentPass(e.target.value)}
                placeholder="Senha atual"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
              <input
                type="password"
                required
                value={panelNewPass}
                onChange={(e) => setPanelNewPass(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
              <input
                type="password"
                required
                value={panelConfirmPass}
                onChange={(e) => setPanelConfirmPass(e.target.value)}
                placeholder="Confirmar nova senha"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="submit"
                  disabled={panelPassBusy}
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {panelPassBusy ? 'SALVANDO...' : 'SALVAR SENHA'}
                </button>
                <button
                  type="button"
                  disabled={panelPassBusy}
                  onClick={() => setShowChangePasswordModal(false)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold text-xs cursor-pointer"
                >
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
