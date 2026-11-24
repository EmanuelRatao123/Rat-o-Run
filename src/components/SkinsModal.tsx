import { Check, Crown, Gift, Lock, Paintbrush, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../services/api.ts';
import { syncFirebaseUserProfile } from '../services/firestoreSync.ts';
import {
  DEFAULT_CUSTOM_CHARACTER_CONFIG,
  EXCLUSIVE_SKINS,
  GraphicsQuality,
  LOCKED_EXCLUSIVE_SKINS,
  MapId,
  SKINS,
  SPECIAL_UNLOCKABLE_SKINS,
  SkinDefinition,
  SkinId,
  UserProfile,
  getSkinDefinition,
  isExclusiveSkinId,
  isLockedExclusiveSkinId,
  isSpecialUnlockableSkinId,
} from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface SkinsModalProps {
  user: UserProfile;
  selectedMap: MapId;
  quality: GraphicsQuality;
  onEquipped: (skinId: SkinId) => void;
  onOpenCustomizer?: () => void;
  onClose: () => void;
}

export function SkinsModal({
  user,
  selectedMap,
  quality,
  onEquipped,
  onOpenCustomizer,
  onClose,
}: SkinsModalProps) {
  const allowedExclusive = user.allowedExclusiveSkins || [];

  const isSkinUnlocked = (skinId: SkinId): boolean => {
    if (
      !isExclusiveSkinId(skinId) &&
      !isSpecialUnlockableSkinId(skinId) &&
      !isLockedExclusiveSkinId(skinId)
    ) {
      return true;
    }
    return allowedExclusive.includes(skinId);
  };

  // Single unified SKINS list:
  // - All common skins
  // - Meu Ratão & the 10 Locked Exclusive Skins (always shown, with lock while locked)
  // - Hidden exclusive skins (Top 1/2/3 & Ratão Rei) ONLY when actually unlocked
  const visibleSkins = useMemo<SkinDefinition[]>(() => {
    const unlockedExclusives = EXCLUSIVE_SKINS.filter(
      (skin) => allowedExclusive.includes(skin.id)
    );
    return [
      ...SKINS,
      ...SPECIAL_UNLOCKABLE_SKINS,
      ...LOCKED_EXCLUSIVE_SKINS,
      ...unlockedExclusives,
    ];
  }, [allowedExclusive]);

  const initialPreview: SkinId = visibleSkins.some((s) => s.id === user.equippedSkin)
    ? user.equippedSkin
    : 'ratao';

  const [previewSkin, setPreviewSkin] = useState<SkinId>(initialPreview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDef = getSkinDefinition(previewSkin);
  const isEquipped = user.equippedSkin === previewSkin;
  const isGifted = user.giftedSkins.includes(previewSkin);
  const isExclusive = isExclusiveSkinId(previewSkin);
  const isSpecialUnlockable = isSpecialUnlockableSkinId(previewSkin);
  const isLockedCatalogSkin = isLockedExclusiveSkinId(previewSkin);
  const isRestrictedCategory = isExclusive || isSpecialUnlockable || isLockedCatalogSkin;
  const isAllowed = isSkinUnlocked(previewSkin);

  const handleEquip = async () => {
    if (!isAllowed) return;
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
      <div className="w-full max-w-5xl max-h-[92dvh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              SKINS
            </h2>
            <p className="text-xs text-slate-400">
              {visibleSkins.length} personagens disponíveis na sua coleção. Arraste o modelo 3D para girar.
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
          {/* Left: 3D Turntable Preview */}
          <div className="lg:col-span-5 bg-slate-950 relative min-h-[210px] sm:min-h-[300px] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
            <div className="flex-1 relative">
              <ScenePreview3D
                skinId={previewSkin}
                mapId={selectedMap}
                quality={quality}
                mode="turntable"
                interactiveRotate
                customConfig={
                  previewSkin === 'meu_ratao'
                    ? isAllowed
                      ? user.customCharacterConfig
                      : DEFAULT_CUSTOM_CHARACTER_CONFIG
                    : undefined
                }
              />
              <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-700 text-[11px] font-bold text-amber-300">
                  {selectedDef.badgeText}
                </span>
                {isRestrictedCategory && (
                  <span
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
                      isAllowed
                        ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                        : 'bg-rose-950/90 border-rose-500 text-rose-300'
                    }`}
                  >
                    {isAllowed ? (
                      <>
                        <Crown className="w-3 h-3" /> DESBLOQUEADA
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" /> BLOQUEADA
                      </>
                    )}
                  </span>
                )}
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

              {selectedDef.unlockConditionText && (
                <p
                  className={`text-[11px] rounded-lg px-2.5 py-1.5 mb-2.5 border ${
                    isAllowed
                      ? 'text-emerald-200 bg-emerald-950/40 border-emerald-500/40'
                      : 'text-amber-200 bg-amber-950/40 border-amber-500/40'
                  }`}
                >
                  {selectedDef.unlockConditionText}
                </p>
              )}

              {selectedDef.prototypeNote && (
                <p className="text-[11px] text-amber-300/80 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-1.5 mb-3">
                  {selectedDef.prototypeNote}
                </p>
              )}

              {error && <p className="text-xs text-red-300 mb-2">{error}</p>}

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isEquipped || saving || !isAllowed}
                  onClick={handleEquip}
                  className={`w-full py-3 rounded-xl font-display font-bold text-sm transition ${
                    isEquipped
                      ? 'bg-emerald-600/25 border border-emerald-500/50 text-emerald-300 cursor-default'
                      : !isAllowed
                        ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed flex items-center justify-center gap-2'
                        : 'bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-lg cursor-pointer'
                  }`}
                >
                  {saving ? (
                    'SALVANDO...'
                  ) : isEquipped ? (
                    'SKIN EQUIPADA NO MOMENTO'
                  ) : !isAllowed ? (
                    <>
                      <Lock className="w-4 h-4" /> BLOQUEADA — RESGATE PARA LIBERAR
                    </>
                  ) : (
                    'EQUIPAR PERSONAGEM'
                  )}
                </button>

                {previewSkin === 'meu_ratao' && isAllowed && onOpenCustomizer && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCustomizer();
                    }}
                    className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Paintbrush className="w-4 h-4" /> PERSONALIZAR
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Unified Skin Grid (no separate tabs) */}
          <div className="lg:col-span-7 flex flex-col overflow-hidden">
            <div className="flex-1 p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 content-start">
              {visibleSkins.map((skin, index) => {
                const selected = previewSkin === skin.id;
                const equipped = user.equippedSkin === skin.id;
                const unlocked = isSkinUnlocked(skin.id);
                const gifted = user.giftedSkins.includes(skin.id);
                const isExclusiveBadge = isExclusiveSkinId(skin.id);
                const isMeuRatao = skin.id === 'meu_ratao';
                const isCatalogUnlockable =
                  isMeuRatao || isLockedExclusiveSkinId(skin.id);

                return (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => setPreviewSkin(skin.id)}
                    className={`text-left p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                      selected
                        ? 'bg-slate-800 border-amber-400 shadow-lg'
                        : isExclusiveBadge
                          ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400'
                          : isCatalogUnlockable && !unlocked
                            ? 'bg-slate-950/85 border-slate-800/90 hover:border-rose-500/50'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center font-display font-bold border border-white/20 relative"
                      style={{
                        background: isMeuRatao
                          ? '#ffffff'
                          : `linear-gradient(135deg, ${skin.primaryColor}, ${skin.accentColor})`,
                        color: isMeuRatao ? '#0f172a' : '#ffffff',
                      }}
                    >
                      {isCatalogUnlockable && !unlocked ? (
                        <Lock className="w-4 h-4" />
                      ) : isExclusiveBadge ? (
                        <Crown className="w-4 h-4" />
                      ) : isMeuRatao ? (
                        <Paintbrush className="w-4 h-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-display font-bold text-sm text-white truncate">
                          {skin.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {equipped && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                              USO
                            </span>
                          )}
                          {isCatalogUnlockable && !unlocked && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-extrabold inline-flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> BLOQUEADA
                            </span>
                          )}
                          {isCatalogUnlockable && unlocked && !equipped && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-extrabold">
                              LIBERADA
                            </span>
                          )}
                          {isExclusiveBadge && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-extrabold">
                              EXCLUSIVA
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                        {skin.subtitle}
                      </p>
                      {gifted && unlocked && (
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
    </div>
  );
}
