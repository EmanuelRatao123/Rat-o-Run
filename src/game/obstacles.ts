import * as THREE from 'three';
import { MapId, POWERUPS, PowerUpType } from '../shared/constants.ts';

export type ObstacleKind =
  | 'low_barrier'
  | 'high_arch'
  | 'tall_block'
  | 'train_static'
  | 'train_moving'
  | 'ramp'
  | 'tunnel';

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  isRamp?: boolean;
  isTopWalkable?: boolean;
  rampStartZ?: number;
  rampEndZ?: number;
  rampMaxY?: number;
}

export interface ObstacleInstance {
  id: number;
  kind: ObstacleKind;
  mesh: THREE.Group;
  lane: number; // -1, 0, 1
  z: number;
  speedZ: number; // 0 for static, >0 for oncoming trains
  colliders: ObstacleBox[]; // local offsets relative to (laneX, 0, z)
  hitTriggered: boolean;
}

export interface CoinInstance {
  id: number;
  mesh: THREE.Mesh;
  lane: number;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

export interface PowerUpInstance {
  id: number;
  type: PowerUpType;
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

export const LANE_X = [-2.6, 0, 2.6] as const;

export class ObstacleAndItemFactory {
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  private coinGeo: THREE.CylinderGeometry;
  private coinMat: THREE.MeshStandardMaterial;

