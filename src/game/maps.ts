import * as THREE from 'three';
import { GraphicsQuality, MapId } from '../shared/constants.ts';
import {
  createCopacabanaTexture,
  createForestTrailTexture,
  createNeonRoadTexture,
  createTrackRoadTexture,
  createTurfTexture,
  createVoxelCheckerTexture,
} from './materials.ts';

export interface MapThemeConfig {
  id: MapId;
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  keyLightColor: number;
  keyLightIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
}

export const MAP_THEMES: Record<MapId, MapThemeConfig> = {
  brasil: {
    id: 'brasil',
    skyColor: 0x38bdf8,
    fogColor: 0x7dd3fc,
    fogDensity: 0.0105,
    keyLightColor: 0xfff5d6,
    keyLightIntensity: 1.55,
    hemiSkyColor: 0xbae6fd,
    hemiGroundColor: 0xd97706,
    hemiIntensity: 0.75,
  },
  tokyo: {
    id: 'tokyo',
    skyColor: 0x110c2e,
    fogColor: 0x1b1444,
    fogDensity: 0.0125,
    keyLightColor: 0xc4b5fd,
    keyLightIntensity: 1.2,
    hemiSkyColor: 0x6366f1,
    hemiGroundColor: 0xec4899,
    hemiIntensity: 0.85,
  },
  futebol: {
    id: 'futebol',
    skyColor: 0x0284c7,
    fogColor: 0x38bdf8,
    fogDensity: 0.0095,
    keyLightColor: 0xffffff,
    keyLightIntensity: 1.65,
    hemiSkyColor: 0xe0f2fe,
    hemiGroundColor: 0x15803d,
    hemiIntensity: 0.8,
  },
  capivara: {
    id: 'capivara',
    skyColor: 0x6ee7b7,
    fogColor: 0xa7f3d0,
    fogDensity: 0.0105,
    keyLightColor: 0xfef3c7,
    keyLightIntensity: 1.45,
    hemiSkyColor: 0xd1fae5,
    hemiGroundColor: 0x3f6212,
    hemiIntensity: 0.82,
  },
};

export interface SceneryChunk {
  group: THREE.Group;
  zStart: number;
  animatedParts: { obj: THREE.Object3D; phase: number; type: 'bob' | 'sway' | 'water' }[];
}

export class MapSceneryBuilder {
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private mapId: MapId;
  private quality: GraphicsQuality;

  private trackMat!: THREE.MeshStandardMaterial;
  private sideMat!: THREE.MeshStandardMaterial;
  private outerGroundMat!: THREE.MeshStandardMaterial;

