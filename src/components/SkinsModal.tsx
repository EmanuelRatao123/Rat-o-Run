import { Check, Gift, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api.ts';
import { syncFirebaseUserProfile } from '../services/firestoreSync.ts';
import {
  GraphicsQuality,
  MapId,
  SKINS,
  SkinId,
  UserProfile,
} from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface SkinsModalProps {
  user: UserProfile;
  selectedMap: MapId;
  quality: GraphicsQuality;
  onEquipped: (skinId: SkinId) => void;
  onClose: () => void;
}

export function SkinsModal({
  user,
  selectedMap,
  quality,
  onEquipped,
  onClose,
}: SkinsModalProps) {
  const [previewSkin, setPreviewSkin] = useState<SkinId>(user.equippedSkin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDef = SKINS.find((s) => s.id === previewSkin) || SKINS[0];
  const isEquipped = user.equippedSkin === previewSkin;
  const isGifted = user.giftedSkins.includes(previewSkin);

  const handleEquip = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.equipSkin(previewSkin);
      onEquipped(res.equippedSkin);
      void syncFirebaseUserProfile(user.nickname, res.equippedSkin).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao equipar skin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              SKINS GRATUITAS (10 PERSONAGENS VOXEL)
            </h2>
            <p className="text-xs text-slate-400">
              Todas as 10 skins estão liberadas gratuitamente. Arraste o modelo 3D para girar.
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
          {/* Left: 3D Turntable Preview */}
          <div className="lg:col-span-5 bg-slate-950 relative min-h-[280px] sm:min-h-[360px] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
            <div className="flex-1 relative">
              <ScenePreview3D
                skinId={previewSkin}
                mapId={selectedMap}
                quality={quality}
                mode="turntable"
                interactiveRotate
              />
              <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-700 text-[11px] font-bold text-amber-300">
                  {selectedDef.badgeText}
                </span>
                {isGifted && (
                  <span className="px-2.5 py-1 rounded-lg bg-fuchsia-950/90 border border-fuchsia-500 text-[11px] font-bold text-fuchsia-300 flex items-center gap-1">
                    <Gift className="w-3 h-3" /> PRESENTE ADMIN
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-900/95 border-t border-slate-800">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="font-display text-xl font-bold text-white">
                    {selectedDef.name}
                  </h3>
                  <p className="text-xs text-slate-400">{selectedDef.subtitle}</p>
                </div>
                {isEquipped && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-extrabold flex items-center gap-1 shrink-0">
                    <Check className="w-3.5 h-3.5" /> EQUIPADA
                  </span>
                )}
              </div>

              {selectedDef.prototypeNote && (
                <p className="text-[11px] text-amber-300/80 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-1.5 mb-3">
                  {selectedDef.prototypeNote}
                </p>
              )}

              {error && (
                <p className="text-xs text-red-300 mb-2">{error}</p>
              )}

              <button
                type="button"
                disabled={isEquipped || saving}
                onClick={handleEquip}
                className={`w-full py-3 rounded-xl font-display font-bold text-sm transition cursor-pointer ${
                  isEquipped
                    ? 'bg-emerald-600/25 border border-emerald-500/50 text-emerald-300 cursor-default'
                    : 'bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-lg'
                }`}
              >
                {saving
                  ? 'SALVANDO...'
                  : isEquipped
                  ? 'SKIN EQUIPADA NO MOMENTO'
                  : 'EQUIPAR PERSONAGEM'}
              </button>
            </div>
          </div>

          {/* Right: Grid of all 10 Skins */}
          <div className="lg:col-span-7 p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-2 gap-2.5 content-start">
            {SKINS.map((skin, index) => {
              const selected = previewSkin === skin.id;
              const equipped = user.equippedSkin === skin.id;
              const gifted = user.giftedSkins.includes(skin.id);
              return (
                <button
                  key={skin.id}
                  type="button"
                  onClick={() => setPreviewSkin(skin.id)}
                  className={`text-left p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                    selected
                      ? 'bg-slate-800 border-amber-400 shadow-lg'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center font-display font-bold text-white border border-white/20"
                    style={{
                      background: `linear-gradient(135deg, ${skin.primaryColor}, ${skin.accentColor})`,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display font-bold text-sm text-white truncate">
                        {skin.name}
                      </span>
                      {equipped && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold shrink-0">
                          USO
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                      {skin.subtitle}
                    </p>
                    {gifted && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-300">
                        <Gift className="w-3 h-3" /> Presente
                      </span>
                    )}
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
