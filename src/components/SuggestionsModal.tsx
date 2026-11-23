import { CheckCircle2, Lightbulb, MapPin, Palette, Send, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { PlayerSuggestion, SuggestionStatus, SuggestionType } from '../shared/constants.ts';

interface SuggestionsModalProps {
  onClose: () => void;
}

const STATUS_STYLE: Record<SuggestionStatus, { label: string; cls: string }> = {
  received: { label: 'Recebida', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  in_review: { label: 'Em análise', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  approved: { label: 'Aprovada', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  rejected: { label: 'Recusada', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
};

export function SuggestionsModal({ onClose }: SuggestionsModalProps) {
  const [type, setType] = useState<SuggestionType>('map');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [items, setItems] = useState<PlayerSuggestion[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadMine = async () => {
    setLoadingList(true);
    try {
      const res = await api.getMySuggestions();
      setItems(res.suggestions);
    } catch {
      // Ignore transient error
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadMine();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await api.createSuggestion({ type, title, description });
      setSuccessMsg(
        `Sugestão ${res.suggestion.code} enviada! A equipe administrativa analisará sua ideia.`
      );
      setTitle('');
      setDescription('');
      setItems((prev) => [res.suggestion, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a sugestão.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Enviar Sugestão</h2>
              <p className="text-xs text-slate-400">
                Sugira novos mapas ou skins para avaliação da administração
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleSubmit}
            className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
              Nova Ideia
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('map')}
                className={`py-2.5 px-3 rounded-xl font-bold text-sm border flex items-center justify-center gap-2 cursor-pointer ${
                  type === 'map'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Sugerir Mapa
              </button>
              <button
                type="button"
                onClick={() => setType('skin')}
                className={`py-2.5 px-3 rounded-xl font-bold text-sm border flex items-center justify-center gap-2 cursor-pointer ${
                  type === 'skin'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Palette className="w-4 h-4" />
                Sugerir Skin
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Título da Sugestão
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={3}
                maxLength={80}
                placeholder={
                  type === 'map' ? 'Ex.: Metrô Subterrâneo Neon' : 'Ex.: Ratão Astronauta'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-amber-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Descrição Detalhada
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={10}
                maxLength={1000}
                rows={4}
                placeholder="Descreva obstáculos, visual, cores ou detalhes especiais..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-amber-400 outline-none resize-none"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'ENVIANDO...' : 'ENVIAR SUGESTÃO'}
            </button>
          </form>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 mb-3">
              Minhas Sugestões ({items.length})
            </h3>
            {loadingList ? (
              <div className="text-slate-400 text-sm py-8 text-center">Carregando...</div>
            ) : items.length === 0 ? (
              <div className="text-slate-500 text-sm py-8 text-center">
                Você ainda não enviou nenhuma sugestão.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {items.map((s) => {
                  const st = STATUS_STYLE[s.status];
                  return (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-slate-400">
                          {s.code} · {s.type === 'map' ? 'MAPA' : 'SKIN'}
                        </span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="font-bold text-white text-sm">{s.title}</div>
                      <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>
                      {s.adminNote && (
                        <div className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-amber-200">
                          <strong>Resposta Admin:</strong> {s.adminNote}
                        </div>
                      )}
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