  constructor(mapId: MapId, quality: GraphicsQuality, maxAnisotropy: number) {
    this.mapId = mapId;
    this.quality = quality;
    this.initSharedMaterials(maxAnisotropy);
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  private trackMatFn<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  private trackTex<T extends THREE.Texture>(t: T): T {
    this.textures.push(t);
    return t;
  }

  private initSharedMaterials(maxAnisotropy: number): void {
    if (this.mapId === 'brasil') {
      const roadTex = this.trackTex(
        createTrackRoadTexture('#334155', '#facc15', '#f8fafc', maxAnisotropy)
      );
      const copaTex = this.trackTex(createCopacabanaTexture(maxAnisotropy));
      this.trackMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, metalness: 0.05 })
      );
      this.sideMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ map: copaTex, roughness: 0.78, metalness: 0.04 })
      );
      this.outerGroundMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9 })
      );
    } else if (this.mapId === 'tokyo') {
      const roadTex = this.trackTex(createNeonRoadTexture(maxAnisotropy));
      const sideTex = this.trackTex(
        createVoxelCheckerTexture('#1e293b', '#0f172a', 8, 2, 6, maxAnisotropy)
      );
      this.trackMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.45, metalness: 0.25 })
      );
      this.sideMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.55, metalness: 0.2 })
      );
      this.outerGroundMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ color: 0x090d1e, roughness: 0.7 })
      );
    } else if (this.mapId === 'futebol') {
      const turfTex = this.trackTex(createTurfTexture(maxAnisotropy));
      const trackTex = this.trackTex(
        createVoxelCheckerTexture('#b91c1c', '#991b1b', 4, 2, 6, maxAnisotropy)
      );
      this.trackMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ map: turfTex, roughness: 0.85 })
      );
      this.sideMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.8 })
      );
      this.outerGroundMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
      );
    } else {
      const trailTex = this.trackTex(createForestTrailTexture(maxAnisotropy));
      this.trackMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ map: trailTex, roughness: 0.9 })
      );
      this.sideMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.88 })
      );
      this.outerGroundMat = this.trackMatFn(
        new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.35 })
      );
    }
  }

  private box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
    opts?: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number; castShadow?: boolean }
  ): THREE.Mesh {
    const geo = this.trackGeo(new THREE.BoxGeometry(w, h, d));
    const mat = this.trackMatFn(
      new THREE.MeshStandardMaterial({
        color,
        roughness: opts?.roughness ?? 0.72,
        metalness: opts?.metalness ?? 0.05,
        emissive: opts?.emissive ?? 0x000000,
        emissiveIntensity: opts?.emissiveIntensity ?? 0,
      })
    );
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = opts?.castShadow ?? false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  public createChunk(chunkIndex: number, chunkLength: number): SceneryChunk {
    const group = new THREE.Group();
    const animatedParts: SceneryChunk['animatedParts'] = [];

    // Main 3-lane track floor (width 8.8)
    const roadGeo = this.trackGeo(new THREE.BoxGeometry(8.8, 0.4, chunkLength));
    const roadMesh = new THREE.Mesh(roadGeo, this.trackMat);
    roadMesh.position.set(0, -0.2, 0);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    // Sidewalks / banks
    const sideGeo = this.trackGeo(new THREE.BoxGeometry(6.5, 0.52, chunkLength));
    const leftSide = new THREE.Mesh(sideGeo, this.sideMat);
    leftSide.position.set(-7.65, -0.2, 0);
    leftSide.receiveShadow = true;
    group.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeo, this.sideMat);
    rightSide.position.set(7.65, -0.2, 0);
    rightSide.receiveShadow = true;
    group.add(rightSide);

    // Extended outer terrain so there is never an indoor void
    const outerGeo = this.trackGeo(new THREE.PlaneGeometry(90, chunkLength));
    const outerLeft = new THREE.Mesh(outerGeo, this.outerGroundMat);
    outerLeft.rotation.x = -Math.PI / 2;
    outerLeft.position.set(-55, -0.35, 0);
    group.add(outerLeft);

    const outerRight = new THREE.Mesh(outerGeo, this.outerGroundMat);
    outerRight.rotation.x = -Math.PI / 2;
    outerRight.position.set(55, -0.35, 0);
    group.add(outerRight);

    if (this.mapId === 'brasil') {
      this.populateBrasilChunk(group, chunkIndex, chunkLength, animatedParts);
    } else if (this.mapId === 'tokyo') {
      this.populateTokyoChunk(group, chunkIndex, chunkLength, animatedParts);
    } else if (this.mapId === 'futebol') {
      this.populateFutebolChunk(group, chunkIndex, chunkLength, animatedParts);
    } else {
      this.populateCapivaraChunk(group, chunkIndex, chunkLength, animatedParts);
    }

    return {
      group,
      zStart: -chunkIndex * chunkLength,
      animatedParts,
    };
  }

  private populateBrasilChunk(
    group: THREE.Group,
    idx: number,
    len: number,
    animated: SceneryChunk['animatedParts']
  ): void {
    const houseColors = [0xfb7185, 0xfacc15, 0x38bdf8, 0x4ade80, 0xf97316];
    const step = this.quality === 'low' ? 12 : 8;

    for (let z = -len / 2 + 4; z < len / 2; z += step) {
      const seed = Math.abs(idx * 17 + Math.round(z));
      [-1, 1].forEach((side) => {
        const xBase = side * 8.6;
        // Palm Tree
        const treeGroup = new THREE.Group();
        treeGroup.position.set(side * 5.6, 0, z - 2);
        this.box(treeGroup, 0.45, 2.2, 0.45, 0, 1.1, 0, 0x92400e);
        this.box(treeGroup, 0.4, 2.0, 0.4, side * 0.15, 3.0, 0, 0x78350f, { castShadow: true });
        this.box(treeGroup, 0.35, 1.6, 0.35, side * 0.28, 4.4, 0, 0x92400e);
        // Palm crown fronds
        const crown = new THREE.Group();
        crown.position.set(side * 0.32, 5.2, 0);
        this.box(crown, 2.6, 0.25, 0.7, 0, 0, 0, 0x16a34a);
        this.box(crown, 0.7, 0.25, 2.6, 0, 0, 0, 0x22c55e);
        this.box(crown, 1.8, 0.22, 0.6, 0, -0.25, 0, 0x15803d);
        this.box(crown, 0.35, 0.35, 0.35, -0.25, -0.35, 0.25, 0x713f12); // Coconut
        treeGroup.add(crown);
        animated.push({ obj: crown, phase: seed, type: 'sway' });
        group.add(treeGroup);

        // Colorful Brazilian house / building
        const hColor = houseColors[(seed + (side > 0 ? 1 : 3)) % houseColors.length];
        const hHeight = 4 + ((seed + side) % 4) * 1.4;
        this.box(group, 4.4, hHeight, 5.6, xBase, hHeight / 2, z, hColor, { roughness: 0.8, castShadow: true });
        // Terracotta roof
        this.box(group, 4.8, 0.55, 6.0, xBase, hHeight + 0.25, z, 0xc2410c, { roughness: 0.75 });
        // Windows
        this.box(group, 0.2, 1.0, 0.9, xBase - side * 2.15, 2.0, z - 1.2, 0xfef9c3, { emissive: 0xfde047, emissiveIntensity: 0.25 });
        this.box(group, 0.2, 1.0, 0.9, xBase - side * 2.15, 2.0, z + 1.2, 0xfef9c3, { emissive: 0xfde047, emissiveIntensity: 0.25 });

        // Brazilian Flag on pole every 2nd block
        if ((seed % 2) === 0) {
          const poleX = side * 5.0;
          this.box(group, 0.12, 3.6, 0.12, poleX, 1.8, z + 2.2, 0xe2e8f0, { metalness: 0.6, roughness: 0.3 });
          const flag = new THREE.Group();
          flag.position.set(poleX, 3.25, z + 2.2);
          this.box(flag, 0.08, 0.85, 1.3, 0, 0, 0.65, 0x16a34a);
          this.box(flag, 0.1, 0.55, 0.85, 0, 0, 0.65, 0xfacc15);
          this.box(flag, 0.12, 0.32, 0.32, 0, 0, 0.65, 0x1d4ed8);
          animated.push({ obj: flag, phase: seed * 0.7, type: 'sway' });
          group.add(flag);
        }
      });
    }
  }

  private populateTokyoChunk(
    group: THREE.Group,
    idx: number,
    len: number,
    animated: SceneryChunk['animatedParts']
  ): void {
    const neonColors = [0xec4899, 0x06b6d4, 0xa855f7, 0xfacc15, 0x22c55e];
    const step = this.quality === 'low' ? 12 : 8;

    for (let z = -len / 2 + 4; z < len / 2; z += step) {
      const seed = Math.abs(idx * 23 + Math.round(z));
      [-1, 1].forEach((side) => {
        const bHeight = 8 + ((seed + side) % 5) * 2.8;
        const xBase = side * 8.9;
        // Dark skyscraper body
        this.box(group, 5.0, bHeight, 6.2, xBase, bHeight / 2, z, 0x1e293b, {
          roughness: 0.4,
          metalness: 0.45,
        });
        // Glowing neon vertical sign facing street
        const nCol = neonColors[(seed + (side > 0 ? 2 : 0)) % neonColors.length];
        this.box(group, 0.35, 3.6, 1.2, side * 6.2, 4.2, z - 1.2, nCol, {
          emissive: nCol,
          emissiveIntensity: 1.6,
          roughness: 0.2,
        });
        // Lit window grid stripes
        for (let wy = 2.0; wy < bHeight - 1.2; wy += 1.6) {
          this.box(group, 0.15, 0.55, 3.8, side * 6.36, wy, z, 0x38bdf8, {
            emissive: 0x38bdf8,
            emissiveIntensity: 0.7,
          });
        }
        // Traditional glowing paper lantern (Chochin)
        const lantern = new THREE.Group();
        lantern.position.set(side * 5.2, 3.1, z + 2.0);
        this.box(group, 0.45, 0.65, 0.45, 0, 0, 0, 0xef4444, {
          emissive: 0xf97316,
          emissiveIntensity: 1.35,
          roughness: 0.4,
        });
        this.box(group, 0.35, 0.1, 0.35, 0, 0.36, 0, 0x0f172a);
        this.box(group, 0.35, 0.1, 0.35, 0, -0.36, 0, 0x0f172a);
        animated.push({ obj: lantern, phase: seed, type: 'sway' });
        group.add(lantern);
      });
    }
  }

  private populateFutebolChunk(
    group: THREE.Group,
    idx: number,
    len: number,
    animated: SceneryChunk['animatedParts']
  ): void {
    const fanColors = [0xef4444, 0xfacc15, 0x3b82f6, 0x22c55e, 0xffffff];

    // Tiered Stadium Grandstands on both sides
    [-1, 1].forEach((side) => {
      for (let tier = 0; tier < 4; tier++) {
        this.box(
          group,
          2.2,
          1.4,
          len,
          side * (6.8 + tier * 1.9),
          0.7 + tier * 1.3,
          0,
          tier % 2 === 0 ? 0x334155 : 0x475569,
          { roughness: 0.8 }
        );

        // Cheering Voxel Fans along tiers
        const fanStep = this.quality === 'low' ? 6 : 3.5;
        for (let z = -len / 2 + 2; z < len / 2; z += fanStep) {
          const fCol = fanColors[Math.abs(idx + Math.round(z) + tier) % fanColors.length];
          const fan = this.box(
            group,
            0.55,
            0.85,
            0.55,
            side * (6.7 + tier * 1.9),
            1.85 + tier * 1.3,
            z,
            fCol,
            { roughness: 0.6 }
          );
          animated.push({ obj: fan, phase: z + tier * 1.3 + side, type: 'bob' });
        }
      }

      // Advertising boards along pitch
      this.box(group, 0.4, 0.9, len, side * 4.8, 0.45, 0, 0x0f172a, { roughness: 0.4 });
      this.box(group, 0.45, 0.55, len - 1, side * 4.82, 0.48, 0, 0x10b981, {
        emissive: 0x059669,
        emissiveIntensity: 0.5,
      });
    });

    // Stadium Floodlight Towers & Jumbotron Arch once per chunk
    if (idx % 2 === 0) {
      [-1, 1].forEach((side) => {
        this.box(group, 0.9, 13, 0.9, side * 14.5, 6.5, 0, 0x94a3b8, { metalness: 0.7, roughness: 0.3 });
        this.box(group, 3.0, 2.0, 1.2, side * 13.8, 13.2, 0, 0xf8fafc, {
          emissive: 0xfef9c3,
          emissiveIntensity: 1.5,
        });
      });

      // Overhead Stadium Jumbotron Screen
      this.box(group, 11.5, 2.2, 1.0, 0, 9.5, 0, 0x0f172a);
      this.box(group, 9.5, 1.5, 1.08, 0, 9.5, 0, 0x22c55e, {
        emissive: 0x16a34a,
        emissiveIntensity: 0.9,
      });
    }
  }

  private populateCapivaraChunk(
    group: THREE.Group,
    idx: number,
    len: number,
    animated: SceneryChunk['animatedParts']
  ): void {
    // Wooden Bridge Plank deck every 2nd chunk
    if (idx % 2 === 1) {
      this.box(group, 9.2, 0.25, len * 0.55, 0, 0.08, 0, 0x92400e, { roughness: 0.85 });
      [-1, 1].forEach((side) => {
        this.box(group, 0.28, 1.05, len * 0.55, side * 4.45, 0.65, 0, 0x78350f);
      });
    }

    const step = this.quality === 'low' ? 10 : 7;
    for (let z = -len / 2 + 3; z < len / 2; z += step) {
      const seed = Math.abs(idx * 19 + Math.round(z));
      [-1, 1].forEach((side) => {
        // Dense Jungle Trees
        const treeX = side * (6.2 + (seed % 3) * 1.4);
        const trunkH = 2.4 + (seed % 3) * 0.7;
        this.box(group, 0.75, trunkH, 0.75, treeX, trunkH / 2, z, 0x78350f, { castShadow: true });
        this.box(group, 2.6, 1.8, 2.6, treeX, trunkH + 0.9, z, 0x15803d, { roughness: 0.85, castShadow: true });
        this.box(group, 1.8, 1.3, 1.8, treeX, trunkH + 2.2, z, 0x22c55e, { roughness: 0.85 });

        // Boulders
        if (seed % 2 === 0) {
          this.box(group, 1.3, 0.9, 1.1, side * 5.2, 0.45, z + 2.2, 0x64748b, { roughness: 0.9 });
        }

        // Cute Voxel Capybaras lounging along the riverbank!
        if ((seed + side) % 3 === 0) {
          const capy = new THREE.Group();
          capy.position.set(side * 5.4, 0.2, z - 1.5);
          capy.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          this.box(capy, 0.95, 0.62, 1.45, 0, 0.4, 0, 0x92400e, { roughness: 0.85 }); // Body
          this.box(capy, 0.65, 0.5, 0.68, 0, 0.62, 0.78, 0xa16207, { roughness: 0.82 }); // Head
          this.box(capy, 0.22, 0.2, 0.22, 0, 0.95, 0.78, 0xf97316); // Orange on head!
          this.box(capy, 0.2, 0.28, 0.2, -0.32, 0.14, 0.45, 0x78350f);
          this.box(capy, 0.2, 0.28, 0.2, 0.32, 0.14, 0.45, 0x78350f);
          animated.push({ obj: capy, phase: seed, type: 'bob' });
          group.add(capy);
        }
      });
    }
  }

  public dispose(): void {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
  }
}
