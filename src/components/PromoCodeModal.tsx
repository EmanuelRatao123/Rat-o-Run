import { CheckCircle2, Sparkles, Ticket, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api } from '../services/api.ts';
import { PromoRewardType, SkinId } from '../shared/constants.ts';

interface PromoCodeModalProps {
  onClose: () => void;
  onRedeemed: (res: {
    code: string;
    rewardType: PromoRewardType;
    rewardSkinId: SkinId | null;
    rewardAmount: number;
    rewardSummary: string;
    totalCoins: number;
    unlockedSkins: SkinId[];
    allowedExclusiveSkins: SkinId[];
  }) => void;
}

export function PromoCodeModal({ onClose, onRedeemed }: PromoCodeModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewardInfo, setRewardInfo] = useState<{
    code: string;
    summary: string;
    skinId: SkinId | null;
  } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setRewardInfo(null);
    try {
      const res = await api.redeemPromoCode(code.trim());
      setRewardInfo({
        code: res.code,
        summary: res.rewardSummary,
        skinId: res.rewardSkinId,
      });
      setCode('');
      onRedeemed(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Resgatar Código</h2>
              <p className="text-xs text-slate-400">Skins exclusivas, moedas e itens especiais</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
              Código Promocional
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EX.: MEURATAO2026"
              maxLength={32}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border-2 border-slate-700 focus:border-emerald-400 text-white font-black tracking-widest text-center text-lg uppercase outline-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold text-center">
              {error}
            </div>
          )}

          {rewardInfo && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400/70 text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 text-emerald-300 font-black text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                Código {rewardInfo.code} Resgatado!
              </div>
              <div className="text-lg font-black text-white flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                {rewardInfo.summary}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm tracking-wide cursor-pointer disabled:opacity-60"
          >
            {loading ? 'VALIDANDO...' : 'RESGATAR'}
          </button>
        </form>
      </div>
    </div>
  );
}
