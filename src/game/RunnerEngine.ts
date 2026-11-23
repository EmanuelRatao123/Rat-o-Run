import * as THREE from 'three';
import {
  GraphicsQuality,
  MapId,
  MultiplayerMode,
  MultiplayerParticipant,
  POWERUPS,
  ParticipantAnimState,
  PowerUpType,
  SkinId,
} from '../shared/constants.ts';
import { createSeededRng, generateTrackWave } from '../shared/trackGenerator.ts';
import { gameAudio } from './audio.ts';
import {
  CharacterAnimState,
  CharacterRig,
  animateCharacterRig,
  createCharacterRig,
  createFloatingNameTag,
  createPoliceRig,
} from './characters.ts';
import { MAP_THEMES, MapSceneryBuilder, SceneryChunk } from './maps.ts';
import {
  CoinInstance,
  LANE_X,
  ObstacleAndItemFactory,
  ObstacleInstance,
  ObstacleKind,
  PowerUpInstance,
} from './obstacles.ts';
import {
  RendererContext,
  createStudioRenderer,
  scheduleSoftwareFrame,
} from './rendererSetup.ts';

export interface HudSnapshot {
  noCoinTimeMs: number;
  coinFrozen: boolean;
  coins: number;
  distance: number;
  score: number;
  policeActive: boolean;
  policeRemainingSec: number;
  collisionCount: number;
  activePowerUps: { type: PowerUpType; remainingSec: number; maxSec: number }[];
  speedKmh: number;
}

export interface RunResultPayload {
  noCoinTimeMs: number;
  collectedCoin: boolean;
  coins: number;
  distance: number;
  score: number;
  durationMs: number;
}

export interface MultiplayerRunnerOptions {
  mode: MultiplayerMode;
  seed: number;
  isHost: boolean;
  opponentNickname: string;
  opponentSkin: SkinId;
  frozenAtStart?: boolean;
  onCoinCollected?: (coinZ: number, coinLane: number) => void;
  onLocalCrashed?: (payload: RunResultPayload) => void;
}

export interface MultiplayerTelemetrySnapshot {
  posX: number;
  posY: number;
  posZ: number;
  lane: number;
  animState: ParticipantAnimState;
  distance: number;
  coins: number;
  score: number;
  noCoinTimeMs: number;
  durationMs: number;
  collisionCount: number;
  alive: boolean;
  hoverboard: boolean;
  jetpack: boolean;
}

interface RemotePlayerVisualState {
  targetX: number;
  targetY: number;
  targetZ: number;
  animState: ParticipantAnimState;
  hoverboard: boolean;
  jetpack: boolean;
  alive: boolean;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

const CHUNK_LENGTH = 40;
const NUM_CHUNKS = 5;
const BASE_SPEED = 16.5;
const MAX_SPEED = 35;

export class RunnerEngine {
  private container: HTMLElement;
  private ctx: RendererContext;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private keyLight: THREE.DirectionalLight;

  private sceneryBuilder: MapSceneryBuilder;
  private obstacleFactory: ObstacleAndItemFactory;
  private chunks: SceneryChunk[] = [];
  private obstacles: ObstacleInstance[] = [];
  private coins: CoinInstance[] = [];
  private powerUps: PowerUpInstance[] = [];
  private particles: Particle[] = [];
  private particlePoolGeo: THREE.BoxGeometry;

  private playerRig: CharacterRig;
  private policeRig: CharacterRig;
  private remoteRig?: CharacterRig;
  private remoteNameTag?: { sprite: THREE.Sprite; dispose: () => void };
  private remoteState: RemotePlayerVisualState = {
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    animState: 'idle',
    hoverboard: false,
    jetpack: false,
    alive: true,
  };

  private mapId: MapId;
  private skinId: SkinId;
  private quality: GraphicsQuality;
  private multiplayer?: MultiplayerRunnerOptions;
  private rng: () => number;
  private waveIndex = 0;

  private onHudUpdate: (hud: HudSnapshot) => void;
  private onGameOver: (result: RunResultPayload) => void;

  private running = false;
  private paused = false;
  private frozen = false;
  private coopLocalDead = false;
  private ended = false;
  private endAnimState: CharacterAnimState = 'crash';
  private disposed = false;

  private frameId = 0;
  private timerId = 0;
  private lastTimestamp = 0;
  private totalElapsed = 0;

  // Player physics
  private targetLane = 0; // -1, 0, 1
  private playerX = 0;
  private playerY = 0;
  private playerZ = 0;
  private vy = 0;
  private grounded = true;
  private slideTimer = 0;
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private invulnTimer = 0;
  private stumbleTimer = 0;
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private stepSoundCooldown = 0;
  private currentAnimState: ParticipantAnimState = 'idle';

