import {
  Brush,
  Check,
  Eraser,
  Lock,
  Palette,
  Pipette,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Shirt,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  UserCheck,
  X,
} from 'lucide-react';
import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.ts';
import {
  AccessoryTypeId,
  BottomClothingId,
  CustomBodyPartKey,
  CustomCharacterConfig,
  DEFAULT_CUSTOM_CHARACTER_CONFIG,
  GlassesTypeId,
  HairStyleId,
  HatTypeId,
  MapId,
  PaintRegion,
  ShoesTypeId,
  SkinId,
  TopClothingId,
} from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface CharacterCustomizerModalProps {
  mapId: MapId;
  unlocked: boolean;
  equippedSkin: SkinId;
  initialConfig?: CustomCharacterConfig;
  onClose: () => void;
  onSaved: (config: CustomCharacterConfig) => void;
  onEquipped: () => void;
}

type EditorTab = 'body' | 'hair' | 'clothing' | 'paint';
type PaintTool = 'brush' | 'eraser' | 'eyedropper';

const BODY_PARTS: { key: CustomBodyPartKey; label: string }[] = [
  { key: 'head', label: 'Cabeça' },
  { key: 'torso', label: 'Tronco' },
  { key: 'leftArm', label: 'Braço Esq.' },
  { key: 'rightArm', label: 'Braço Dir.' },
  { key: 'leftLeg', label: 'Perna Esq.' },
  { key: 'rightLeg', label: 'Perna Dir.' },
  { key: 'ears', label: 'Orelhas' },
  { key: 'snout', label: 'Focinho' },
  { key: 'tail', label: 'Cauda' },
  { key: 'hands', label: 'Mãos' },
  { key: 'feet', label: 'Pés' },
];

const HAIR_STYLES: { id: HairStyleId; label: string }[] = [
  { id: 'short', label: 'Curto' },
  { id: 'spiky', label: 'Espetado' },
  { id: 'long', label: 'Longo' },
  { id: 'mohawk', label: 'Moicano' },
  { id: 'curly', label: 'Cacheado' },
  { id: 'pompadour', label: 'Topete' },
  { id: 'bald', label: 'Careca' },
];

const PAINT_REGIONS: { id: PaintRegion; label: string }[] = [
  { id: 'head', label: 'Cabeça' },
  { id: 'torsoFront', label: 'Torso Frente' },
  { id: 'torsoBack', label: 'Torso Costas' },
  { id: 'arms', label: 'Braços' },
  { id: 'legs', label: 'Pernas' },
];

const PALETTE_SWATCHES = [
  '#f8fafc',
  '#94a3b8',
  '#475569',
  '#0f172a',
  '#e11d48',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#2563eb',
  '#7e22ce',
  '#ec4899',
  '#92400e',
  '#f3cfb6',
];

const CANVAS_SIZE = 128;

