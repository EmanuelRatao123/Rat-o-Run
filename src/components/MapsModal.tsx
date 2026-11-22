import { Check, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { GraphicsQuality, MAPS, MapId } from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface MapsModalProps {
  selectedMap: MapId;
  quality: GraphicsQuality;
  onSelectMap: (mapId: MapId) => void;
  onClose: () => void;
}

export function MapsModal({
  selectedMap,
  quality,
  onSelectMap,
  onClose,
}: MapsModalProps) {
  const [previewMap, setPreviewMap] = useState<MapId>(selectedMap);
  const currentDef = MAPS.find((m) => m.id === previewMap) || MAPS[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-400" />
              SELECIONAR MAPA 3D
            </h2>
            <p className="text-xs text-slate-400">
              Cada mapa possui iluminação, arquitetura, trilha e obstáculos próprios.
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

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Live 3D Map Preview */}
          <div className="lg:col-span-7 bg-slate-950 relative min-h-[260px] sm:min-h-[360px] flex flex-col">
            <div className="flex-1 relative">
              <ScenePreview3D
                skinId="ratao"
                mapId={previewMap}
                quality={quality}
                mode="scenic"
              />
              <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-slate-950/90 border border-slate-700 text-xs font-extrabold text-amber-300 pointer-events-none">
                PRÉVIA 3D AO VIVO · {currentDef.badge}
              </div>
            </div>
            <div className="p-4 bg-slate-900/95 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold text-white">
                  {currentDef.name} — {currentDef.subtitle}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">{currentDef.description}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectMap(previewMap);
                  onClose();
                }}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-display font-bold text-sm shrink-0 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                {selectedMap === previewMap ? 'MAPA SELECIONADO' : 'SELECIONAR MAPA'}
              </button>
            </div>
          </div>

          {/* 4 Map Cards */}
          <div className="lg:col-span-5 p-4 overflow-y-auto space-y-3 border-t lg:border-t-0 lg:border-l border-slate-800">
            {MAPS.map((m) => {
              const isViewing = previewMap === m.id;
              const isEquipped = selectedMap === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPreviewMap(m.id)}
                  className={`w-full text-left p-4 rounded-xl border transition cursor-pointer ${
                    isViewing
                      ? 'bg-slate-800 border-amber-400 shadow-lg'
                      : 'bg-slate-950/75 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-4 h-4 rounded-sm border border-white/30"
                        style={{
                          background: `linear-gradient(135deg, ${m.skyHex}, ${m.accentHex})`,
                        }}
                      />
                      <span className="font-display font-bold text-base text-white">
                        {m.name}
                      </span>
                    </div>
                    {isEquipped && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-extrabold">
                        ATIVO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mb-2">{m.subtitle}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.highlights.map((h) => (
                      <span
                        key={h}
                        className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-semibold text-slate-300"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