  // Police chase (2 seconds after 1st collision)
  private collisionCount = 0;
  private policeChaseTimer = 0;
  private policeZOffset = 10;

  // Mode: Sem Pegar Moedas
  private durationMs = 0;
  private noCoinTimeMs = 0;
  private collectedCoin = false;
  private coinCount = 0;
  private distance = 0;
  private score = 0;
  private nextEntityId = 1;
  private nextSpawnZ = -26;
  private hudEmitAccum = 0;

  // Active PowerUps
  private powerTimers: Record<PowerUpType, number> = {
    magnet: 0,
    jetpack: 0,
    super_jump: 0,
    multiplier: 0,
    hoverboard: 0,
  };

  private keyDownHandler: (e: KeyboardEvent) => void;
  private blurHandler: () => void;
  private resizeHandler: () => void;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchActive = false;
  private touchStartHandler: (e: TouchEvent) => void;
  private touchMoveHandler: (e: TouchEvent) => void;
  private touchEndHandler: () => void;

  constructor(opts: {
    container: HTMLElement;
    mapId: MapId;
    skinId: SkinId;
    quality: GraphicsQuality;
    onHudUpdate: (hud: HudSnapshot) => void;
    onGameOver: (result: RunResultPayload) => void;
    multiplayer?: MultiplayerRunnerOptions;
  }) {
    this.container = opts.container;
    this.mapId = opts.mapId;
    this.skinId = opts.skinId;
    this.quality = opts.quality;
    this.onHudUpdate = opts.onHudUpdate;
    this.onGameOver = opts.onGameOver;
    this.multiplayer = opts.multiplayer;
    this.frozen = Boolean(opts.multiplayer?.frozenAtStart);
    this.rng = createSeededRng(
      opts.multiplayer?.seed ?? (Math.floor(Math.random() * 0x7fffffff) + 1)
    );

    if (opts.multiplayer) {
      this.playerX = opts.multiplayer.isHost ? -0.65 : 0.65;
      this.remoteState.targetX = opts.multiplayer.isHost ? 0.65 : -0.65;
    }

    this.ctx = createStudioRenderer(this.container, this.quality);
    const theme = MAP_THEMES[this.mapId];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.skyColor);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
    this.scene.environment = this.ctx.pmremEnvTexture;

    const aspect = Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.2, 160);
    this.camera.position.set(0, 4.4, 7.2);
    this.camera.lookAt(0, 1.4, -10);

