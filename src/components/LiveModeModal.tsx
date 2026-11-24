import { Check, Eye, Plus, Radio, Trash2, Type, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api.ts';
import {
  DEFAULT_LIVE_MODE_CONFIG,
  LiveOverlayFontFamily,
  LiveOverlayPosition,
  LiveOverlayText,
  PlayerLiveModeConfig,
  UserProfile,
} from '../shared/constants.ts';

interface LiveModeModalProps {
  user: UserProfile;
  onSaved: (config: PlayerLiveModeConfig) => void;
  onClose: () => void;
}

const POSITIONS: { id: LiveOverlayPosition; label: string }[] = [
  { id: 'top_left', label: 'Topo Esquerda' },
  { id: 'top_center', label: 'Topo Centro' },
  { id: 'top_right', label: 'Topo Direita' },
  { id: 'center_left', label: 'Centro Esquerda' },
  { id: 'center_right', label: 'Centro Direita' },
  { id: 'bottom_left', label: 'Rodapé Esquerda' },
  { id: 'bottom_center', label: 'Rodapé Centro' },
  { id: 'bottom_right', label: 'Rodapé Direita' },
];

const FONTS: { id: LiveOverlayFontFamily; label: string }[] = [
  { id: 'display', label: 'Destaque (Game)' },
  { id: 'sans', label: 'Limpa (Sans)' },
  { id: 'mono', label: 'Digital (Mono)' },
];

const COLOR_SWATCHES = ['#facc15', '#ffffff', '#38bdf8', '#4ade80', '#fb7185', '#f97316', '#c084fc'];

export function LiveModeModal({ user, onSaved, onClose }: LiveModeModalProps) {
  const [config, setConfig] = useState<PlayerLiveModeConfig>(
    user.liveModeConfig
      ? {
          ...user.liveModeConfig,
          texts: user.liveModeConfig.texts.map((t) => ({ ...t })),
        }
      : {
          ...DEFAULT_LIVE_MODE_CONFIG,
          texts: DEFAULT_LIVE_MODE_CONFIG.texts.map((t) => ({ ...t })),
        }
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const addText = () => {
    if (config.texts.length >= 10) {
      setFeedback({ type: 'err', text: 'Máximo de 10 textos configurados no Modo Live.' });
      return;
    }
    const nextItem: LiveOverlayText = {
      id: `live_${Date.now().toString(36)}`,
      text: 'SIGA A LIVE!',
      color: '#38bdf8',
      fontSize: 22,
      position: 'top_center',
      fontFamily: 'display',
      shadow: true,
      durationSec: 6,
      enabled: true,
    };
    setConfig((prev) => ({
      ...prev,
      texts: [...prev.texts, nextItem],
    }));
  };

  const updateText = (idx: number, patch: Partial<LiveOverlayText>) => {
    setConfig((prev) => ({
      ...prev,
      texts: prev.texts.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }));
  };

  const removeText = (idx: number) => {
    setConfig((prev) => ({
      ...prev,
      texts: prev.texts.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.saveLiveModeConfig(config);
      setConfig(res.config);
      onSaved(res.config);
      setFeedback({ type: 'ok', text: 'Configurações pessoais do Modo Live salvas!' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar Modo Live.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-4xl max-h-[92dvh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-rose-400" />
              CONFIGURAÇÕES · MODO LIVE
            </h2>
            <p className="text-xs text-slate-400">
              Textos pessoais animados exibidos apenas na sua tela durante suas partidas e gravações.
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

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Master Toggle */}
          <div className="p-4 rounded-xl bg-slate-950/75 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display font-bold text-base text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                Exibir Overlay do Modo Live na Partida
              </div>
              <p className="text-xs text-slate-400">
                Os textos não bloqueiam cliques, toques ou controles da corrida.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`min-h-[44px] px-5 rounded-xl font-display font-bold text-xs cursor-pointer transition ${
                config.enabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {config.enabled ? 'MODO LIVE ATIVADO' : 'MODO LIVE DESATIVADO'}
            </button>
          </div>

          {feedback && (
            <div
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border ${
                feedback.type === 'ok'
                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
                  : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Texts List */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-amber-400" />
              Textos Personalizados ({config.texts.length}/10)
            </span>
            <button
              type="button"
              onClick={addText}
              disabled={config.texts.length >= 10}
              className="min-h-[40px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> ADICIONAR TEXTO
            </button>
          </div>

          {config.texts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl">
              Nenhum texto adicionado ainda. Clique em ADICIONAR TEXTO acima.
            </div>
          ) : (
            <div className="space-y-3">
              {config.texts.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-amber-300 uppercase">
                      Texto #{idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateText(idx, { enabled: !item.enabled })}
                        className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                          item.enabled
                            ? 'bg-emerald-600/25 border border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.enabled ? 'Visível' : 'Oculto'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeText(idx)}
                        className="min-h-[34px] min-w-[34px] p-1.5 rounded-lg bg-slate-800 hover:bg-rose-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    maxLength={80}
                    value={item.text}
                    onChange={(e) => updateText(idx, { text: e.target.value })}
                    placeholder="Digite o texto exibido na tela..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Posição na Tela
                      </label>
                      <select
                        value={item.position}
                        onChange={(e) =>
                          updateText(idx, { position: e.target.value as LiveOverlayPosition })
                        }
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      >
                        {POSITIONS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Fonte
                      </label>
                      <select
                        value={item.fontFamily}
                        onChange={(e) =>
                          updateText(idx, { fontFamily: e.target.value as LiveOverlayFontFamily })
                        }
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      >
                        {FONTS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Tamanho: {item.fontSize}px
                      </label>
                      <input
                        type="range"
                        min={12}
                        max={48}
                        value={item.fontSize}
                        onChange={(e) => updateText(idx, { fontSize: Number(e.target.value) })}
                        className="w-full accent-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Duração ciclo: {item.durationSec}s
                      </label>
                      <input
                        type="range"
                        min={2}
                        max={60}
                        value={item.durationSec}
                        onChange={(e) => updateText(idx, { durationSec: Number(e.target.value) })}
                        className="w-full accent-sky-400"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400">Cor:</span>
                      <input
                        type="color"
                        value={item.color}
                        onChange={(e) => updateText(idx, { color: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                      {COLOR_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => updateText(idx, { color: hex })}
                          className={`w-5 h-5 rounded border cursor-pointer ${
                            item.color.toLowerCase() === hex
                              ? 'border-white scale-110'
                              : 'border-slate-700'
                          }`}
                          style={{ backgroundColor: hex }}
                          aria-label={`Cor ${hex}`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => updateText(idx, { shadow: !item.shadow })}
                      className={`min-h-[34px] px-3 rounded-lg text-[11px] font-bold border cursor-pointer ${
                        item.shadow
                          ? 'bg-slate-800 border-amber-400/60 text-amber-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      Sombra: {item.shadow ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Mini Preview */}
                  <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-center overflow-hidden">
                    <span
                      style={{
                        color: item.color,
                        fontSize: `${Math.min(28, item.fontSize)}px`,
                        textShadow: item.shadow ? '0 2px 10px rgba(0,0,0,0.9)' : 'none',
                      }}
                      className={
                        item.fontFamily === 'display'
                          ? 'font-display font-extrabold'
                          : item.fontFamily === 'mono'
                            ? 'font-mono-num font-bold'
                            : 'font-sans font-extrabold'
                      }
                    >
                      {item.text || 'PRÉ-VISUALIZAÇÃO'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold text-sm flex items-center gap-2 cursor-pointer shadow-lg"
          >
            <Check className="w-4 h-4" />
            {saving ? 'SALVANDO...' : 'SALVAR MODO LIVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
