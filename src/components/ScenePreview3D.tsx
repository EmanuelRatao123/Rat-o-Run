import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CustomCharacterConfig,
  GraphicsQuality,
  MapId,
  PlayerCapeConfig,
  SkateId,
  SkinId,
} from '../shared/constants.ts';
import {
  CharacterAnimState,
  animateCharacterRig,
  applyCustomCapeToRig,
  applyEquippedSkateToRig,
  createCharacterRig,
} from '../game/characters.ts';
import { MAP_THEMES, MapSceneryBuilder } from '../game/maps.ts';
import { createStudioRenderer, scheduleSoftwareFrame } from '../game/rendererSetup.ts';

interface ScenePreview3DProps {
  skinId: SkinId;
  mapId: MapId;
  customConfig?: CustomCharacterConfig;
  capeConfig?: PlayerCapeConfig | null;
  skateId?: SkateId | null;
  skateActive?: boolean;
  animState?: CharacterAnimState;
  quality?: GraphicsQuality;
  mode?: 'showcase' | 'turntable' | 'scenic';
  interactiveRotate?: boolean;
  className?: string;
}

export function ScenePreview3D({
  skinId,
  mapId,
  customConfig,
  capeConfig,
  skateId,
  skateActive = false,
  animState,
  quality = 'medium',
  mode = 'showcase',
  interactiveRotate = false,
  className = '',
}: ScenePreview3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const skinRef = useRef<SkinId>(skinId);
  const mapRef = useRef<MapId>(mapId);
  const customRef = useRef<CustomCharacterConfig | undefined>(customConfig);
  const capeRef = useRef<PlayerCapeConfig | null | undefined>(capeConfig);
  const skateRef = useRef<{ id?: SkateId | null; active: boolean }>({
    id: skateId,
    active: skateActive,
  });
  const animRef = useRef<CharacterAnimState | undefined>(animState);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let timerId = 0;

    const ctx = createStudioRenderer(container, quality);
    const scene = new THREE.Scene();
    scene.environment = ctx.pmremEnvTexture;

    let currentAspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
    const camera = new THREE.PerspectiveCamera(46, currentAspect, 0.2, 130);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.85);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff5d6, 1.5);
    key.position.set(6, 10, 8);
    key.castShadow = ctx.renderer.shadowMap.enabled;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rim.position.set(-6, 5, -7);
    scene.add(rim);

    let sceneryBuilder: MapSceneryBuilder | null = null;
    let chunkGroup: THREE.Group | null = null;
    let charRig = createCharacterRig(
      skinRef.current,
      ctx.renderer.shadowMap.enabled,
      customRef.current
    );
    applyCustomCapeToRig(charRig, capeRef.current);
    applyEquippedSkateToRig(charRig, skateRef.current.id, skateRef.current.active);

    const applyMap = (mId: MapId) => {
      if (chunkGroup) {
        scene.remove(chunkGroup);
        chunkGroup = null;
      }
      if (sceneryBuilder) {
        sceneryBuilder.dispose();
        sceneryBuilder = null;
      }
      const theme = MAP_THEMES[mId];
      scene.background = new THREE.Color(theme.skyColor);
      scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
      key.color.setHex(theme.keyLightColor);
      key.intensity = theme.keyLightIntensity;
      hemi.color.setHex(theme.hemiSkyColor);
      hemi.groundColor.setHex(theme.hemiGroundColor);

      sceneryBuilder = new MapSceneryBuilder(
        mId,
        quality,
        ctx.renderer.capabilities.getMaxAnisotropy()
      );
      const chunk = sceneryBuilder.createChunk(0, 44);
      chunkGroup = chunk.group;
      chunkGroup.position.set(0, 0, -8);
      scene.add(chunkGroup);
    };

    applyMap(mapRef.current);

    if (mode !== 'scenic') {
      scene.add(charRig.root);
    }

    let userYaw = mode === 'turntable' ? 0.35 : -0.3;
    let dragging = false;
    let lastX = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (!interactiveRotate) return;
      dragging = true;
      lastX = e.clientX;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !interactiveRotate) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      userYaw += dx * 0.012;
    };
    const onPointerUp = () => {
      dragging = false;
    };

    if (interactiveRotate) {
      ctx.renderer.domElement.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    const onResize = () => {
      if (disposed || !container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      currentAspect = w / h;
      camera.fov = currentAspect < 0.85 ? 52 : 46;
      camera.aspect = currentAspect;
      camera.updateProjectionMatrix();
      ctx.renderer.setSize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(container);

    if (!ctx.isSoftwareGl) {
      ctx.renderer.compile(scene, camera);
    }

    let lastTime = performance.now();
    let elapsed = 0;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      if (mode === 'scenic') {
        camera.position.set(Math.sin(elapsed * 0.35) * 1.4, 3.6, 8.5);
        camera.lookAt(0, 1.8, -14);
      } else if (mode === 'turntable') {
        if (!dragging && !interactiveRotate) userYaw += dt * 0.55;
        else if (!dragging && interactiveRotate && animRef.current === 'run') userYaw += dt * 0.28;
        charRig.root.rotation.y = userYaw;
        camera.position.set(0, 1.65, 3.85);
        camera.lookAt(0, 1.05, 0);
        const targetAnim = animRef.current || 'idle';
        animateCharacterRig(charRig, targetAnim, elapsed, dt, targetAnim === 'run' ? 0.85 : 1);
      } else {
        // Showcase hero framing — centered cleanly on narrow mobile, behind-shoulder on desktop
        const isPortraitMobile = currentAspect < 0.85;
        charRig.root.position.set(isPortraitMobile ? 0 : 1.1, isPortraitMobile ? 0.1 : 0, isPortraitMobile ? 0.4 : 0.8);
        charRig.root.rotation.y = (isPortraitMobile ? -0.15 : -0.38) + Math.sin(elapsed * 0.45) * 0.14;
        if (isPortraitMobile) {
          camera.position.set(0, 2.0, 5.4);
          camera.lookAt(0, 0.95, -2.5);
        } else {
          camera.position.set(0.35, 2.05, 4.75);
          camera.lookAt(0.25, 1.15, -3.5);
        }
        animateCharacterRig(charRig, animRef.current || 'run', elapsed, dt, 0.72);
      }

      ctx.renderer.render(scene, camera);
      if (disposed) return;

      if (ctx.isSoftwareGl) {
        scheduleSoftwareFrame(ctx.renderer, tick, (id) => {
          timerId = id;
        });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    const rebuildRig = (nextSkin: SkinId, nextCfg?: CustomCharacterConfig) => {
      skinRef.current = nextSkin;
      customRef.current = nextCfg;
      scene.remove(charRig.root);
      charRig.dispose();
      charRig = createCharacterRig(nextSkin, ctx.renderer.shadowMap.enabled, nextCfg);
      applyCustomCapeToRig(charRig, capeRef.current);
      applyEquippedSkateToRig(charRig, skateRef.current.id, skateRef.current.active);
      if (mode !== 'scenic') scene.add(charRig.root);
    };

    (
      container as unknown as {
        _updateCharacter?: (s: SkinId, c?: CustomCharacterConfig) => void;
        _updateCape?: (cape?: PlayerCapeConfig | null) => void;
        _updateSkate?: (id?: SkateId | null, active?: boolean) => void;
        _updateMap?: (m: MapId) => void;
      }
    )._updateCharacter = (nextSkin: SkinId, nextCfg?: CustomCharacterConfig) => {
      const sameSkin = skinRef.current === nextSkin;
      const sameCfg = nextSkin !== 'meu_ratao' || customRef.current === nextCfg;
      if (sameSkin && sameCfg) return;
      rebuildRig(nextSkin, nextCfg);
    };

    (
      container as unknown as {
        _updateCape?: (cape?: PlayerCapeConfig | null) => void;
      }
    )._updateCape = (nextCape?: PlayerCapeConfig | null) => {
      capeRef.current = nextCape;
      applyCustomCapeToRig(charRig, nextCape);
    };

    (
      container as unknown as {
        _updateSkate?: (id?: SkateId | null, active?: boolean) => void;
      }
    )._updateSkate = (id?: SkateId | null, active = false) => {
      skateRef.current = { id, active };
      applyEquippedSkateToRig(charRig, id, active);
    };

    (container as unknown as { _updateMap?: (m: MapId) => void })._updateMap = (nextMap: MapId) => {
      if (mapRef.current === nextMap) return;
      mapRef.current = nextMap;
      applyMap(nextMap);
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timerId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      resizeObserver?.disconnect();
      if (interactiveRotate) {
        ctx.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }
      charRig.dispose();
      sceneryBuilder?.dispose();
      ctx.dispose();
    };
  }, [quality, mode, interactiveRotate]);

  useEffect(() => {
    animRef.current = animState;
  }, [animState]);

  useEffect(() => {
    const el = mountRef.current as unknown as {
      _updateCharacter?: (s: SkinId, c?: CustomCharacterConfig) => void;
    } | null;
    if (el?._updateCharacter) el._updateCharacter(skinId, customConfig);
  }, [skinId, customConfig]);

  useEffect(() => {
    const el = mountRef.current as unknown as { _updateMap?: (m: MapId) => void } | null;
    if (el?._updateMap) el._updateMap(mapId);
  }, [mapId]);

  useEffect(() => {
    const el = mountRef.current as unknown as {
      _updateCape?: (c?: PlayerCapeConfig | null) => void;
    } | null;
    if (el?._updateCape) el._updateCape(capeConfig);
  }, [capeConfig]);

  useEffect(() => {
    const el = mountRef.current as unknown as {
      _updateSkate?: (id?: SkateId | null, active?: boolean) => void;
    } | null;
    if (el?._updateSkate) el._updateSkate(skateId, skateActive);
  }, [skateId, skateActive]);

  return <div ref={mountRef} className={`w-full h-full ${className}`} />;
}
