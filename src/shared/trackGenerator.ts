import { PowerUpType } from './constants.ts';

export type SeededObstacleKind =
  | 'low_barrier'
  | 'high_arch'
  | 'tall_block'
  | 'train_static'
  | 'train_moving'
  | 'ramp'
  | 'tunnel';

export interface WaveObstacleSpec {
  kind: SeededObstacleKind;
  lane: number;
  z: number;
}

export interface WaveCoinSpec {
  lane: number;
  y: number;
  z: number;
}

export interface WavePowerUpSpec {
  type: PowerUpType;
  lane: number;
  y: number;
  z: number;
}

export interface TrackWaveSpec {
  waveIndex: number;
  startZ: number;
  nextZ: number;
  openLane: number;
  obstacles: WaveObstacleSpec[];
  coins: WaveCoinSpec[];
  powerUps: WavePowerUpSpec[];
}

export function createSeededRng(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const LANES = [-1, 0, 1] as const;
const POWERUP_TYPES: PowerUpType[] = [
  'magnet',
  'jetpack',
  'super_jump',
  'multiplier',
  'hoverboard',
];

export const TRACK_PHYSICS = {
  baseSpeed: 16.5,
  maxSpeed: 35,
  trainMovingSpeed: 14,
  jumpVelocity: 13.8,
  gravity: -38,
  laneSwitchSpeed: 14,
  laneWidth: 2.6,
};

function pushCoinLine(
  coins: WaveCoinSpec[],
  lane: number,
  y: number,
  startZ: number,
  count: number,
  spacing: number
): void {
  for (let i = 0; i < count; i++) {
    coins.push({
      lane,
      y,
      z: startZ - i * spacing,
    });
  }
}

function pickOpenLane(rng: () => number, prevOpenLane?: number): number {
  if (prevOpenLane === undefined || !LANES.includes(prevOpenLane as -1 | 0 | 1)) {
    return LANES[Math.floor(rng() * LANES.length)];
  }
  // Prefer adjacent lane or staying on same lane to prevent impossible far jumps under tight windows
  const reachable = LANES.filter((l) => Math.abs(l - prevOpenLane) <= 1);
  return reachable[Math.floor(rng() * reachable.length)];
}

/**
 * Pure deterministic wave generator shared between 3D client engine and server X1 validator.
 * Guarantees:
 * - Never blocks all 3 lanes simultaneously
 * - Progressive difficulty curve (gentler early waves, richer combinations later)
 * - Minimum physical reaction/lane-switch clearances scaled for up to MAX_SPEED = 35 u/s
 * - No overlapping obstacle bounding volumes within a wave or between consecutive waves
 */
export function generateTrackWave(
  rng: () => number,
  waveIndex: number,
  z: number,
  prevOpenLane?: number
): TrackWaveSpec {
  const diff = Math.min(1, Math.max(0, waveIndex) / 80);
  const openLane = pickOpenLane(rng, prevOpenLane);
  const otherLanes = LANES.filter((l) => l !== openLane);

  const obstacles: WaveObstacleSpec[] = [];
  const coins: WaveCoinSpec[] = [];
  const powerUps: WavePowerUpSpec[] = [];

  // Early waves avoid moving trains so player builds rhythm smoothly
  const patternRoll = rng();
  let nextZ = z;
  let routeType: 'barriers' | 'arch' | 'ramp_train' | 'moving_train' | 'tunnel' | 'mixed_combo';

  if (waveIndex < 3) {
    routeType = patternRoll < 0.5 ? 'barriers' : 'arch';
  } else if (patternRoll < 0.22) {
    routeType = 'barriers';
  } else if (patternRoll < 0.42) {
    routeType = 'arch';
  } else if (patternRoll < 0.62) {
    routeType = 'ramp_train';
  } else if (patternRoll < 0.78) {
    routeType = 'moving_train';
  } else if (patternRoll < 0.90) {
    routeType = 'tunnel';
  } else {
    routeType = 'mixed_combo';
  }

  if (routeType === 'barriers') {
    // Open lane free + side lanes mix jumpable low barriers and tall blocks
    pushCoinLine(coins, openLane, 0.85, z, 3, 2.6);
    for (const lane of otherLanes) {
      const kind: SeededObstacleKind =
        rng() < lerp(0.7, 0.4, diff) ? 'low_barrier' : 'tall_block';
      obstacles.push({ kind, lane, z });
    }
    nextZ = z - lerp(26, 22, diff);
  } else if (routeType === 'arch') {
    // Slideable high arch on primary lane OR open lane with high arches flanking
    const archOnOpenLane = rng() < 0.65;
    if (archOnOpenLane) {
      obstacles.push({ kind: 'high_arch', lane: openLane, z });
      pushCoinLine(coins, openLane, 0.72, z - 1.5, 3, 2.4);
      for (const lane of otherLanes) {
        obstacles.push({
          kind: rng() < 0.55 ? 'low_barrier' : 'tall_block',
          lane,
          z,
        });
      }
    } else {
      pushCoinLine(coins, openLane, 0.85, z, 3, 2.5);
      obstacles.push({ kind: 'high_arch', lane: otherLanes[0], z });
      obstacles.push({
        kind: rng() < 0.5 ? 'low_barrier' : 'tall_block',
        lane: otherLanes[1],
        z,
      });
    }
    nextZ = z - lerp(27, 22.5, diff);
  } else if (routeType === 'ramp_train') {
    // Ramp (z+5.2..z+10.0) leading onto static train roof (z-5.25..z+5.25)
    const trainLane = otherLanes[Math.floor(rng() * otherLanes.length)];
    const thirdLane = otherLanes.find((l) => l !== trainLane)!;

    obstacles.push({ kind: 'ramp', lane: trainLane, z: z + 7.65 });
    obstacles.push({ kind: 'train_static', lane: trainLane, z });
    pushCoinLine(coins, trainLane, 3.85, z + 2, 4, 2.4);

    // Keep openLane clear at ground level; thirdLane gets a jumpable or slideable obstacle
    if (rng() < 0.75) {
      obstacles.push({
        kind: rng() < 0.6 ? 'low_barrier' : 'high_arch',
        lane: thirdLane,
        z,
      });
    }
    if (rng() < 0.5) {
      pushCoinLine(coins, openLane, 0.85, z - 1, 2, 2.6);
    }
    // Train ends at z - 5.25; guarantee >= 21.5u clean exit space after train rear
    nextZ = z - 5.25 - lerp(25, 21.5, diff);
  } else if (routeType === 'moving_train') {
    // Moving train spawns ahead so it approaches the wave center fairly without overlapping nextZ
    const movingLane = otherLanes[Math.floor(rng() * otherLanes.length)];
    const thirdLane = otherLanes.find((l) => l !== movingLane)!;

    obstacles.push({ kind: 'train_moving', lane: movingLane, z: z - 12 });
    obstacles.push({
      kind: rng() < 0.65 ? 'high_arch' : 'low_barrier',
      lane: thirdLane,
      z,
    });
    pushCoinLine(coins, openLane, 0.85, z, 3, 2.5);

    // Moving train rear starts at z - 17.25 and moves toward +Z, leaving >= 10.7u clear even before a ramp wave
    nextZ = z - lerp(41, 38, diff);
  } else if (routeType === 'tunnel') {
    // Runnable tunnel on openLane (z-3.5..z+3.5) with side lanes blocked/varied
    obstacles.push({ kind: 'tunnel', lane: openLane, z });
    pushCoinLine(coins, openLane, 0.85, z + 1.5, 3, 2.4);
    for (const lane of otherLanes) {
      obstacles.push({
        kind: rng() < 0.7 ? 'tall_block' : 'train_static',
        lane,
        z,
      });
    }
    // Tunnel/train ends at z - 3.5..-5.25 -> ensure full clear exit reaction distance
    nextZ = z - 5.25 - lerp(24.5, 21, diff);
  } else {
    // Progressive combo: staggered low_barrier / high_arch / tall_block with clean open route
    pushCoinLine(coins, openLane, 0.85, z, 3, 2.5);
    obstacles.push({
      kind: rng() < 0.5 ? 'low_barrier' : 'high_arch',
      lane: otherLanes[0],
      z,
    });
    obstacles.push({
      kind: rng() < 0.6 ? 'tall_block' : 'low_barrier',
      lane: otherLanes[1],
      z: z - 6,
    });
    nextZ = z - 6 - lerp(24, 21, diff);
  }

  if (rng() < 0.28) {
    const chosen = POWERUP_TYPES[Math.floor(rng() * POWERUP_TYPES.length)];
    powerUps.push({
      type: chosen,
      lane: openLane,
      y: 1.15,
      z: z - 9.5,
    });
  }

  return {
    waveIndex,
    startZ: z,
    nextZ,
    openLane,
    obstacles,
    coins,
    powerUps,
  };
}

/**
 * Generates up to `count` waves deterministically from a seed starting at z = -26.
 * Used for tests and verification.
 */
export function generateTrackSequence(seed: number, waveCount: number): TrackWaveSpec[] {
  const rng = createSeededRng(seed);
  const waves: TrackWaveSpec[] = [];
  let z = -26;
  let prevOpenLane: number | undefined;
  for (let i = 0; i < waveCount; i++) {
    const w = generateTrackWave(rng, i, z, prevOpenLane);
    waves.push(w);
    z = w.nextZ;
    prevOpenLane = w.openLane;
  }
  return waves;
}

/**
 * Server-side authoritative verification that a reported coin pickup in X1 matches an actual
 * coin generated by `seed` around `coinZ` and `coinLane` (accounting for magnet pull distance).
 */
export function verifySeededCoinSpawn(
  seed: number,
  coinZ: number,
  coinLane: number
): boolean {
  if (!Number.isFinite(coinZ) || !Number.isInteger(coinLane) || coinLane < -1 || coinLane > 1) {
    return false;
  }
  // Runners start at z = 0 and advance along -Z, so coins have negative Z <= -10
  if (coinZ > -10 || coinZ < -25000) {
    return false;
  }

  const rng = createSeededRng(seed);
  let z = -26;
  let prevOpenLane: number | undefined;
  const maxWaves = 1200;

  for (let i = 0; i < maxWaves; i++) {
    const wave = generateTrackWave(rng, i, z, prevOpenLane);
    for (const c of wave.coins) {
      const dz = Math.abs(c.z - coinZ);
      const laneDiff = Math.abs(c.lane - coinLane);
      // Exact match or slight magnet displacement
      if (dz <= 8.5 && laneDiff <= 1) {
        return true;
      }
    }
    z = wave.nextZ;
    prevOpenLane = wave.openLane;
    if (z < coinZ - 35) {
      break;
    }
  }
  return false;
}