    // 3-point studio outdoor lighting
    const hemi = new THREE.HemisphereLight(
      theme.hemiSkyColor,
      theme.hemiGroundColor,
      theme.hemiIntensity
    );
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(theme.keyLightColor, theme.keyLightIntensity);
    this.keyLight.position.set(14, 24, 16);
    this.keyLight.castShadow = this.ctx.renderer.shadowMap.enabled;
    const shadowRes = this.quality === 'high' ? 1024 : 512;
    this.keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 75;
    this.keyLight.shadow.camera.left = -16;
    this.keyLight.shadow.camera.right = 16;
    this.keyLight.shadow.camera.top = 24;
    this.keyLight.shadow.camera.bottom = -20;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const maxAniso = this.ctx.renderer.capabilities.getMaxAnisotropy();
    this.sceneryBuilder = new MapSceneryBuilder(this.mapId, this.quality, maxAniso);
    this.obstacleFactory = new ObstacleAndItemFactory();
    this.particlePoolGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);

    // Initial chunks
    for (let i = 0; i < NUM_CHUNKS; i++) {
      const chunk = this.sceneryBuilder.createChunk(i, CHUNK_LENGTH);
      chunk.group.position.z = -i * CHUNK_LENGTH;
      this.scene.add(chunk.group);
      this.chunks.push(chunk);
    }

    // Characters (models face +Z locally; rotate PI radians to run forward along -Z)
    this.playerRig = createCharacterRig(this.skinId, this.ctx.renderer.shadowMap.enabled);
    this.playerRig.root.rotation.y = Math.PI;
    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.scene.add(this.playerRig.root);

    if (opts.multiplayer) {
      this.remoteRig = createCharacterRig(
        opts.multiplayer.opponentSkin,
        this.ctx.renderer.shadowMap.enabled
      );
      this.remoteRig.root.rotation.y = Math.PI;
      this.remoteRig.root.position.set(
        this.remoteState.targetX,
        this.remoteState.targetY,
        this.remoteState.targetZ
      );
      this.remoteNameTag = createFloatingNameTag(
        opts.multiplayer.opponentNickname,
        opts.multiplayer.mode === 'x1' ? '#ef4444' : '#38bdf8'
      );
      this.remoteRig.root.add(this.remoteNameTag.sprite);
      this.scene.add(this.remoteRig.root);
    }

    this.policeRig = createPoliceRig(this.ctx.renderer.shadowMap.enabled);
    this.policeRig.root.rotation.y = Math.PI;
    this.policeRig.root.visible = false;
    this.scene.add(this.policeRig.root);

    // Pre-populate initial runway waves
    while (this.nextSpawnZ > -135) {
      this.spawnWave();
    }

    if (!this.ctx.isSoftwareGl) {
      this.ctx.renderer.compile(this.scene, this.camera);
    }

    // Bind input listeners
    this.keyDownHandler = (e) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable ||
          Boolean(activeEl.closest('[data-admin-overlay="true"]')))
      ) {
        return;
      }
      if (!this.running || this.paused || this.frozen || this.coopLocalDead || this.ended) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        this.moveLeft();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        this.moveRight();
      } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.jump();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        this.slide();
      }
    };

    this.blurHandler = () => {
      // Never auto-pause active multiplayer matches on window blur
      if (!this.multiplayer && this.running && !this.paused && !this.ended) {
        this.setPaused(true);
      }
    };

    this.resizeHandler = () => this.handleResize();

    this.touchStartHandler = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !this.running || this.paused || this.ended) return;
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchActive = true;
    };

    this.touchMoveHandler = (e: TouchEvent) => {
      if (!this.touchActive || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this.touchStartX;
      const dy = e.touches[0].clientY - this.touchStartY;
      const threshold = 26;
      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) this.moveLeft();
          else this.moveRight();
        } else {
          if (dy < 0) this.jump();
          else this.slide();
        }
        this.touchActive = false;
      }
    };

    this.touchEndHandler = () => {
      this.touchActive = false;
    };

    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('blur', this.blurHandler);
    window.addEventListener('resize', this.resizeHandler);
    this.ctx.renderer.domElement.addEventListener('touchstart', this.touchStartHandler, { passive: true });
    this.ctx.renderer.domElement.addEventListener('touchmove', this.touchMoveHandler, { passive: true });
    this.ctx.renderer.domElement.addEventListener('touchend', this.touchEndHandler, { passive: true });
  }

  public start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.paused = false;
    this.lastTimestamp = performance.now();
    this.scheduleNextTick();
  }

  public setPaused(paused: boolean): void {
    if (this.multiplayer) return;
    this.paused = paused;
    if (!paused) {
      this.lastTimestamp = performance.now();
    }
  }

  public setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    if (!frozen) {
      this.lastTimestamp = performance.now();
    }
  }

  public updateRemotePlayerState(remote: MultiplayerParticipant): void {
    this.remoteState = {
      targetX: remote.posX,
      targetY: remote.posY,
      targetZ: remote.posZ,
      animState: remote.animState,
      hoverboard: Boolean(remote.hoverboard),
      jetpack: Boolean(remote.jetpack),
      alive: remote.alive,
    };
  }

  public getMultiplayerTelemetry(): MultiplayerTelemetrySnapshot {
    return {
      posX: Number(this.playerX.toFixed(3)),
      posY: Number(this.playerY.toFixed(3)),
      posZ: Number(this.playerZ.toFixed(3)),
      lane: this.targetLane,
      animState: this.coopLocalDead ? 'crash' : this.currentAnimState,
      distance: Math.floor(this.distance),
      coins: this.coinCount,
      score: Math.floor(this.score),
      noCoinTimeMs: Math.round(this.noCoinTimeMs),
      durationMs: Math.round(this.durationMs),
      collisionCount: this.collisionCount,
      alive: !this.ended && !this.coopLocalDead,
      hoverboard: this.powerTimers.hoverboard > 0,
      jetpack: this.powerTimers.jetpack > 0,
    };
  }

  public forceEndExternal(animState: CharacterAnimState = 'idle'): void {
    this.frozen = false;
    this.ended = true;
    this.endAnimState = animState;
    this.emitHud(0);
  }

  public moveLeft(): void {
    if (!this.running || this.paused || this.frozen || this.coopLocalDead || this.ended) return;
    if (this.targetLane > -1) {
      this.targetLane -= 1;
      gameAudio.playLaneSwitch();
    }
  }

  public moveRight(): void {
    if (!this.running || this.paused || this.frozen || this.coopLocalDead || this.ended) return;
    if (this.targetLane < 1) {
      this.targetLane += 1;
      gameAudio.playLaneSwitch();
    }
  }

  public jump(): void {
    if (!this.running || this.paused || this.frozen || this.coopLocalDead || this.ended) return;
    this.jumpBufferTimer = 0.14;
  }

  public slide(): void {
    if (!this.running || this.paused || this.frozen || this.coopLocalDead || this.ended) return;
    if (this.powerTimers.jetpack > 0) return;
    if (!this.grounded) {
      // Fast-fall slam!
      this.vy = Math.min(this.vy, -32);
    }
    this.slideTimer = 0.72;
    gameAudio.playSlide();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.ctx.renderer.setSize(w, h);
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.ctx.isSoftwareGl) {
      scheduleSoftwareFrame(
        this.ctx.renderer,
        () => this.tick(),
        (id) => {
          this.timerId = id;
        }
      );
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private updateRemoteVisuals(dt: number): void {
    if (!this.remoteRig) return;
    const r = this.remoteRig.root.position;
    const nx = THREE.MathUtils.damp(r.x, this.remoteState.targetX, 16, dt);
    const ny = THREE.MathUtils.damp(r.y, this.remoteState.targetY, 16, dt);
    // Keep Z interpolating fast so remote runner matches live progress
    const nz = THREE.MathUtils.damp(r.z, this.remoteState.targetZ, 16, dt);
    r.set(nx, ny, nz);
    this.remoteRig.hoverboardGroup.visible = this.remoteState.hoverboard;
    this.remoteRig.jetpackGroup.visible = this.remoteState.jetpack;
    this.remoteRig.contactShadow.position.y = Math.max(0.025, -ny + 0.025);
    animateCharacterRig(
      this.remoteRig,
      this.remoteState.animState,
      this.totalElapsed,
      dt,
      1.05
    );
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.frozen) {
      this.totalElapsed += dt;
      this.currentAnimState = 'idle';
      animateCharacterRig(this.playerRig, 'idle', this.totalElapsed, dt);
      if (this.remoteRig) {
        animateCharacterRig(this.remoteRig, 'idle', this.totalElapsed, dt);
      }
      this.camera.position.set(0, 4.1, 6.9);
      this.camera.lookAt(0, 1.35, -12);
    } else if (this.coopLocalDead && !this.ended) {
      this.totalElapsed += dt;
      this.updateRemoteVisuals(dt);
      animateCharacterRig(this.playerRig, 'crash', this.totalElapsed, dt);
      animateCharacterRig(this.policeRig, 'idle', this.totalElapsed, dt);
      this.updateParticles(dt);

      const focusPos = this.remoteRig ? this.remoteRig.root.position : this.playerRig.root.position;
      for (const chunk of this.chunks) {
        if (chunk.group.position.z - focusPos.z > CHUNK_LENGTH * 1.1) {
          chunk.group.position.z -= NUM_CHUNKS * CHUNK_LENGTH;
        }
      }
      while (this.nextSpawnZ > focusPos.z - 140) {
        this.spawnWave();
      }
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, focusPos.x * 0.65, 8, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, Math.max(4.1, focusPos.y + 3.8), 8, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, focusPos.z + 6.9, 8, dt);
      this.camera.lookAt(focusPos.x * 0.45, focusPos.y + 1.35, focusPos.z - 12);
    } else if (!this.paused && !this.ended) {
      this.stepSimulation(dt);
    } else if (this.ended) {
      this.totalElapsed += dt;
      animateCharacterRig(this.playerRig, this.endAnimState, this.totalElapsed, dt);
      animateCharacterRig(this.policeRig, 'idle', this.totalElapsed, dt);
      if (this.remoteRig) {
        animateCharacterRig(this.remoteRig, this.remoteState.alive ? 'idle' : 'crash', this.totalElapsed, dt);
      }
    }

    this.ctx.renderer.render(this.scene, this.camera);
    if (!this.disposed) {
      this.scheduleNextTick();
    }
  }

  private stepSimulation(dt: number): void {
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    this.totalElapsed += dt;
    const dtMs = dt * 1000;
    this.durationMs += dtMs;
    if (!this.collectedCoin) {
      this.noCoinTimeMs += dtMs;
    }

    // Power-up countdowns
    (Object.keys(this.powerTimers) as PowerUpType[]).forEach((k) => {
      if (this.powerTimers[k] > 0) {
        this.powerTimers[k] = Math.max(0, this.powerTimers[k] - dt);
      }
    });

    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.stumbleTimer > 0) this.stumbleTimer -= dt;
    if (this.slideTimer > 0) this.slideTimer -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    // Speed progression
    const progressSpeed = Math.min(MAX_SPEED, BASE_SPEED + (this.durationMs / 1000) * 0.22);
    let currentSpeed = progressSpeed;
    if (this.powerTimers.jetpack > 0) {
      currentSpeed *= 1.35;
    } else if (this.policeChaseTimer > 0) {
      currentSpeed *= 0.62;
    }

    // Police Chase Timer (2 seconds)
    if (this.policeChaseTimer > 0) {
      this.policeChaseTimer = Math.max(0, this.policeChaseTimer - dt);
      if (this.policeChaseTimer === 0) {
        // Escaped! Police drops back
        this.policeZOffset = 3.2;
      }
    }

    // Move forward along -Z
    const moveZ = currentSpeed * dt;
    this.playerZ -= moveZ;
    this.distance += moveZ * 0.85;
    const scoreMult = this.powerTimers.multiplier > 0 ? 2 : 1;
    this.score += moveZ * 1.6 * scoreMult;

    // Lane lateral damping
    const targetX = LANE_X[this.targetLane + 1];
    this.playerX = THREE.MathUtils.damp(this.playerX, targetX, 18, dt);

    // Ground height under player (ramps & walkable train/tunnel roofs)
    let floorY = 0;
    for (const obs of this.obstacles) {
      const ox = LANE_X[obs.lane + 1];
      if (Math.abs(this.playerX - ox) > 1.15) continue;
      for (const c of obs.colliders) {
        const wMinZ = obs.z + c.minZ;
        const wMaxZ = obs.z + c.maxZ;
        if (this.playerZ < wMinZ || this.playerZ > wMaxZ) continue;
        if (c.isRamp && c.rampMaxY && c.rampStartZ !== undefined && c.rampEndZ !== undefined) {
          const zStart = obs.z + c.rampStartZ;
          const zEnd = obs.z + c.rampEndZ;
          const t = THREE.MathUtils.clamp((zStart - this.playerZ) / (zStart - zEnd), 0, 1);
          floorY = Math.max(floorY, t * c.rampMaxY);
        } else if (c.isTopWalkable && this.playerY >= c.maxY - 0.65) {
          floorY = Math.max(floorY, c.maxY);
        }
      }
    }

    // Vertical physics (Jetpack vs normal jump/gravity)
    if (this.powerTimers.jetpack > 0) {
      this.playerY = THREE.MathUtils.damp(this.playerY, 6.2, 7, dt);
      this.vy = 0;
      this.grounded = false;
      this.slideTimer = 0;
    } else {
      if (this.grounded) {
        this.coyoteTimer = 0.09;
      } else {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      }

      if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
        const superJump = this.powerTimers.super_jump > 0;
        this.vy = superJump ? 18.2 : 13.8;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.slideTimer = 0;
        gameAudio.playJump();
        this.spawnBurst(this.playerX, this.playerY + 0.15, this.playerZ, 0xe2e8f0, 5);
      }

      const gravity = -38;
      this.vy += gravity * dt;
      this.playerY += this.vy * dt;

      if (this.playerY <= floorY) {
        if (!this.grounded && this.vy < -10) {
          this.spawnBurst(this.playerX, floorY + 0.1, this.playerZ, 0xcbd5e1, 4);
        }
        this.playerY = floorY;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    // Footstep sound
    this.stepSoundCooldown -= dt;
    if (this.grounded && this.slideTimer <= 0 && this.powerTimers.hoverboard <= 0 && this.stepSoundCooldown <= 0) {
      gameAudio.playStep();
      this.stepSoundCooldown = 0.24 / (currentSpeed / BASE_SPEED);
    }

    // Sync player rig visuals
    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.contactShadow.position.y = Math.max(0.025, floorY - this.playerY + 0.025);
    const shadowScale = Math.max(0.35, 1 - (this.playerY - floorY) * 0.12);
    this.playerRig.contactShadow.scale.setScalar(shadowScale);

    // Lean slightly into lane transitions (with root rotated PI on Y, +Z roll leans toward +X)
    const lateralVel = targetX - this.playerX;
    this.playerRig.root.rotation.z = THREE.MathUtils.clamp(lateralVel * 0.12, -0.3, 0.3);

    // Accessory visibility
    this.playerRig.hoverboardGroup.visible = this.powerTimers.hoverboard > 0;
    this.playerRig.jetpackGroup.visible = this.powerTimers.jetpack > 0;
    this.playerRig.magnetAura.visible = this.powerTimers.magnet > 0;
    this.playerRig.magnetAura.rotation.z += dt * 4;
    this.playerRig.shieldRing.visible =
      this.powerTimers.super_jump > 0 || this.powerTimers.multiplier > 0;
    if (this.playerRig.shieldRing.visible) {
      this.playerRig.shieldRing.rotation.z -= dt * 3.5;
    }

    // Determine character animation state
    let animState: CharacterAnimState = 'run';
    if (this.powerTimers.jetpack > 0) animState = 'jetpack';
    else if (this.stumbleTimer > 0) animState = 'stumble';
    else if (this.slideTimer > 0) animState = 'slide';
    else if (!this.grounded) animState = 'jump';
    this.currentAnimState = animState;

    animateCharacterRig(this.playerRig, animState, this.totalElapsed, dt, currentSpeed / BASE_SPEED);
    this.updateRemoteVisuals(dt);

    // Hit flash fade
    const flashOn = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 20) % 2 === 0;
    for (const mat of this.playerRig.flashMaterials) {
      if (flashOn) {
        mat.emissive.setHex(0xef4444);
        mat.emissiveIntensity = 0.7;
      } else if (mat.emissiveIntensity > 0 && mat.emissive.getHex() === 0xef4444) {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    // Police Pursuer Positioning & Animation
    if (this.policeChaseTimer > 0) {
      this.policeRig.root.visible = true;
      this.policeZOffset = THREE.MathUtils.damp(this.policeZOffset, 2.25, 8, dt);
      const policeX = THREE.MathUtils.damp(this.policeRig.root.position.x, this.playerX, 9, dt);
      this.policeRig.root.position.set(policeX, floorY, this.playerZ + this.policeZOffset);
      animateCharacterRig(this.policeRig, 'run', this.totalElapsed, dt, 1.15);
    } else if (this.policeRig.root.visible) {
      this.policeZOffset += dt * 14;
      this.policeRig.root.position.z = this.playerZ + this.policeZOffset;
      animateCharacterRig(this.policeRig, 'run', this.totalElapsed, dt, 0.9);
      if (this.policeZOffset > 11) {
        this.policeRig.root.visible = false;
      }
    }

    // Move scenery chunks infinitely
    for (const chunk of this.chunks) {
      if (chunk.group.position.z - this.playerZ > CHUNK_LENGTH * 1.1) {
        chunk.group.position.z -= NUM_CHUNKS * CHUNK_LENGTH;
      }
      for (const a of chunk.animatedParts) {
        if (a.type === 'bob') {
          a.obj.position.y += Math.sin(this.totalElapsed * 4.5 + a.phase) * 0.004;
        } else if (a.type === 'sway') {
          a.obj.rotation.z = Math.sin(this.totalElapsed * 2.5 + a.phase) * 0.08;
        }
      }
    }

    // Spawn new waves ahead
    while (this.nextSpawnZ > this.playerZ - 140) {
      this.spawnWave();
    }

    // Update Obstacles & Check Collisions
    this.updateObstaclesAndCollisions(dt);

    // Update Coins & Magnet
    this.updateCoins(dt);

    // Update PowerUps
    this.updatePowerUps(dt);

    // Update Particles
    this.updateParticles(dt);

    // Camera follow + damped shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0.005) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.exp(-9 * dt);
    } else {
      this.shakeIntensity = 0;
    }

    const camTargetX = this.playerX * 0.65 + shakeX;
    const camTargetY = Math.max(4.1, this.playerY + 3.8) + shakeY;
    const camTargetZ = this.playerZ + 6.9;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camTargetX, 10, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camTargetY, 8, dt);
    this.camera.position.z = camTargetZ;
    this.camera.lookAt(this.playerX * 0.45, this.playerY + 1.35, this.playerZ - 12);

    // Follow shadow light with player
    this.keyLight.position.set(this.playerX + 14, 24, this.playerZ + 12);
    this.keyLight.target.position.set(this.playerX, 0, this.playerZ - 12);
    this.keyLight.target.updateMatrixWorld();

    // Emit HUD snapshot ~20fps so React never throttles WebGL
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHud(currentSpeed);
    }
  }

  private emitHud(currentSpeed: number): void {
    const activePowerUps = (Object.keys(this.powerTimers) as PowerUpType[])
      .filter((t) => this.powerTimers[t] > 0)
      .map((t) => ({
        type: t,
        remainingSec: this.powerTimers[t],
        maxSec: POWERUPS[t].durationSec,
      }));

    this.onHudUpdate({
      noCoinTimeMs: this.noCoinTimeMs,
      coinFrozen: this.collectedCoin,
      coins: this.coinCount,
      distance: Math.floor(this.distance),
      score: Math.floor(this.score),
      policeActive: this.policeChaseTimer > 0,
      policeRemainingSec: this.policeChaseTimer,
      collisionCount: this.collisionCount,
      activePowerUps,
      speedKmh: Math.round(currentSpeed * 2.4),
    });
  }

  private updateObstaclesAndCollisions(dt: number): void {
    const pHalfW = 0.34;
    const pHalfD = 0.34;
    const pMinX = this.playerX - pHalfW;
    const pMaxX = this.playerX + pHalfW;
    const pMinY = this.playerY + 0.08;
    const pMaxY = this.playerY + (this.slideTimer > 0 ? 0.78 : 1.56);
    const pMinZ = this.playerZ - pHalfD;
    const pMaxZ = this.playerZ + pHalfD;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (obs.speedZ > 0) {
        obs.z += obs.speedZ * dt;
        obs.mesh.position.z = obs.z;
      }

      if (obs.z - this.playerZ > 22) {
        this.scene.remove(obs.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }

      if (obs.hitTriggered || this.invulnTimer > 0 || this.powerTimers.jetpack > 0) {
        continue;
      }

      const ox = LANE_X[obs.lane + 1];
      let collided = false;
      for (const c of obs.colliders) {
        if (c.isRamp) continue;
        // If standing cleanly on walkable roof, not a crash!
        if (c.isTopWalkable && this.playerY >= c.maxY - 0.55) continue;

        const bMinX = ox + c.minX;
        const bMaxX = ox + c.maxX;
        const bMinY = c.minY;
        const bMaxY = c.maxY;
        const bMinZ = obs.z + c.minZ;
        const bMaxZ = obs.z + c.maxZ;

        const overlapX = pMinX < bMaxX && pMaxX > bMinX;
        const overlapY = pMinY < bMaxY && pMaxY > bMinY;
        const overlapZ = pMinZ < bMaxZ && pMaxZ > bMinZ;

        if (overlapX && overlapY && overlapZ) {
          collided = true;
          break;
        }
      }

      if (collided) {
        obs.hitTriggered = true;
        this.handleObstacleCollision();
      }
    }
  }

  private handleObstacleCollision(): void {
    // Hoverboard shield absorbs 1 crash
    if (this.powerTimers.hoverboard > 0) {
      this.powerTimers.hoverboard = 0;
      this.invulnTimer = 1.0;
      this.shakeIntensity = 0.35;
      gameAudio.playPowerUp();
      this.spawnBurst(this.playerX, this.playerY + 0.6, this.playerZ, 0x06b6d4, 14);
      return;
    }

    this.collisionCount += 1;
    this.hitstopTimer = 0.055;
    this.shakeIntensity = 0.55;
    this.spawnBurst(this.playerX, this.playerY + 0.8, this.playerZ, 0xef4444, 14);

    if (this.collisionCount === 1) {
      // First collision: Stumble + 2-second police chase!
      this.stumbleTimer = 0.75;
      this.invulnTimer = 0.85;
      this.policeChaseTimer = 2.0;
      this.policeZOffset = 5.5;
      this.policeRig.root.visible = true;
      gameAudio.playStumbleAndWhistle();
    } else {
      // Second collision in the same match: Captured! Game Over (or Co-op spectate friend)!
      this.policeRig.root.visible = true;
      this.policeRig.root.position.set(this.playerX - 0.5, this.playerY, this.playerZ + 1.0);
      gameAudio.playCaptured();
      this.emitHud(0);
      const resultPayload: RunResultPayload = {
        noCoinTimeMs: Math.round(this.noCoinTimeMs),
        collectedCoin: this.collectedCoin,
        coins: this.coinCount,
        distance: Math.floor(this.distance),
        score: Math.floor(this.score),
        durationMs: Math.round(this.durationMs),
      };

      if (this.multiplayer?.mode === 'coop') {
        this.coopLocalDead = true;
        this.multiplayer.onLocalCrashed?.(resultPayload);
      } else {
        this.ended = true;
        this.endAnimState = 'crash';
        this.onGameOver(resultPayload);
      }
    }
  }

  private updateCoins(dt: number): void {
    const magnetOn = this.powerTimers.magnet > 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      if (coin.collected || coin.z - this.playerZ > 16) {
        this.scene.remove(coin.mesh);
        this.coins.splice(i, 1);
        continue;
      }

      coin.mesh.rotation.y += dt * 4.2;

      if (magnetOn) {
        const dx = this.playerX - coin.x;
        const dy = this.playerY + 0.85 - coin.y;
        const dz = this.playerZ - coin.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 150) {
          const pull = Math.min(1, dt * 13);
          coin.x += dx * pull;
          coin.y += dy * pull;
          coin.z += dz * pull;
          coin.mesh.position.set(coin.x, coin.y, coin.z);
        }
      }

      const dx = coin.x - this.playerX;
      const dy = coin.y - (this.playerY + 0.85);
      const dz = coin.z - this.playerZ;
      if (dx * dx + dy * dy + dz * dz < 1.35) {
        coin.collected = true;
        this.coinCount += 1;
        this.score += 10 * (this.powerTimers.multiplier > 0 ? 2 : 1);

        if (!this.collectedCoin) {
          this.collectedCoin = true;
          gameAudio.playTimerFrozen();
        } else {
          gameAudio.playCoin(this.coinCount);
        }

        this.multiplayer?.onCoinCollected?.(coin.z, coin.lane);

        this.spawnBurst(coin.x, coin.y, coin.z, 0xfacc15, 7);
        this.scene.remove(coin.mesh);
        this.coins.splice(i, 1);
      }
    }
  }

  private updatePowerUps(dt: number): void {
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      if (p.collected || p.z - this.playerZ > 16) {
        this.scene.remove(p.mesh);
        this.powerUps.splice(i, 1);
        continue;
      }

      p.mesh.rotation.y += dt * 2.6;
      p.mesh.position.y = p.y + Math.sin(this.totalElapsed * 4 + p.id) * 0.16;

      const dx = p.x - this.playerX;
      const dy = p.y - (this.playerY + 0.9);
      const dz = p.z - this.playerZ;
      if (dx * dx + dy * dy + dz * dz < 1.65) {
        p.collected = true;
        this.powerTimers[p.type] = POWERUPS[p.type].durationSec;
        gameAudio.playPowerUp();
        const colNum = parseInt(POWERUPS[p.type].color.replace('#', ''), 16);
        this.spawnBurst(p.x, p.y, p.z, colNum, 12);
        this.scene.remove(p.mesh);
        this.powerUps.splice(i, 1);
      }
    }
  }

  private spawnBurst(x: number, y: number, z: number, color: number, count: number): void {
    const cap = this.quality === 'low' ? 18 : this.quality === 'medium' ? 40 : 75;
    if (this.particles.length >= cap) return;
    const actual = Math.min(count, cap - this.particles.length);

    for (let i = 0; i < actual; i++) {
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(this.particlePoolGeo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 8,
        vy: 2 + Math.random() * 6,
        vz: (Math.random() - 0.5) * 8,
        life: 0.42,
        maxLife: 0.42,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        (pt.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy -= 18 * dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      pt.mesh.scale.setScalar(pt.life / pt.maxLife);
    }
  }

  private spawnWave(): void {
    const wave = generateTrackWave(this.rng, this.waveIndex++, this.nextSpawnZ);
    for (const obs of wave.obstacles) {
      this.addObstacle(obs.kind, obs.lane, obs.z);
    }
    for (const c of wave.coins) {
      const coin = this.obstacleFactory.createCoin(this.nextEntityId++, c.lane, c.y, c.z);
      this.scene.add(coin.mesh);
      this.coins.push(coin);
    }
    for (const p of wave.powerUps) {
      const pu = this.obstacleFactory.createPowerUp(
        this.nextEntityId++,
        p.type,
        p.lane,
        p.y,
        p.z
      );
      this.scene.add(pu.mesh);
      this.powerUps.push(pu);
    }
    this.nextSpawnZ = wave.nextZ;
  }

  private addObstacle(kind: ObstacleKind, lane: number, z: number): void {
    const obs = this.obstacleFactory.createObstacle(this.nextEntityId++, kind, lane, z, this.mapId);
    this.scene.add(obs.mesh);
    this.obstacles.push(obs);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.timerId);

    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('blur', this.blurHandler);
    window.removeEventListener('resize', this.resizeHandler);
    this.ctx.renderer.domElement.removeEventListener('touchstart', this.touchStartHandler);
    this.ctx.renderer.domElement.removeEventListener('touchmove', this.touchMoveHandler);
    this.ctx.renderer.domElement.removeEventListener('touchend', this.touchEndHandler);

    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.particlePoolGeo.dispose();

    this.playerRig.dispose();
    this.policeRig.dispose();
    this.remoteNameTag?.dispose();
    this.remoteRig?.dispose();
    this.sceneryBuilder.dispose();
    this.obstacleFactory.dispose();
    this.ctx.dispose();
  }
}
