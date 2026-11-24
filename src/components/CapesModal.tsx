import { Check, Palette, RotateCcw, Shirt, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api.ts';
import {
  CAPES_CATALOG,
  CapeBackgroundStyle,
  CapeId,
  DEFAULT_PLAYER_CAPE_CONFIG,
  GraphicsQuality,
  MapId,
  PlayerCapeConfig,
  UserProfile,
} from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface CapesModalProps {
  user: UserProfile;
  selectedMap: MapId;
  quality: GraphicsQuality;
  onSaved: (config: PlayerCapeConfig) => void;
  onClose: () => void;
}

const STYLE_LABELS: { id: CapeBackgroundStyle; label: string }[] = [
  { id: 'gradient', label: 'Degradê' },
  { id: 'solid', label: 'Sólida' },
  { id: 'striped', label: 'Listrada' },
  { id: 'checkered', label: 'Quadriculada' },
  { id: 'stars', label: 'Estrelas' },
];

const COLOR_PRESETS = [
  '#e11d48',
  '#facc15',
  '#16a34a',
  '#0284c7',
  '#7c3aed',
  '#0f172a',
  '#ffffff',
  '#f97316',
];

export function CapesModal({
  user,
  selectedMap,
  quality,
  onSaved,
  onClose,
}: CapesModalProps) {
  const [config, setConfig] = useState<PlayerCapeConfig>(
    user.capeConfig ? { ...user.capeConfig } : { ...DEFAULT_PLAYER_CAPE_CONFIG }
  );
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const selectCape = (capeId: CapeId) => {
    if (capeId === 'capa_camisa_10' && config.equippedCapeId !== 'capa_camisa_10') {
      const def = CAPES_CATALOG.find((c) => c.id === 'capa_camisa_10')!;
      setConfig((prev) => ({
        ...prev,
        equippedCapeId: 'capa_camisa_10',
        primaryColor: def.defaultPrimaryColor,
        secondaryColor: def.defaultSecondaryColor,
        textColor: def.defaultTextColor,
        shirt10Name: prev.shirt10Name || user.nickname.slice(0, 12).toUpperCase(),
      }));
    } else if (
      capeId === 'capa_personalizavel' &&
      config.equippedCapeId !== 'capa_personalizavel'
    ) {
      const def = CAPES_CATALOG.find((c) => c.id === 'capa_personalizavel')!;
      setConfig((prev) => ({
        ...prev,
        equippedCapeId: 'capa_personalizavel',
        primaryColor: def.defaultPrimaryColor,
        secondaryColor: def.defaultSecondaryColor,
        textColor: def.defaultTextColor,
      }));
    } else {
      setConfig((prev) => ({ ...prev, equippedCapeId: capeId }));
    }
    setStatusMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await api.saveCapeConfig(config);
      setConfig(res.config);
      onSaved(res.config);
      setStatusMsg({ type: 'ok', text: 'Capa salva e equipada no servidor!' });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar capa.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({
      ...DEFAULT_PLAYER_CAPE_CONFIG,
      equippedCapeId: config.equippedCapeId,
      shirt10Name: user.nickname.slice(0, 12).toUpperCase(),
    });
    setStatusMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-5xl max-h-[92dvh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Shirt className="w-5 h-5 text-amber-400" />
              CAPAS PERSONALIZÁVEIS 3D
            </h2>
            <p className="text-xs text-slate-400">
              2 capas gratuitas para exibir nas costas durante partidas Solo e Multiplayer! Arraste o modelo 3D para ver as costas.
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

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
          {/* Left: Live 3D Cape Preview */}
          <div className="lg:col-span-5 bg-slate-950 relative min-h-[240px] sm:min-h-[320px] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
            <div className="flex-1 relative">
              <ScenePreview3D
                skinId={user.equippedSkin}
                mapId={selectedMap}
                customConfig={user.customCharacterConfig}
                capeConfig={config}
                quality={quality}
                mode="turntable"
                animState="run"
                interactiveRotate
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-700 text-[11px] font-bold text-amber-300 pointer-events-none">
                Arraste para girar e ver a capa
              </div>
            </div>

            <div className="p-4 bg-slate-900/95 border-t border-slate-800 space-y-2.5">
              {statusMsg && (
                <div
                  className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                    statusMsg.type === 'ok'
                      ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
                      : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
                  }`}
                >
                  {statusMsg.text}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="min-h-[44px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Padrão
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'SALVANDO...' : 'SALVAR & EQUIPAR CAPA'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Cape Selection & Customization */}
          <div className="lg:col-span-7 p-4 sm:p-5 overflow-y-auto space-y-5">
            {/* Cape Selector */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                1. Escolha o Modelo de Capa
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => selectCape('none')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    config.equippedCapeId === 'none'
                      ? 'bg-slate-800 border-amber-400 shadow'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="font-display font-bold text-sm text-white">Sem Capa</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Visual limpo sem capa personalizada nas costas.
                  </p>
                </button>

                {CAPES_CATALOG.map((cape) => {
                  const selected = config.equippedCapeId === cape.id;
                  return (
                    <button
                      key={cape.id}
                      type="button"
                      onClick={() => selectCape(cape.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        selected
                          ? 'bg-slate-800 border-amber-400 shadow'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display font-bold text-xs text-white">
                          {cape.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-extrabold">
                          {cape.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {cape.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {config.equippedCapeId !== 'none' && (
              <>
                {/* Text Customization */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    2. Texto / Nome na Capa
                  </div>

                  {config.equippedCapeId === 'capa_personalizavel' ? (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Palavra ou frase curta (máx. 16 caracteres)
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        value={config.customText}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, customText: e.target.value }))
                        }
                        placeholder="Ex: RATÃO"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-bold text-white uppercase focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Nome acima do número #10 (máx. 12 caracteres)
                      </label>
                      <input
                        type="text"
                        maxLength={12}
                        value={config.shirt10Name}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, shirt10Name: e.target.value }))
                        }
                        placeholder="Ex: CRAQUE"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-bold text-white uppercase focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}
                </div>

                {/* Style & Colors */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    3. Estilo & Cores
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400 mb-1.5">Estampa de fundo</div>
                    <div className="flex flex-wrap gap-1.5">
                      {STYLE_LABELS.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({ ...prev, backgroundStyle: st.id }))
                          }
                          className={`min-h-[38px] px-3 rounded-lg text-xs font-bold cursor-pointer border ${
                            config.backgroundStyle === st.id
                              ? 'bg-sky-600 border-sky-400 text-white'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(
                      [
                        ['primaryColor', 'Cor Principal'],
                        ['secondaryColor', 'Cor Secundária'],
                        ['textColor', 'Cor do Texto'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field} className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-300">{label}</span>
                          <input
                            type="color"
                            value={config[field]}
                            onChange={(e) =>
                              setConfig((prev) => ({ ...prev, [field]: e.target.value }))
                            }
                            className="w-8 h-7 rounded cursor-pointer bg-transparent border-0"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {COLOR_PRESETS.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() =>
                                setConfig((prev) => ({ ...prev, [field]: hex }))
                              }
                              className={`w-5 h-5 rounded border cursor-pointer ${
                                config[field].toLowerCase() === hex
                                  ? 'border-white scale-110'
                                  : 'border-slate-700'
                              }`}
                              style={{ backgroundColor: hex }}
                              aria-label={`${label} ${hex}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