  constructor() {
    this.coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 12);
    this.coinGeo.rotateX(Math.PI / 2);
    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      metalness: 0.85,
      roughness: 0.18,
    });
  }

  private addBox(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
    roughness = 0.65,
    metalness = 0.1,
    emissive = 0x000000,
    emissiveIntensity = 0
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    this.geos.push(geo);
    this.mats.push(mat);
    return m;
  }

  public createObstacle(
    id: number,
    kind: ObstacleKind,
    lane: number,
    z: number,
    mapId: MapId
  ): ObstacleInstance {
    const group = new THREE.Group();
    const x = LANE_X[lane + 1];
    group.position.set(x, 0, z);

    const colliders: ObstacleBox[] = [];
    let speedZ = 0;

    if (kind === 'low_barrier') {
      if (mapId === 'futebol') {
        // Soccer training hurdle + soccer ball
        this.addBox(group, 2.0, 0.18, 0.18, 0, 0.95, 0, 0xfacc15, 0.4);
        this.addBox(group, 0.16, 1.0, 0.25, -0.9, 0.5, 0, 0xf8fafc, 0.5);
        this.addBox(group, 0.16, 1.0, 0.25, 0.9, 0.5, 0, 0xf8fafc, 0.5);
      } else if (mapId === 'capivara') {
        // Mossy fallen river log
        this.addBox(group, 2.1, 0.85, 0.85, 0, 0.43, 0, 0x78350f, 0.9);
        this.addBox(group, 0.9, 0.2, 0.9, -0.4, 0.9, 0, 0x65a30d, 0.85);
      } else if (mapId === 'tokyo') {
        // Neon cyber roadblock
        this.addBox(group, 2.1, 0.95, 0.65, 0, 0.48, 0, 0x1e293b, 0.4, 0.5);
        this.addBox(group, 1.9, 0.22, 0.7, 0, 0.75, 0, 0xec4899, 0.2, 0.1, 0xec4899, 1.2);
      } else {
        // Brasil striped street barrier
        this.addBox(group, 2.1, 0.95, 0.55, 0, 0.48, 0, 0xfacc15, 0.6);
        this.addBox(group, 0.5, 0.97, 0.58, -0.5, 0.48, 0, 0x0f172a, 0.6);
        this.addBox(group, 0.5, 0.97, 0.58, 0.5, 0.48, 0, 0x0f172a, 0.6);
      }
      colliders.push({ minX: -1.0, maxX: 1.0, minY: 0, maxY: 1.0, minZ: -0.45, maxZ: 0.45 });
    } else if (kind === 'high_arch') {
      // Must SLIDE under! Bottom gap 0..1.1, bar from 1.15..3.2
      const pillarColor = mapId === 'tokyo' ? 0x0f172a : mapId === 'capivara' ? 0x78350f : 0xe2e8f0;
      const topColor =
        mapId === 'tokyo'
          ? 0x06b6d4
          : mapId === 'brasil'
          ? 0x16a34a
          : mapId === 'futebol'
          ? 0xef4444
          : 0x65a30d;
      this.addBox(group, 0.26, 2.9, 0.35, -1.05, 1.45, 0, pillarColor, 0.5);
      this.addBox(group, 0.26, 2.9, 0.35, 1.05, 1.45, 0, pillarColor, 0.5);
      this.addBox(
        group,
        2.35,
        1.5,
        0.55,
        0,
        2.15,
        0,
        topColor,
        0.4,
        0.2,
        mapId === 'tokyo' ? 0x06b6d4 : 0x000000,
        mapId === 'tokyo' ? 0.9 : 0
      );
      colliders.push({ minX: -1.05, maxX: 1.05, minY: 1.28, maxY: 3.1, minZ: -0.4, maxZ: 0.4 });
    } else if (kind === 'tall_block') {
      if (mapId === 'futebol') {
        // Giant stacked soccer balls / goal wall
        this.addBox(group, 2.0, 2.8, 1.4, 0, 1.4, 0, 0xf8fafc, 0.5);
        this.addBox(group, 1.4, 1.4, 1.45, 0, 1.4, 0, 0x0f172a, 0.4);
      } else if (mapId === 'capivara') {
        // Giant moss boulder stack
        this.addBox(group, 2.0, 2.7, 1.7, 0, 1.35, 0, 0x64748b, 0.92);
        this.addBox(group, 1.6, 0.5, 1.4, 0, 2.8, 0, 0x4d7c0f, 0.88);
      } else if (mapId === 'tokyo') {
        // Neon vending machine bank
        this.addBox(group, 2.0, 2.9, 1.4, 0, 1.45, 0, 0xbe123c, 0.3, 0.4);
        this.addBox(group, 1.5, 1.4, 1.44, 0, 1.7, 0, 0x38bdf8, 0.2, 0.1, 0x38bdf8, 0.9);
      } else {
        // Brasil colorful cargo crate stack
        this.addBox(group, 2.0, 1.4, 1.4, 0, 0.7, 0, 0xf97316, 0.75);
        this.addBox(group, 1.85, 1.4, 1.3, 0, 2.1, 0, 0x0284c7, 0.7);
      }
      colliders.push({ minX: -0.95, maxX: 0.95, minY: 0, maxY: 2.85, minZ: -0.75, maxZ: 0.75 });
    } else if (kind === 'tunnel') {
      // Overhead voxel tunnel spanning lane (can run through safely or jump onto roof)
      const bodyCol = mapId === 'tokyo' ? 0x312e81 : mapId === 'capivara' ? 0x3f6212 : 0x334155;
      this.addBox(group, 0.3, 3.1, 7.0, -1.05, 1.55, 0, bodyCol, 0.7);
      this.addBox(group, 0.3, 3.1, 7.0, 1.05, 1.55, 0, bodyCol, 0.7);
      this.addBox(group, 2.4, 0.7, 7.0, 0, 2.9, 0, 0xfacc15, 0.5);
      // Roof collider walkable at y=3.25; side walls block lane changes inside
      colliders.push({ minX: -1.1, maxX: -0.82, minY: 0, maxY: 3.1, minZ: -3.5, maxZ: 3.5 });
      colliders.push({ minX: 0.82, maxX: 1.1, minY: 0, maxY: 3.1, minZ: -3.5, maxZ: 3.5 });
      colliders.push({
        minX: -1.05,
        maxX: 1.05,
        minY: 2.5,
        maxY: 3.25,
        minZ: -3.5,
        maxZ: 3.5,
        isTopWalkable: true,
      });
    } else if (kind === 'ramp') {
      // Sloped ramp leading up to y = 2.95 (train height)
      const steps = 6;
      const rampLen = 4.8;
      for (let i = 0; i < steps; i++) {
        const h = ((i + 1) / steps) * 2.95;
        const stepZ = (rampLen / 2) - (i + 0.5) * (rampLen / steps);
        this.addBox(group, 2.1, h, rampLen / steps + 0.05, 0, h / 2, stepZ, 0xf97316, 0.5);
      }
      colliders.push({
        minX: -1.05,
        maxX: 1.05,
        minY: 0,
        maxY: 2.95,
        minZ: -rampLen / 2,
        maxZ: rampLen / 2,
        isRamp: true,
        rampStartZ: rampLen / 2,
        rampEndZ: -rampLen / 2,
        rampMaxY: 2.95,
      });
    } else {
      // Train (static or moving) — Climbable roof at y = 2.95!
      speedZ = kind === 'train_moving' ? 14 : 0;
      const trainLen = 10.5;
      const bodyColor =
        mapId === 'tokyo'
          ? 0xe2e8f0
          : mapId === 'brasil'
          ? 0x0284c7
          : mapId === 'futebol'
          ? 0x16a34a
          : 0x92400e;
      const stripeColor =
        mapId === 'tokyo' ? 0xec4899 : mapId === 'brasil' ? 0xfacc15 : 0xf8fafc;

      this.addBox(group, 2.15, 2.7, trainLen, 0, 1.5, 0, bodyColor, 0.35, 0.45);
      this.addBox(group, 2.22, 0.35, trainLen + 0.05, 0, 1.25, 0, stripeColor, 0.3);
      // Roof
      this.addBox(group, 2.0, 0.25, trainLen - 0.2, 0, 2.92, 0, 0x94a3b8, 0.4, 0.5);
      // Front Windshield & Headlights
      this.addBox(group, 1.75, 0.9, 0.12, 0, 2.05, trainLen / 2 + 0.02, 0x0f172a, 0.15, 0.3);
      this.addBox(group, 0.35, 0.25, 0.14, -0.65, 0.9, trainLen / 2 + 0.02, 0xfef08a, 0.2, 0, 0xfacc15, 1.6);
      this.addBox(group, 0.35, 0.25, 0.14, 0.65, 0.9, trainLen / 2 + 0.02, 0xfef08a, 0.2, 0, 0xfacc15, 1.6);

      colliders.push({
        minX: -1.05,
        maxX: 1.05,
        minY: 0,
        maxY: 2.95,
        minZ: -trainLen / 2,
        maxZ: trainLen / 2,
        isTopWalkable: true,
      });
    }

    return {
      id,
      kind,
      mesh: group,
      lane,
      z,
      speedZ,
      colliders,
      hitTriggered: false,
    };
  }

  public createCoin(id: number, lane: number, y: number, z: number): CoinInstance {
    const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
    const x = LANE_X[lane + 1];
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    return {
      id,
      mesh,
      lane,
      x,
      y,
      z,
      collected: false,
    };
  }

  public createPowerUp(id: number, type: PowerUpType, lane: number, y: number, z: number): PowerUpInstance {
    const group = new THREE.Group();
    const x = LANE_X[lane + 1];
    group.position.set(x, y, z);
    const info = POWERUPS[type];
    const colorNum = parseInt(info.color.replace('#', ''), 16);

    // Outer glowing voxel cube frame + inner emblem
    this.addBox(group, 0.85, 0.85, 0.85, 0, 0, 0, colorNum, 0.25, 0.4, colorNum, 0.85);
    this.addBox(group, 1.0, 0.18, 1.0, 0, 0, 0, 0xf8fafc, 0.2, 0.6, 0xffffff, 0.5);
    this.addBox(group, 0.22, 1.05, 0.22, 0, 0, 0, 0xfacc15, 0.2, 0.7, 0xfacc15, 0.6);

    return {
      id,
      type,
      mesh: group,
      x,
      y,
      z,
      collected: false,
    };
  }

  public dispose(): void {
    this.coinGeo.dispose();
    this.coinMat.dispose();
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}
