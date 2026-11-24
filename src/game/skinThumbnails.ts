import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CustomCharacterConfig,
  DEFAULT_CUSTOM_CHARACTER_CONFIG,
  SkinId,
} from '../shared/constants.ts';
import { animateCharacterRig, createCharacterRig } from './characters.ts';

export interface SkinThumbnailRequest {
  skinId: SkinId;
  customConfig?: CustomCharacterConfig;
  cacheKey: string;
}

const thumbnailCache = new Map<string, string>();
const listeners = new Map<string, Set<(dataUrl: string) => void>>();
const pendingQueue: SkinThumbnailRequest[] = [];
const queuedKeys = new Set<string>();
let processing = false;

export function getSkinThumbnailCacheKey(
  skinId: SkinId,
  customConfig?: CustomCharacterConfig,
  isUnlocked = true
): string {
  if (skinId === 'meu_ratao') {
    if (!isUnlocked || !customConfig) return 'meu_ratao:locked_white';
    return `meu_ratao:${customConfig.updatedAt || 'custom'}`;
  }
  return skinId;
}

export function getCachedSkinThumbnail(cacheKey: string): string | null {
  return thumbnailCache.get(cacheKey) ?? null;
}

export function requestSkinThumbnails(
  requests: SkinThumbnailRequest[],
  onReady: (cacheKey: string, dataUrl: string) => void
): () => void {
  const activeRegistrations: Array<{ key: string; cb: (url: string) => void }> = [];

  for (const req of requests) {
    const cached = thumbnailCache.get(req.cacheKey);
    if (cached) {
      onReady(req.cacheKey, cached);
      continue;
    }

    const cb = (dataUrl: string) => onReady(req.cacheKey, dataUrl);
    let set = listeners.get(req.cacheKey);
    if (!set) {
      set = new Set();
      listeners.set(req.cacheKey, set);
    }
    set.add(cb);
    activeRegistrations.push({ key: req.cacheKey, cb });

    if (!queuedKeys.has(req.cacheKey)) {
      queuedKeys.add(req.cacheKey);
      pendingQueue.push(req);
    }
  }

  if (pendingQueue.length > 0 && !processing) {
    void processThumbnailQueue();
  }

  return () => {
    for (const reg of activeRegistrations) {
      const set = listeners.get(reg.key);
      if (set) {
        set.delete(reg.cb);
        if (set.size === 0) listeners.delete(reg.key);
      }
    }
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

async function processThumbnailQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  let renderer: THREE.WebGLRenderer | null = null;
  let pmremEnvTexture: THREE.Texture | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;

  try {
    const size = 144;
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    pmremEnvTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    scene = new THREE.Scene();
    scene.environment = pmremEnvTexture;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5d6, 1.55);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    rimLight.position.set(-5, 4, -5);
    scene.add(rimLight);

    camera = new THREE.PerspectiveCamera(38, 1, 0.2, 40);
    camera.position.set(0.45, 1.32, 2.75);
    camera.lookAt(0, 0.96, 0);

    while (pendingQueue.length > 0) {
      // Render 2 thumbnails per animation frame to keep UI buttery on mobile & low-end PCs
      const batchCount = Math.min(2, pendingQueue.length);
      for (let i = 0; i < batchCount; i++) {
        const req = pendingQueue.shift();
        if (!req) break;
        queuedKeys.delete(req.cacheKey);

        if (thumbnailCache.has(req.cacheKey)) continue;

        const cfg =
          req.skinId === 'meu_ratao'
            ? req.customConfig || DEFAULT_CUSTOM_CHARACTER_CONFIG
            : undefined;
        const rig = createCharacterRig(req.skinId, false, cfg);
        rig.spawnTimer = 1; // Ensure full scale without entrance pop
        rig.root.rotation.y = 0.24;
        // Static crisp pose (elapsed = 0.2 avoids CR7 mid-loop jump in thumbnail, shows clean portrait)
        animateCharacterRig(rig, 'idle', 0.2, 0.016, 1);
        scene.add(rig.root);

        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');

        scene.remove(rig.root);
        rig.dispose();

        thumbnailCache.set(req.cacheKey, dataUrl);
        const cbs = listeners.get(req.cacheKey);
        if (cbs) {
          for (const cb of cbs) cb(dataUrl);
          listeners.delete(req.cacheKey);
        }
      }

      if (pendingQueue.length > 0) {
        await nextFrame();
      }
    }
  } catch {
    // Gracefully fail without blocking UI if headless/WebGL unavailable
    pendingQueue.length = 0;
    queuedKeys.clear();
  } finally {
    if (pmremEnvTexture) {
      pmremEnvTexture.dispose();
    }
    if (renderer) {
      try {
        const gl = renderer.getContext();
        renderer.dispose();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // Ignore cleanup errors
      }
    }
    processing = false;
  }
}

import { SkateId, SKATE_IDS } from '../shared/constants.ts';
import { createSkateMesh } from './characters.ts';

const skateThumbnailCache = new Map<SkateId, string>();
const skateListeners = new Map<SkateId, Set<(dataUrl: string) => void>>();
let skateProcessing = false;

export function getCachedSkateThumbnail(skateId: SkateId): string | null {
  return skateThumbnailCache.get(skateId) ?? null;
}

export function requestAllSkateThumbnails(
  onReady: (skateId: SkateId, dataUrl: string) => void
): () => void {
  const active: Array<{ id: SkateId; cb: (url: string) => void }> = [];
  for (const id of SKATE_IDS) {
    const cached = skateThumbnailCache.get(id);
    if (cached) {
      onReady(id, cached);
      continue;
    }
    const cb = (url: string) => onReady(id, url);
    let set = skateListeners.get(id);
    if (!set) {
      set = new Set();
      skateListeners.set(id, set);
    }
    set.add(cb);
    active.push({ id, cb });
  }

  if (!skateProcessing && skateThumbnailCache.size < SKATE_IDS.length) {
    void processSkateThumbnails();
  }

  return () => {
    for (const item of active) {
      const set = skateListeners.get(item.id);
      if (set) {
        set.delete(item.cb);
        if (set.size === 0) skateListeners.delete(item.id);
      }
    }
  };
}

async function processSkateThumbnails(): Promise<void> {
  if (skateProcessing) return;
  skateProcessing = true;
  let renderer: THREE.WebGLRenderer | null = null;
  let pmremTex: THREE.Texture | null = null;
  try {
    const size = 144;
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    pmremTex = pmrem.fromScene(env, 0.04).texture;
    env.dispose();
    pmrem.dispose();

    const scene = new THREE.Scene();
    scene.environment = pmremTex;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.0));
    const key = new THREE.DirectionalLight(0xfff5d6, 1.6);
    key.position.set(4, 6, 5);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.2, 30);
    camera.position.set(1.25, 0.92, 1.48);
    camera.lookAt(0, 0.12, 0);

    for (const id of SKATE_IDS) {
      if (skateThumbnailCache.has(id)) continue;
      const built = createSkateMesh(id);
      built.group.rotation.y = 0.45;
      scene.add(built.group);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      scene.remove(built.group);
      built.dispose();
      skateThumbnailCache.set(id, url);
      const cbs = skateListeners.get(id);
      if (cbs) {
        for (const cb of cbs) cb(url);
        skateListeners.delete(id);
      }
      await nextFrame();
    }
  } catch {
    // Graceful fallback if WebGL unavailable
  } finally {
    pmremTex?.dispose();
    if (renderer) {
      try {
        const gl = renderer.getContext();
        renderer.dispose();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // Ignore cleanup errors
      }
    }
    skateProcessing = false;
  }
}
