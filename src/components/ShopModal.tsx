import { Check, Coins, Shield, ShoppingBag, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getCachedSkateThumbnail,
  requestAllSkateThumbnails,
} from '../game/skinThumbnails.ts';
import { api } from '../services/api.ts';
import {
  PlayerSkateInventoryItem,
  SKATES_CATALOG,
  SkateDefinition,
  SkateId,
  UserProfile,
} from '../shared/constants.ts';

interface ShopModalProps {
  user: UserProfile;
  onUpdated: (patch: {
    availableCoins: number;
    equippedSkateId: SkateId | null;
    skateInventory: PlayerSkateInventoryItem[];
  }) => void;
  onClose: () => void;
}

export function ShopModal({ user, onUpdated, onClose }: ShopModalProps) {
  const [availableCoins, setAvailableCoins] = useState<number>(user.availableCoins ?? user.totalCoins);
  const [equippedSkateId, setEquippedSkateId] = useState<SkateId | null>(user.equippedSkateId ?? null);
  const [inventory, setInventory] = useState<PlayerSkateInventoryItem[]>(user.skateInventory || []);
  const [thumbs, setThumbs] = useState<Partial<Record<SkateId, string>>>({});
  const [confirmSkate, setConfirmSkate] = useState<SkateDefinition | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initial: Partial<Record<SkateId, string>> = {};
    for (const item of SKATES_CATALOG) {
      const c = getCachedSkateThumbnail(item.id);
      if (c) initial[item.id] = c;
    }
    if (Object.keys(initial).length > 0) setThumbs(initial);

    const stopThumbs = requestAllSkateThumbnails((id, url) => {
      setThumbs((prev) => ({ ...prev, [id]: url }));
    });

    api
      .getShopState()
      .then((res) => {
        setAvailableCoins(res.availableCoins);
        setEquippedSkateId(res.equippedSkateId);
        setInventory(res.inventory);
        onUpdated({
          availableCoins: res.availableCoins,
          equippedSkateId: res.equippedSkateId,
          skateInventory: res.inventory,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return stopThumbs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCharges = (skateId: SkateId): number =>
    inventory.find((i) => i.skateId === skateId)?.charges ?? 0;

  const handleBuy = async (skate: SkateDefinition) => {
    setBusyId(skate.id);
    setFeedback(null);
    try {
      const res = await api.buySkate(skate.id, 1);
      setAvailableCoins(res.availableCoins);
      setEquippedSkateId(res.equippedSkateId);
      setInventory(res.inventory);
      setConfirmSkate(null);
      onUpdated({
        availableCoins: res.availableCoins,
        equippedSkateId: res.equippedSkateId,
        skateInventory: res.inventory,
      });
      setFeedback({
        type: 'ok',
        text: `${skate.name} comprado (+1 carga)! Saldo restante: ${res.availableCoins.toLocaleString('pt-BR')} moedas.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao comprar skate.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleEquipToggle = async (skateId: SkateId) => {
    const next = equippedSkateId === skateId ? null : skateId;
    setBusyId(skateId);
    setFeedback(null);
    try {
      const res = await api.equipSkate(next);
      setEquippedSkateId(res.equippedSkateId);
      onUpdated({
        availableCoins,
        equippedSkateId: res.equippedSkateId,
        skateInventory: inventory,
      });
      setFeedback({
        type: 'ok',
        text: res.equippedSkateId
          ? 'Skate equipado! Pressione ESPAÇO (PC) ou toque duplo (Mobile) na corrida para usar.'
          : 'Skate desequipado.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao equipar skate.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-5xl max-h-[92dvh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-400" />
              LOJA DE SKATES
            </h2>
            <p className="text-xs text-slate-400">
              Cada carga absorve 1 batida fatal na corrida (ESPAÇO no PC ou toque duplo no Mobile). Gastar na loja não reduz seu recorde no Ranking!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-[10px] font-bold uppercase text-amber-200 leading-none">
                  Saldo Disponível
                </div>
                <div className="font-mono-num text-base font-extrabold text-white tabular-nums">
                  {availableCoins.toLocaleString('pt-BR')}
                </div>
              </div>
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

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {feedback && (
            <div
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border ${
                feedback.type === 'ok'
                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
                  : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {confirmSkate && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-400 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display font-bold text-sm text-white">
                  Confirmar compra: {confirmSkate.name}
                </div>
                <p className="text-xs text-amber-200">
                  Valor: <strong className="tabular-nums">{confirmSkate.price}</strong> moedas (+1 carga de proteção contra colisão).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmSkate(null)}
                  className="min-h-[40px] px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busyId === confirmSkate.id}
                  onClick={() => void handleBuy(confirmSkate)}
                  className="min-h-[40px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                >
                  {busyId === confirmSkate.id ? 'COMPRANDO...' : 'CONFIRMAR COMPRA'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Carregando loja...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SKATES_CATALOG.map((skate) => {
                const charges = getCharges(skate.id);
                const ownedEver = inventory.some((i) => i.skateId === skate.id);
                const equipped = equippedSkateId === skate.id;
                const canAfford = availableCoins >= skate.price;
                const thumb = thumbs[skate.id];

                return (
                  <div
                    key={skate.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition ${
                      equipped
                        ? 'bg-slate-800/90 border-emerald-400 shadow-lg'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-extrabold text-amber-300">
                          {skate.badge}
                        </span>
                        {ownedEver && (
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 text-[10px] font-extrabold tabular-nums">
                            {charges} {charges === 1 ? 'carga' : 'cargas'}
                          </span>
                        )}
                      </div>

                      <div className="h-28 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden mb-3">
                        {thumb ? (
                          <img src={thumb} alt={skate.name} className="w-28 h-28 object-contain" />
                        ) : (
                          <Sparkles className="w-7 h-7 text-amber-400" />
                        )}
                      </div>

                      <h3 className="font-display font-bold text-lg text-white">{skate.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">{skate.description}</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-bold flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-sky-400" /> Protege 1 batida
                        </span>
                        <span className="font-mono-num font-extrabold text-amber-300 flex items-center gap-1 tabular-nums">
                          <Coins className="w-3.5 h-3.5" /> {skate.price}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!canAfford || busyId === skate.id}
                          onClick={() => setConfirmSkate(skate)}
                          className={`flex-1 min-h-[42px] rounded-xl font-display font-bold text-xs transition ${
                            canAfford
                              ? 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {ownedEver ? 'COMPRAR +1' : 'COMPRAR'}
                        </button>

                        {ownedEver && (
                          <button
                            type="button"
                            disabled={busyId === skate.id}
                            onClick={() => void handleEquipToggle(skate.id)}
                            className={`min-h-[42px] px-3 rounded-xl font-display font-bold text-xs flex items-center gap-1 cursor-pointer transition ${
                              equipped
                                ? 'bg-emerald-600/30 border border-emerald-400 text-emerald-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-white'
                            }`}
                          >
                            {equipped && <Check className="w-3.5 h-3.5" />}
                            {equipped ? 'EQUIPADO' : 'EQUIPAR'}
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
    </div>
  );
}