export function CharacterCustomizerModal({
  mapId,
  unlocked,
  equippedSkin,
  initialConfig,
  onClose,
  onSaved,
  onEquipped,
}: CharacterCustomizerModalProps) {
  const [draft, setDraft] = useState<CustomCharacterConfig>(() =>
    structuredClone(initialConfig || DEFAULT_CUSTOM_CHARACTER_CONFIG)
  );
  const [tab, setTab] = useState<EditorTab>('body');
  const [previewAnim, setPreviewAnim] = useState<'idle' | 'run'>('idle');
  const [selectedPart, setSelectedPart] = useState<CustomBodyPartKey>('head');
  const [saving, setSaving] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Paint Studio state
  const [paintRegion, setPaintRegion] = useState<PaintRegion>('torsoFront');
  const [paintTool, setPaintTool] = useState<PaintTool>('brush');
  const [brushColor, setBrushColor] = useState('#facc15');
  const [brushSize, setBrushSize] = useState(8);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);

  // Load current region's texture onto the 2D paint canvas whenever region or tab opens
  useEffect(() => {
    if (tab !== 'paint') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    undoStackRef.current = [];
    redoStackRef.current = [];

    const src = draft.paintTextures?.[paintRegion];
    if (src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        undoStackRef.current = [ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)];
      };
      img.src = src;
    } else {
      undoStackRef.current = [ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)];
    }
  }, [tab, paintRegion]);

  const commitCanvasToDraft = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    let hasPixel = false;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 5) {
        hasPixel = true;
        break;
      }
    }
    const nextUrl = hasPixel ? canvas.toDataURL('image/png') : undefined;
    setDraft((prev) => {
      const nextPaint = { ...prev.paintTextures };
      if (nextUrl) nextPaint[paintRegion] = nextUrl;
      else delete nextPaint[paintRegion];
      return { ...prev, paintTextures: nextPaint };
    });
  };

  const getCanvasPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE;
    return {
      x: Math.max(0, Math.min(CANVAS_SIZE, x)),
      y: Math.max(0, Math.min(CANVAS_SIZE, y)),
    };
  };

  const handleCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const pt = getCanvasPoint(e);

    if (paintTool === 'eyedropper') {
      const px = ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
      if (px[3] > 20) {
        const hex = `#${[px[0], px[1], px[2]]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')}`;
        setBrushColor(hex);
      }
      setPaintTool('brush');
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPtRef.current = pt;

    ctx.save();
    ctx.globalCompositeOperation = paintTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = brushColor;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handleCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    const prev = lastPtRef.current || pt;

    ctx.save();
    ctx.globalCompositeOperation = paintTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();

    lastPtRef.current = pt;
  };

  const handleCanvasPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      undoStackRef.current.push(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
      if (undoStackRef.current.length > 25) undoStackRef.current.shift();
      redoStackRef.current = [];
    }
    commitCanvasToDraft();
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!ctx || undoStackRef.current.length <= 1) return;
    const current = undoStackRef.current.pop()!;
    redoStackRef.current.push(current);
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    ctx.putImageData(prev, 0, 0);
    commitCanvasToDraft();
  };

  const handleRedo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!ctx || redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(next);
    ctx.putImageData(next, 0, 0);
    commitCanvasToDraft();
  };

  const handleClearRegion = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    undoStackRef.current.push(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
    redoStackRef.current = [];
    commitCanvasToDraft();
  };

  const updateBodyColor = (part: CustomBodyPartKey, color: string) => {
    setDraft((prev) => ({
      ...prev,
      bodyColors: { ...prev.bodyColors, [part]: color },
    }));
  };

  const addFavoriteColor = (color: string) => {
    const clean = color.toLowerCase();
    setDraft((prev) => {
      if (prev.favoriteColors.includes(clean)) return prev;
      return {
        ...prev,
        favoriteColors: [clean, ...prev.favoriteColors].slice(0, 14),
      };
    });
  };

  const handleSave = async () => {
    if (!unlocked || saving) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await api.saveMyCustomCharacter(draft);
      setDraft(res.config);
      onSaved(res.config);
      setStatusMsg({ type: 'ok', text: 'Personalização salva no banco de dados!' });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar personalização.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEquipMeuRatao = async () => {
    if (!unlocked || equipping) return;
    setEquipping(true);
    setStatusMsg(null);
    try {
      const saved = await api.saveMyCustomCharacter(draft);
      setDraft(saved.config);
      onSaved(saved.config);
      await api.equipSkin('meu_ratao');
      onEquipped();
      setStatusMsg({ type: 'ok', text: 'Meu Ratão salvo e equipado para correr!' });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Não foi possível equipar Meu Ratão.',
      });
    } finally {
      setEquipping(false);
    }
  };

  const currentPartColor = draft.bodyColors[selectedPart];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/92 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl max-h-[94vh] flex flex-col bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/50 flex items-center justify-center text-sky-300">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                Personalizar Personagem — Meu Ratão
              </h2>
              <p className="text-xs text-slate-400">
                Arraste o modelo 3D para girar 360° · Pinte detalhes direto no personagem
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

        {!unlocked && (
          <div className="px-5 py-3 bg-rose-950/70 border-b border-rose-500/40 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-rose-200 font-bold">
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                BLOQUEADA — A skin Meu Ratão começa bloqueada. Desbloqueie por Código Promocional ou presente do Administrador para salvar e equipar!
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Left: 3D Interactive Stage */}
          <div className="lg:col-span-5 bg-slate-950 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
            <div className="relative h-72 sm:h-96 lg:flex-1 min-h-[300px]">
              <ScenePreview3D
                skinId="meu_ratao"
                mapId={mapId}
                customConfig={draft}
                animState={previewAnim}
                mode="turntable"
                interactiveRotate={true}
              />
              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewAnim('idle')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer border ${
                    previewAnim === 'idle'
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900/90 text-slate-300 border-slate-700'
                  }`}
                >
                  <Square className="w-3 h-3" />
                  Parado
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAnim('run')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer border ${
                    previewAnim === 'run'
                      ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                      : 'bg-slate-900/90 text-slate-300 border-slate-700'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  Correndo
                </button>
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-700 text-[11px] font-bold text-slate-300">
                  Arraste para girar 360°
                </span>
                <button
                  type="button"
                  onClick={() => setDraft(structuredClone(DEFAULT_CUSTOM_CHARACTER_CONFIG))}
                  className="pointer-events-auto px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Resetar Padrão
                </button>
              </div>
            </div>
          </div>

          {/* Right: Editor Controls */}
          <div className="lg:col-span-7 flex flex-col p-4 sm:p-5 space-y-4">
            {/* Tabs */}
            <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              {(
                [
                  { id: 'body', label: 'Corpo', icon: Palette },
                  { id: 'hair', label: 'Cabelos', icon: Sparkles },
                  { id: 'clothing', label: 'Roupas', icon: Shirt },
                  { id: 'paint', label: 'Desenhar', icon: Brush },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      tab === t.id
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab 1: Body Parts & Colors */}
            {tab === 'body' && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-black uppercase text-slate-400 mb-2">
                    1. Selecione a parte do corpo
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {BODY_PARTS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelectedPart(p.key)}
                        className={`px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                          selectedPart === p.key
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                          style={{ backgroundColor: draft.bodyColors[p.key] }}
                        />
                        <span className="truncate">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase text-slate-300">
                      Cor para: {BODY_PARTS.find((x) => x.key === selectedPart)?.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={currentPartColor}
                        onChange={(e) => updateBodyColor(selectedPart, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={currentPartColor}
                        maxLength={7}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                            updateBodyColor(selectedPart, v);
                          }
                        }}
                        className="w-24 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={() => addFavoriteColor(currentPartColor)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Favorita
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => updateBodyColor(selectedPart, hex)}
                        className={`w-7 h-7 rounded-lg border-2 cursor-pointer ${
                          currentPartColor.toLowerCase() === hex ? 'border-white scale-110' : 'border-slate-700'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-slate-400 mb-1.5">
                      Cores Favoritas Salvas:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.favoriteColors.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => updateBodyColor(selectedPart, hex)}
                          className="w-7 h-7 rounded-full border-2 border-slate-600 hover:border-white cursor-pointer"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Voxel Hairstyles */}
            {tab === 'hair' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {HAIR_STYLES.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, hairStyle: h.id }))}
                      className={`py-3 px-3 rounded-xl border text-xs font-black cursor-pointer ${
                        draft.hairStyle === h.id
                          ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-300">
                      Cor do Cabelo
                    </span>
                    <input
                      type="color"
                      value={draft.hairColor}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, hairColor: e.target.value }))
                      }
                      className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, hairColor: hex }))}
                        className={`w-7 h-7 rounded-lg border-2 cursor-pointer ${
                          draft.hairColor.toLowerCase() === hex
                            ? 'border-white scale-110'
                            : 'border-slate-700'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Clothing & Accessories */}
            {tab === 'clothing' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Top */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300">Camisa / Jaqueta</span>
                    <input
                      type="color"
                      value={draft.clothing.topColor}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          clothing: { ...p.clothing, topColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['none', 'Sem'],
                        ['tshirt', 'Camiseta'],
                        ['jacket', 'Jaqueta'],
                      ] as [TopClothingId, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            clothing: { ...p.clothing, topType: id },
                          }))
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          draft.clothing.topType === id
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bottom */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300">Calça / Shorts</span>
                    <input
                      type="color"
                      value={draft.clothing.bottomColor}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          clothing: { ...p.clothing, bottomColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['none', 'Sem'],
                        ['pants', 'Calça'],
                        ['shorts', 'Shorts'],
                      ] as [BottomClothingId, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            clothing: { ...p.clothing, bottomType: id },
                          }))
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          draft.clothing.bottomType === id
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shoes */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300">Tênis / Bota</span>
                    <input
                      type="color"
                      value={draft.clothing.shoesColor}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          clothing: { ...p.clothing, shoesColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['none', 'Descalço'],
                        ['sneakers', 'Tênis'],
                        ['boots', 'Botas'],
                      ] as [ShoesTypeId, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            clothing: { ...p.clothing, shoesType: id },
                          }))
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          draft.clothing.shoesType === id
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hat */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300">Chapéu / Boné</span>
                    <input
                      type="color"
                      value={draft.clothing.hatColor}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          clothing: { ...p.clothing, hatColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['none', 'Sem'],
                        ['cap', 'Boné'],
                        ['hat', 'Chapéu'],
                      ] as [HatTypeId, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            clothing: { ...p.clothing, hatType: id },
                          }))
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          draft.clothing.hatType === id
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Glasses */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300">Óculos</span>
                    <input
                      type="color"
                      value={draft.clothing.glassesColor}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          clothing: { ...p.clothing, glassesColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        ['none', 'Sem'],
                        ['sunglasses', 'Escuro'],
                        ['visor', 'Visor'],
                        ['round', 'Redondo'],
                      ] as [GlassesTypeId, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            clothing: { ...p.clothing, glassesType: id },
                          }))
                        }
                        className={`py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          draft.clothing.glassesType === id
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accessory */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300">Acessório</span>
                    <input
                      type="color"
                      value={draft.clothing.accessoryColor}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          clothing: { ...p.clothing, accessoryColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        ['none', 'Sem'],
                        ['backpack', 'Mochila'],
                        ['scarf', 'Cachecol'],
                        ['chain', 'Corrente'],
                      ] as [AccessoryTypeId, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            clothing: { ...p.clothing, accessoryType: id },
                          }))
                        }
                        className={`py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          draft.clothing.accessoryType === id
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: 2D-to-3D Painter */}
            {tab === 'paint' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {PAINT_REGIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setPaintRegion(r.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-black cursor-pointer ${
                        paintRegion === r.id
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-slate-950 text-slate-300 border-slate-800'
                      }`}
                    >
                      {r.label}
                      {draft.paintTextures?.[r.id] ? ' •' : ''}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start bg-slate-950 border border-slate-800 rounded-2xl p-4">
                  <div className="sm:col-span-6 flex flex-col items-center">
                    <div className="text-[11px] font-bold text-slate-400 mb-2">
                      Desenhe abaixo para aplicar em 3D
                    </div>
                    <canvas
                      ref={canvasRef}
                      width={CANVAS_SIZE}
                      height={CANVAS_SIZE}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                      onPointerCancel={handleCanvasPointerUp}
                      className="w-48 h-48 sm:w-52 sm:h-52 rounded-xl border-2 border-slate-700 bg-slate-900 touch-none cursor-crosshair"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                      }}
                    />
                  </div>

                  <div className="sm:col-span-6 space-y-3">
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPaintTool('brush')}
                        className={`py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${
                          paintTool === 'brush'
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <Brush className="w-3.5 h-3.5" />
                        Pincel
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaintTool('eraser')}
                        className={`py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${
                          paintTool === 'eraser'
                            ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        Borracha
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaintTool('eyedropper')}
                        className={`py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${
                          paintTool === 'eyedropper'
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <Pipette className="w-3.5 h-3.5" />
                        Gotas
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">Tamanho: {brushSize}px</span>
                      <input
                        type="range"
                        min={2}
                        max={24}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="flex-1 accent-sky-400"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-400">Cor do pincel:</span>
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => setBrushColor(e.target.value)}
                        className="w-8 h-8 rounded bg-transparent cursor-pointer"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {PALETTE_SWATCHES.slice(0, 10).map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => {
                            setBrushColor(hex);
                            if (paintTool === 'eraser') setPaintTool('brush');
                          }}
                          className={`w-6 h-6 rounded-md border cursor-pointer ${
                            brushColor.toLowerCase() === hex
                              ? 'border-white scale-110'
                              : 'border-slate-700'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={handleUndo}
                        className="py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Desfazer
                      </button>
                      <button
                        type="button"
                        onClick={handleRedo}
                        className="py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                        Refazer
                      </button>
                      <button
                        type="button"
                        onClick={handleClearRegion}
                        className="py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-700/60 text-xs font-bold text-rose-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Limpar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {statusMsg && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  statusMsg.type === 'ok'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                }`}
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>{statusMsg.text}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                disabled={!unlocked || saving}
                onClick={() => void handleSave()}
                className="flex-1 min-w-[180px] py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'SALVANDO...' : 'SALVAR PERSONALIZAÇÃO'}
              </button>
              <button
                type="button"
                disabled={!unlocked || equipping}
                onClick={() => void handleEquipMeuRatao()}
                className="flex-1 min-w-[180px] py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                {equipping
                  ? 'EQUIPANDO...'
                  : equippedSkin === 'meu_ratao'
                    ? 'SALVAR E MANTER EQUIPADA'
                    : 'EQUIPAR MEU RATÃO'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
