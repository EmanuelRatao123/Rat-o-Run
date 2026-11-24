import * as THREE from 'three';
import {
  CustomCharacterConfig,
  DEFAULT_CUSTOM_CHARACTER_CONFIG,
  PaintRegion,
  PlayerCapeConfig,
  SkateId,
  SkinId,
  getSkateDefinition,
} from '../shared/constants.ts';
import { createRadialShadowTexture } from './materials.ts';

export type CharacterAnimState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'slide'
  | 'stumble'
  | 'crash'
  | 'jetpack'
  | 'victory';

export interface FollowerMouseRig {
  group: THREE.Group;
  body: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  baseX: number;
  baseZ: number;
  phase: number;
}

export interface AuraParticleRig {
  mesh: THREE.Mesh;
  radius: number;
  heightOffset: number;
  speed: number;
  angle: number;
}

export interface CustomMeshRefs {
  regionOverlays: Partial<Record<PaintRegion, THREE.Mesh[]>>;
  regionTextures: Partial<Record<PaintRegion, THREE.Texture>>;
}

export interface CharacterRig {
  skinId: SkinId | 'police';
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torsoPivot: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  tailPivot?: THREE.Group;
  capePivot?: THREE.Group;
  customCapePivot?: THREE.Group;
  customCapeMesh?: THREE.Mesh;
  customCapeTex?: THREE.CanvasTexture;
  customCapeKey?: string;
  customSkateGroup?: THREE.Group;
  customSkateId?: SkateId | null;
  customSkateDispose?: () => void;
  followerMice?: FollowerMouseRig[];
  auraParticles?: AuraParticleRig[];
  blinkLids?: THREE.Mesh[];
  speedTrailParticles?: {
    mesh: THREE.Mesh;
    baseX: number;
    baseY: number;
    baseZ: number;
    phase: number;
  }[];
  eyeAuraParticles?: {
    mesh: THREE.Mesh;
    baseX: number;
    baseY: number;
    baseZ: number;
    phase: number;
  }[];
  customMeshRefs?: CustomMeshRefs;
  spawnTimer: number;
  hoverboardGroup: THREE.Group;
  jetpackGroup: THREE.Group;
  magnetAura: THREE.Mesh;
  shieldRing: THREE.Mesh;
  contactShadow: THREE.Mesh;
  policeBeaconRed?: THREE.Mesh;
  policeBeaconBlue?: THREE.Mesh;
  flashMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

const _sharedShadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
let _sharedShadowTex: THREE.CanvasTexture | null = null;

function getShadowTexture(): THREE.CanvasTexture {
  if (!_sharedShadowTex) {
    _sharedShadowTex = createRadialShadowTexture();
  }
  return _sharedShadowTex;
}

interface BoxSpec {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

function addVoxel(
  parent: THREE.Object3D,
  spec: BoxSpec,
  trackGeos: THREE.BufferGeometry[],
  trackMats: THREE.Material[],
  flashMats: THREE.MeshStandardMaterial[]
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
  const mat = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness ?? 0.68,
    metalness: spec.metalness ?? 0.05,
    emissive: spec.emissive ?? 0x000000,
    emissiveIntensity: spec.emissiveIntensity ?? 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(spec.x, spec.y, spec.z);
  if (spec.rx) mesh.rotation.x = spec.rx;
  if (spec.ry) mesh.rotation.y = spec.ry;
  if (spec.rz) mesh.rotation.z = spec.rz;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  trackGeos.push(geo);
  trackMats.push(mat);
  flashMats.push(mat);
  return mesh;
}

function buildCharacterBase(
  skin: SkinId | 'police',
  castShadow = true,
  customConfig?: CustomCharacterConfig
): CharacterRig {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const textureLoader = new THREE.TextureLoader();

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.72, 0);
  bodyPivot.add(torsoPivot);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.62, 0);
  torsoPivot.add(headPivot);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.37, 0.54, 0);
  torsoPivot.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.37, 0.54, 0);
  torsoPivot.add(rightArmPivot);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.14, 0.66, 0);
  bodyPivot.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.14, 0.66, 0);
  bodyPivot.add(rightLegPivot);

  let tailPivot: THREE.Group | undefined;
  let capePivot: THREE.Group | undefined;
  let followerMice: FollowerMouseRig[] | undefined;
  let auraParticles: AuraParticleRig[] | undefined;
  let policeBeaconRed: THREE.Mesh | undefined;
  let policeBeaconBlue: THREE.Mesh | undefined;
  let customMeshRefs: CustomMeshRefs | undefined;
  let blinkLids: THREE.Mesh[] | undefined;
  let speedTrailParticles:
    | { mesh: THREE.Mesh; baseX: number; baseY: number; baseZ: number; phase: number }[]
    | undefined;
  let eyeAuraParticles:
    | { mesh: THREE.Mesh; baseX: number; baseY: number; baseZ: number; phase: number }[]
    | undefined;

  const v = (p: THREE.Object3D, s: BoxSpec) => {
    const m = addVoxel(p, s, geos, mats, flashMaterials);
    m.castShadow = castShadow;
    return m;
  };

  const addCyl = (
    p: THREE.Object3D,
    s: {
      rt: number;
      rb: number;
      h: number;
      seg?: number;
      x: number;
      y: number;
      z: number;
      color: number;
      roughness?: number;
      metalness?: number;
      emissive?: number;
      emissiveIntensity?: number;
      rx?: number;
      ry?: number;
      rz?: number;
    }
  ) => {
    const geo = new THREE.CylinderGeometry(s.rt, s.rb, s.h, s.seg ?? 12);
    const mat = new THREE.MeshStandardMaterial({
      color: s.color,
      roughness: s.roughness ?? 0.68,
      metalness: s.metalness ?? 0.05,
      emissive: s.emissive ?? 0x000000,
      emissiveIntensity: s.emissiveIntensity ?? 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, s.y, s.z);
    if (s.rx) mesh.rotation.x = s.rx;
    if (s.ry) mesh.rotation.y = s.ry;
    if (s.rz) mesh.rotation.z = s.rz;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    p.add(mesh);
    geos.push(geo);
    mats.push(mat);
    flashMaterials.push(mat);
    return mesh;
  };

  // Helper for standard blocky eyes
  const addEyes = (y = 0.25, z = 0.26, eyeColor = 0x0f172a, sclera = 0xffffff) => {
    v(headPivot, { w: 0.11, h: 0.11, d: 0.04, x: -0.12, y, z, color: sclera, roughness: 0.3 });
    v(headPivot, { w: 0.11, h: 0.11, d: 0.04, x: 0.12, y, z, color: sclera, roughness: 0.3 });
    v(headPivot, { w: 0.06, h: 0.07, d: 0.05, x: -0.11, y, z: z + 0.01, color: eyeColor, roughness: 0.15 });
    v(headPivot, { w: 0.06, h: 0.07, d: 0.05, x: 0.11, y, z: z + 0.01, color: eyeColor, roughness: 0.15 });
  };

  // Standard limb builder
  const buildLimbs = (
    skinTone: number,
    sleeveColor: number,
    pantsColor: number,
    shoeColor: number,
    shoeTrim: number,
    armRough = 0.65
  ) => {
    // Left arm
    v(leftArmPivot, { w: 0.18, h: 0.26, d: 0.18, x: 0, y: -0.1, z: 0, color: sleeveColor, roughness: armRough });
    v(leftArmPivot, { w: 0.16, h: 0.24, d: 0.16, x: 0, y: -0.34, z: 0, color: skinTone, roughness: 0.72 });
    // Right arm
    v(rightArmPivot, { w: 0.18, h: 0.26, d: 0.18, x: 0, y: -0.1, z: 0, color: sleeveColor, roughness: armRough });
    v(rightArmPivot, { w: 0.16, h: 0.24, d: 0.16, x: 0, y: -0.34, z: 0, color: skinTone, roughness: 0.72 });
    // Left leg
    v(leftLegPivot, { w: 0.2, h: 0.36, d: 0.2, x: 0, y: -0.22, z: 0, color: pantsColor, roughness: 0.75 });
    v(leftLegPivot, { w: 0.22, h: 0.16, d: 0.3, x: 0, y: -0.54, z: 0.04, color: shoeColor, roughness: 0.45 });
    v(leftLegPivot, { w: 0.23, h: 0.05, d: 0.31, x: 0, y: -0.63, z: 0.04, color: shoeTrim, roughness: 0.35 });
    // Right leg
    v(rightLegPivot, { w: 0.2, h: 0.36, d: 0.2, x: 0, y: -0.22, z: 0, color: pantsColor, roughness: 0.75 });
    v(rightLegPivot, { w: 0.22, h: 0.16, d: 0.3, x: 0, y: -0.54, z: 0.04, color: shoeColor, roughness: 0.45 });
    v(rightLegPivot, { w: 0.23, h: 0.05, d: 0.31, x: 0, y: -0.63, z: 0.04, color: shoeTrim, roughness: 0.35 });
  };

  if (skin === 'ratao') {
    // Ratão: Streetwear urban voxel rat
    v(torsoPivot, { w: 0.54, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xe11d48, roughness: 0.78 }); // Red street hoodie
    v(torsoPivot, { w: 0.38, h: 0.18, d: 0.35, x: 0, y: 0.14, z: 0.02, color: 0x9f1239, roughness: 0.8 }); // Kangaroo pocket
    v(torsoPivot, { w: 0.56, h: 0.12, d: 0.34, x: 0, y: 0.56, z: -0.02, color: 0xbe123c, roughness: 0.8 }); // Hood collar
    // Head
    v(headPivot, { w: 0.5, h: 0.44, d: 0.5, x: 0, y: 0.24, z: 0, color: 0x94a3b8, roughness: 0.65 });
    v(headPivot, { w: 0.3, h: 0.2, d: 0.26, x: 0, y: 0.16, z: 0.32, color: 0xcbd5e1, roughness: 0.6 }); // Snout
    v(headPivot, { w: 0.12, h: 0.09, d: 0.08, x: 0, y: 0.22, z: 0.46, color: 0xf472b6, roughness: 0.35 }); // Pink nose
    // Teeth
    v(headPivot, { w: 0.1, h: 0.07, d: 0.04, x: 0, y: 0.06, z: 0.42, color: 0xffffff, roughness: 0.2 });
    // Big round ears
    v(headPivot, { w: 0.22, h: 0.24, d: 0.08, x: -0.26, y: 0.48, z: -0.04, color: 0x64748b, roughness: 0.7 });
    v(headPivot, { w: 0.14, h: 0.16, d: 0.09, x: -0.26, y: 0.48, z: -0.02, color: 0xf9a8d4, roughness: 0.5 });
    v(headPivot, { w: 0.22, h: 0.24, d: 0.08, x: 0.26, y: 0.48, z: -0.04, color: 0x64748b, roughness: 0.7 });
    v(headPivot, { w: 0.14, h: 0.16, d: 0.09, x: 0.26, y: 0.48, z: -0.02, color: 0xf9a8d4, roughness: 0.5 });
    // Whiskers
    v(headPivot, { w: 0.18, h: 0.02, d: 0.02, x: -0.22, y: 0.16, z: 0.38, color: 0x1e293b, rz: 0.12 });
    v(headPivot, { w: 0.18, h: 0.02, d: 0.02, x: 0.22, y: 0.16, z: 0.38, color: 0x1e293b, rz: -0.12 });
    addEyes(0.3, 0.26, 0xf59e0b);
    buildLimbs(0x94a3b8, 0xe11d48, 0x1e293b, 0xf43f5e, 0xffffff);
    // Tail
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.1, -0.18);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.08, h: 0.08, d: 0.34, x: 0, y: -0.02, z: -0.16, color: 0xf472b6, roughness: 0.5, rx: -0.2 });
    v(tailPivot, { w: 0.06, h: 0.06, d: 0.3, x: 0, y: -0.08, z: -0.42, color: 0xf9a8d4, roughness: 0.5, rx: -0.45 });
  } else if (skin === 'capivara') {
    // Capivara: Chill brown capybara with orange & leaf on head + green bandana
    v(torsoPivot, { w: 0.56, h: 0.56, d: 0.36, x: 0, y: 0.29, z: 0, color: 0x92400e, roughness: 0.85 });
    v(torsoPivot, { w: 0.58, h: 0.14, d: 0.38, x: 0, y: 0.52, z: 0, color: 0x16a34a, roughness: 0.65 }); // Green bandana
    v(torsoPivot, { w: 0.36, h: 0.38, d: 0.14, x: 0, y: 0.3, z: -0.22, color: 0x15803d, roughness: 0.7 }); // Trail pack
    // Chunky capybara head
    v(headPivot, { w: 0.52, h: 0.42, d: 0.56, x: 0, y: 0.23, z: 0.06, color: 0xa16207, roughness: 0.82 });
    v(headPivot, { w: 0.4, h: 0.26, d: 0.24, x: 0, y: 0.16, z: 0.36, color: 0x78350f, roughness: 0.8 }); // Broad muzzle
    v(headPivot, { w: 0.12, h: 0.08, d: 0.06, x: -0.1, y: 0.2, z: 0.47, color: 0x1c1917 });
    v(headPivot, { w: 0.12, h: 0.08, d: 0.06, x: 0.1, y: 0.2, z: 0.47, color: 0x1c1917 });
    // Small ears
    v(headPivot, { w: 0.12, h: 0.12, d: 0.08, x: -0.22, y: 0.46, z: -0.06, color: 0x78350f });
    v(headPivot, { w: 0.12, h: 0.12, d: 0.08, x: 0.22, y: 0.46, z: -0.06, color: 0x78350f });
    // Signature tangerine + leaf on head
    v(headPivot, { w: 0.2, h: 0.18, d: 0.2, x: 0, y: 0.53, z: 0.05, color: 0xf97316, roughness: 0.45 });
    v(headPivot, { w: 0.12, h: 0.05, d: 0.08, x: 0.06, y: 0.64, z: 0.05, color: 0x22c55e, rz: 0.3 });
    // Chill eyes
    v(headPivot, { w: 0.13, h: 0.05, d: 0.04, x: -0.15, y: 0.3, z: 0.34, color: 0x1c1917 });
    v(headPivot, { w: 0.13, h: 0.05, d: 0.04, x: 0.15, y: 0.3, z: 0.34, color: 0x1c1917 });
    buildLimbs(0x92400e, 0xa16207, 0x78350f, 0x22c55e, 0xfacc15);
  } else if (skin === 'macaco') {
    // Macaco com roupa vermelha segurando uma banana
    v(torsoPivot, { w: 0.54, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xdc2626, roughness: 0.65 }); // Red jacket
    v(torsoPivot, { w: 0.14, h: 0.54, d: 0.34, x: 0, y: 0.3, z: 0.01, color: 0xfef2f2, roughness: 0.5 }); // White zipper stripe
    v(headPivot, { w: 0.48, h: 0.46, d: 0.46, x: 0, y: 0.25, z: 0, color: 0x78350f, roughness: 0.8 });
    v(headPivot, { w: 0.36, h: 0.26, d: 0.14, x: 0, y: 0.17, z: 0.22, color: 0xfde68a, roughness: 0.7 }); // Tan face mask
    v(headPivot, { w: 0.38, h: 0.18, d: 0.12, x: 0, y: 0.3, z: 0.21, color: 0xfde68a, roughness: 0.7 });
    // Round monkey ears
    v(headPivot, { w: 0.14, h: 0.18, d: 0.08, x: -0.3, y: 0.26, z: 0, color: 0x78350f });
    v(headPivot, { w: 0.08, h: 0.11, d: 0.09, x: -0.3, y: 0.26, z: 0.01, color: 0xfde68a });
    v(headPivot, { w: 0.14, h: 0.18, d: 0.08, x: 0.3, y: 0.26, z: 0, color: 0x78350f });
    v(headPivot, { w: 0.08, h: 0.11, d: 0.09, x: 0.3, y: 0.26, z: 0.01, color: 0xfde68a });
    addEyes(0.3, 0.27, 0x1c1917);
    buildLimbs(0xfde68a, 0xdc2626, 0xb91c1c, 0xfacc15, 0xffffff);
    // Curved yellow voxel banana held in right hand!
    v(rightArmPivot, { w: 0.1, h: 0.22, d: 0.1, x: 0, y: -0.46, z: 0.14, color: 0xfacc15, roughness: 0.35, rx: 0.4 });
    v(rightArmPivot, { w: 0.09, h: 0.16, d: 0.09, x: 0, y: -0.34, z: 0.24, color: 0xfde047, roughness: 0.35, rx: -0.3 });
    v(rightArmPivot, { w: 0.07, h: 0.06, d: 0.07, x: 0, y: -0.25, z: 0.26, color: 0x713f12, roughness: 0.6 }); // Banana tip
    // Monkey tail
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.12, -0.18);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.08, h: 0.08, d: 0.38, x: 0, y: 0.04, z: -0.18, color: 0x78350f, rx: 0.3 });
    v(tailPivot, { w: 0.08, h: 0.24, d: 0.08, x: 0, y: 0.2, z: -0.35, color: 0x78350f });
  } else if (skin === 'neymar_2011') {
    // Neymar 2011: Spiky blond mohawk, cyan #11 jersey, wristbands, cleats
    v(torsoPivot, { w: 0.54, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0x06b6d4, roughness: 0.6 });
    v(torsoPivot, { w: 0.56, h: 0.08, d: 0.34, x: 0, y: 0.56, z: 0, color: 0x0f172a, roughness: 0.5 }); // Collar
    // #11 Chest & Back accent
    v(torsoPivot, { w: 0.07, h: 0.24, d: 0.04, x: -0.07, y: 0.32, z: 0.17, color: 0xf8fafc });
    v(torsoPivot, { w: 0.07, h: 0.24, d: 0.04, x: 0.07, y: 0.32, z: 0.17, color: 0xf8fafc });
    v(torsoPivot, { w: 0.07, h: 0.26, d: 0.04, x: -0.07, y: 0.32, z: -0.17, color: 0xfacc15 });
    v(torsoPivot, { w: 0.07, h: 0.26, d: 0.04, x: 0.07, y: 0.32, z: -0.17, color: 0xfacc15 });
    // Head
    v(headPivot, { w: 0.48, h: 0.46, d: 0.46, x: 0, y: 0.24, z: 0, color: 0xd99b66, roughness: 0.7 });
    // Iconic 2011 spiky blond mohawk!
    v(headPivot, { w: 0.16, h: 0.26, d: 0.48, x: 0, y: 0.56, z: -0.02, color: 0xfde047, roughness: 0.5 });
    v(headPivot, { w: 0.14, h: 0.16, d: 0.16, x: 0, y: 0.72, z: 0.12, color: 0xfef08a, rx: 0.25 });
    v(headPivot, { w: 0.14, h: 0.14, d: 0.16, x: 0, y: 0.7, z: -0.1, color: 0xfacc15, rx: -0.25 });
    v(headPivot, { w: 0.5, h: 0.14, d: 0.48, x: 0, y: 0.42, z: -0.02, color: 0x1e293b }); // Fade sides
    addEyes(0.25, 0.24, 0x292524);
    buildLimbs(0xd99b66, 0x06b6d4, 0x0f172a, 0x84cc16, 0x0f172a);
    // White wristbands
    v(leftArmPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.34, z: 0, color: 0xffffff });
    v(rightArmPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.34, z: 0, color: 0xffffff });
  } else if (skin === 'lamine_yamal') {
    // Lamine Yamal: Curly dark fade hair, burgundy & blue #19 jersey
    v(torsoPivot, { w: 0.27, h: 0.58, d: 0.32, x: -0.135, y: 0.3, z: 0, color: 0x1d4ed8, roughness: 0.6 });
    v(torsoPivot, { w: 0.27, h: 0.58, d: 0.32, x: 0.135, y: 0.3, z: 0, color: 0xbe123c, roughness: 0.6 });
    v(torsoPivot, { w: 0.18, h: 0.14, d: 0.34, x: 0, y: 0.52, z: 0, color: 0xfacc15, roughness: 0.4 });
    // Head
    v(headPivot, { w: 0.48, h: 0.46, d: 0.46, x: 0, y: 0.24, z: 0, color: 0xc68652, roughness: 0.7 });
    // Curly voxel hair top + headband
    v(headPivot, { w: 0.52, h: 0.22, d: 0.5, x: 0, y: 0.5, z: -0.02, color: 0x1c1917, roughness: 0.85 });
    v(headPivot, { w: 0.2, h: 0.1, d: 0.2, x: -0.14, y: 0.62, z: 0.08, color: 0x292524 });
    v(headPivot, { w: 0.2, h: 0.1, d: 0.2, x: 0.14, y: 0.62, z: -0.05, color: 0x292524 });
    v(headPivot, { w: 0.51, h: 0.07, d: 0.49, x: 0, y: 0.41, z: 0, color: 0xf8fafc, roughness: 0.45 });
    addEyes(0.24, 0.24, 0x1c1917);
    buildLimbs(0xc68652, 0x1d4ed8, 0x1e3a8a, 0xf43f5e, 0xfacc15);
  } else if (skin === 'tartaruga') {
    // Tartaruga: Camisa verde com símbolo de coração, casco nas costas e capacete
    v(torsoPivot, { w: 0.54, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0x16a34a, roughness: 0.65 }); // Green shirt
    // Pixel red heart symbol on chest!
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.04, x: -0.06, y: 0.38, z: 0.17, color: 0xef4444, roughness: 0.35 });
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.04, x: 0.06, y: 0.38, z: 0.17, color: 0xef4444, roughness: 0.35 });
    v(torsoPivot, { w: 0.22, h: 0.09, d: 0.04, x: 0, y: 0.32, z: 0.17, color: 0xef4444, roughness: 0.35 });
    v(torsoPivot, { w: 0.1, h: 0.08, d: 0.04, x: 0, y: 0.25, z: 0.17, color: 0xef4444, roughness: 0.35 });
    // Voxel Turtle Shell on back!
    v(torsoPivot, { w: 0.58, h: 0.62, d: 0.22, x: 0, y: 0.3, z: -0.24, color: 0x713f12, roughness: 0.55 });
    v(torsoPivot, { w: 0.44, h: 0.48, d: 0.12, x: 0, y: 0.3, z: -0.34, color: 0x854d0e, roughness: 0.45 });
    v(torsoPivot, { w: 0.62, h: 0.66, d: 0.08, x: 0, y: 0.3, z: -0.17, color: 0xfacc15, roughness: 0.5 }); // Yellow rim
    // Turtle Head + Protective Helmet!
    v(headPivot, { w: 0.48, h: 0.44, d: 0.48, x: 0, y: 0.24, z: 0, color: 0x4ade80, roughness: 0.65 });
    v(headPivot, { w: 0.54, h: 0.24, d: 0.54, x: 0, y: 0.43, z: -0.01, color: 0x0284c7, roughness: 0.25, metalness: 0.3 }); // Helmet dome
    v(headPivot, { w: 0.18, h: 0.28, d: 0.56, x: 0, y: 0.46, z: -0.01, color: 0xfacc15, roughness: 0.25 }); // Helmet stripe
    v(headPivot, { w: 0.52, h: 0.06, d: 0.12, x: 0, y: 0.34, z: 0.25, color: 0x38bdf8, roughness: 0.2 }); // Visor brim
    addEyes(0.24, 0.25, 0x14532d);
    buildLimbs(0x4ade80, 0x16a34a, 0x15803d, 0x0284c7, 0xfacc15);
  } else if (skin === 'cachorro') {
    // Cachorro com roupa azul e símbolo de moto
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x2563eb, roughness: 0.45 }); // Blue racing jacket
    v(torsoPivot, { w: 0.58, h: 0.1, d: 0.36, x: 0, y: 0.55, z: 0, color: 0x1e3a8a, roughness: 0.4 });
    // Voxel Motorcycle Emblem on chest (wheels + frame + handlebar)!
    v(torsoPivot, { w: 0.36, h: 0.24, d: 0.03, x: 0, y: 0.33, z: 0.18, color: 0x0f172a });
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.04, x: -0.1, y: 0.27, z: 0.19, color: 0xf8fafc }); // Front wheel
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.04, x: 0.1, y: 0.27, z: 0.19, color: 0xf8fafc }); // Rear wheel
    v(torsoPivot, { w: 0.22, h: 0.07, d: 0.04, x: 0, y: 0.34, z: 0.19, color: 0xf97316 }); // Orange bike body
    v(torsoPivot, { w: 0.08, h: 0.07, d: 0.04, x: -0.08, y: 0.4, z: 0.19, color: 0xfacc15 }); // Headlight/bars
    // Dog Head + Snout + Floppy Ears + Goggles
    v(headPivot, { w: 0.48, h: 0.44, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xf59e0b, roughness: 0.78 });
    v(headPivot, { w: 0.28, h: 0.18, d: 0.2, x: 0, y: 0.14, z: 0.28, color: 0xfde68a }); // Muzzle
    v(headPivot, { w: 0.12, h: 0.08, d: 0.06, x: 0, y: 0.2, z: 0.38, color: 0x0f172a, roughness: 0.2 }); // Black nose
    // Floppy ears
    v(headPivot, { w: 0.12, h: 0.3, d: 0.16, x: -0.28, y: 0.22, z: 0, color: 0x92400e, rz: 0.12 });
    v(headPivot, { w: 0.12, h: 0.3, d: 0.16, x: 0.28, y: 0.22, z: 0, color: 0x92400e, rz: -0.12 });
    // Racing goggles on forehead
    v(headPivot, { w: 0.5, h: 0.11, d: 0.1, x: 0, y: 0.42, z: 0.22, color: 0x1e293b });
    v(headPivot, { w: 0.16, h: 0.09, d: 0.05, x: -0.12, y: 0.42, z: 0.26, color: 0x38bdf8, roughness: 0.15 });
    v(headPivot, { w: 0.16, h: 0.09, d: 0.05, x: 0.12, y: 0.42, z: 0.26, color: 0x38bdf8, roughness: 0.15 });
    addEyes(0.26, 0.25, 0x1c1917);
    buildLimbs(0xf59e0b, 0x2563eb, 0x1e293b, 0x7c2d12, 0xf97316);
  } else if (skin === 'superman') {
    // Superman: Blue suit, yellow/red diamond crest, red boots & flowing cape
    v(torsoPivot, { w: 0.56, h: 0.6, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x1d4ed8, roughness: 0.55 });
    v(torsoPivot, { w: 0.56, h: 0.1, d: 0.35, x: 0, y: 0.04, z: 0, color: 0xfacc15, roughness: 0.3 }); // Belt
    // Diamond Crest on chest
    v(torsoPivot, { w: 0.26, h: 0.22, d: 0.04, x: 0, y: 0.38, z: 0.18, color: 0xfacc15, roughness: 0.3 });
    v(torsoPivot, { w: 0.18, h: 0.14, d: 0.05, x: 0, y: 0.38, z: 0.185, color: 0xdc2626, roughness: 0.3 });
    v(torsoPivot, { w: 0.1, h: 0.05, d: 0.06, x: 0, y: 0.38, z: 0.19, color: 0xfacc15 });
    // Head + Classic hair curl
    v(headPivot, { w: 0.48, h: 0.46, d: 0.46, x: 0, y: 0.24, z: 0, color: 0xf3cfb6, roughness: 0.7 });
    v(headPivot, { w: 0.5, h: 0.18, d: 0.48, x: 0, y: 0.46, z: -0.02, color: 0x0f172a, roughness: 0.7 });
    v(headPivot, { w: 0.1, h: 0.1, d: 0.08, x: 0.04, y: 0.37, z: 0.23, color: 0x0f172a }); // Curl
    addEyes(0.25, 0.24, 0x2563eb);
    buildLimbs(0xf3cfb6, 0x1d4ed8, 0xdc2626, 0xdc2626, 0xb91c1c);
    // Flowing Red Cape
    capePivot = new THREE.Group();
    capePivot.position.set(0, 0.58, -0.18);
    torsoPivot.add(capePivot);
    v(capePivot, { w: 0.54, h: 0.78, d: 0.05, x: 0, y: -0.38, z: -0.04, color: 0xdc2626, roughness: 0.65, rx: 0.18 });
  } else if (skin === 'homem_de_ferro') {
    // Homem de Ferro: Metallic crimson & gold armor + glowing cyan Arc Reactor + visor
    v(torsoPivot, { w: 0.58, h: 0.6, d: 0.36, x: 0, y: 0.3, z: 0, color: 0xb91c1c, roughness: 0.25, metalness: 0.85 });
    v(torsoPivot, { w: 0.36, h: 0.28, d: 0.37, x: 0, y: 0.34, z: 0.01, color: 0xfbbf24, roughness: 0.2, metalness: 0.9 });
    // Glowing Arc Reactor
    v(torsoPivot, {
      w: 0.16,
      h: 0.16,
      d: 0.06,
      x: 0,
      y: 0.38,
      z: 0.19,
      color: 0x67e8f9,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });
    // Helmet
    v(headPivot, { w: 0.48, h: 0.48, d: 0.48, x: 0, y: 0.25, z: 0, color: 0xb91c1c, roughness: 0.22, metalness: 0.88 });
    v(headPivot, { w: 0.38, h: 0.36, d: 0.08, x: 0, y: 0.24, z: 0.22, color: 0xfbbf24, roughness: 0.18, metalness: 0.92 }); // Gold faceplate
    // Glowing eye slits
    v(headPivot, {
      w: 0.12,
      h: 0.05,
      d: 0.04,
      x: -0.1,
      y: 0.28,
      z: 0.26,
      color: 0xa5f3fc,
      emissive: 0x22d3ee,
      emissiveIntensity: 2.0,
    });
    v(headPivot, {
      w: 0.12,
      h: 0.05,
      d: 0.04,
      x: 0.1,
      y: 0.28,
      z: 0.26,
      color: 0xa5f3fc,
      emissive: 0x22d3ee,
      emissiveIntensity: 2.0,
    });
    buildLimbs(0xfbbf24, 0xb91c1c, 0xb91c1c, 0xfbbf24, 0x991b1b, 0.22);
  } else if (skin === 'galo_doido') {
    // Galo Doido: Rooster mascot with red comb, yellow beak, black-and-white #13 striped jersey
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x09090b, roughness: 0.68 });
    // White vertical stripes
    v(torsoPivot, { w: 0.1, h: 0.56, d: 0.35, x: -0.16, y: 0.3, z: 0, color: 0xf8fafc });
    v(torsoPivot, { w: 0.1, h: 0.56, d: 0.35, x: 0, y: 0.3, z: 0, color: 0xf8fafc });
    v(torsoPivot, { w: 0.1, h: 0.56, d: 0.35, x: 0.16, y: 0.3, z: 0, color: 0xf8fafc });
    // Rooster Head
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xf8fafc, roughness: 0.65 });
    // Red Serrated Rooster Comb!
    v(headPivot, { w: 0.12, h: 0.22, d: 0.16, x: 0, y: 0.56, z: 0.12, color: 0xef4444, roughness: 0.45 });
    v(headPivot, { w: 0.12, h: 0.26, d: 0.16, x: 0, y: 0.58, z: -0.02, color: 0xdc2626, roughness: 0.45 });
    v(headPivot, { w: 0.12, h: 0.18, d: 0.14, x: 0, y: 0.53, z: -0.16, color: 0xb91c1c, roughness: 0.45 });
    // Sharp Yellow Beak & Red Wattle
    v(headPivot, { w: 0.18, h: 0.12, d: 0.2, x: 0, y: 0.19, z: 0.3, color: 0xfacc15, roughness: 0.35 });
    v(headPivot, { w: 0.12, h: 0.12, d: 0.1, x: 0, y: 0.08, z: 0.26, color: 0xef4444 });
    // Intense eyebrows + eyes
    addEyes(0.28, 0.25, 0x09090b);
    v(headPivot, { w: 0.15, h: 0.05, d: 0.05, x: -0.12, y: 0.36, z: 0.26, color: 0x09090b, rz: -0.25 });
    v(headPivot, { w: 0.15, h: 0.05, d: 0.05, x: 0.12, y: 0.36, z: 0.26, color: 0x09090b, rz: 0.25 });
    buildLimbs(0xf8fafc, 0x18181b, 0x09090b, 0xfacc15, 0xef4444);
    // Tail feathers
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.16, -0.18);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.14, h: 0.3, d: 0.18, x: 0, y: 0.12, z: -0.12, color: 0x18181b, rx: -0.45 });
  } else if (skin === 'ratao_rei') {
    // RATÃO REI: Royal purple & gold robe, crimson ermine cape, ornate golden gemmed crown, golden aura & 5 animated follower mice!
    v(torsoPivot, { w: 0.58, h: 0.6, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x6b21a8, roughness: 0.45, metalness: 0.25 }); // Royal purple tunic
    v(torsoPivot, { w: 0.6, h: 0.12, d: 0.36, x: 0, y: 0.56, z: 0, color: 0xf8fafc, roughness: 0.85 }); // Ermine collar
    v(torsoPivot, { w: 0.58, h: 0.1, d: 0.36, x: 0, y: 0.08, z: 0, color: 0xfacc15, roughness: 0.2, metalness: 0.9 }); // Golden belt
    v(torsoPivot, { w: 0.18, h: 0.2, d: 0.05, x: 0, y: 0.35, z: 0.18, color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: 0.45, metalness: 0.9 }); // Royal crest
    // Royal Rat Head
    v(headPivot, { w: 0.5, h: 0.44, d: 0.5, x: 0, y: 0.24, z: 0, color: 0x94a3b8, roughness: 0.58 });
    v(headPivot, { w: 0.3, h: 0.2, d: 0.26, x: 0, y: 0.16, z: 0.32, color: 0xe2e8f0, roughness: 0.55 });
    v(headPivot, { w: 0.12, h: 0.09, d: 0.08, x: 0, y: 0.22, z: 0.46, color: 0xf472b6, roughness: 0.3 });
    v(headPivot, { w: 0.22, h: 0.24, d: 0.08, x: -0.27, y: 0.48, z: -0.04, color: 0x64748b });
    v(headPivot, { w: 0.14, h: 0.16, d: 0.09, x: -0.27, y: 0.48, z: -0.02, color: 0xfde047 });
    v(headPivot, { w: 0.22, h: 0.24, d: 0.08, x: 0.27, y: 0.48, z: -0.04, color: 0x64748b });
    v(headPivot, { w: 0.14, h: 0.16, d: 0.09, x: 0.27, y: 0.48, z: -0.02, color: 0xfde047 });
    addEyes(0.3, 0.26, 0xfacc15);
    // Royal Golden Crown with Ruby & Emerald Gems
    v(headPivot, { w: 0.46, h: 0.12, d: 0.46, x: 0, y: 0.52, z: 0, color: 0xfacc15, metalness: 0.92, roughness: 0.16, emissive: 0xf59e0b, emissiveIntensity: 0.35 });
    v(headPivot, { w: 0.1, h: 0.16, d: 0.1, x: -0.17, y: 0.65, z: 0.17, color: 0xfde047, metalness: 0.92, roughness: 0.15 });
    v(headPivot, { w: 0.1, h: 0.16, d: 0.1, x: 0.17, y: 0.65, z: 0.17, color: 0xfde047, metalness: 0.92, roughness: 0.15 });
    v(headPivot, { w: 0.1, h: 0.16, d: 0.1, x: -0.17, y: 0.65, z: -0.17, color: 0xfde047, metalness: 0.92, roughness: 0.15 });
    v(headPivot, { w: 0.1, h: 0.16, d: 0.1, x: 0.17, y: 0.65, z: -0.17, color: 0xfde047, metalness: 0.92, roughness: 0.15 });
    v(headPivot, { w: 0.1, h: 0.1, d: 0.06, x: 0, y: 0.53, z: 0.24, color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.9 }); // Front ruby
    buildLimbs(0x94a3b8, 0x6b21a8, 0x3b0764, 0xfacc15, 0xfef08a, 0.35);
    // Royal Crimson & Gold Cape
    capePivot = new THREE.Group();
    capePivot.position.set(0, 0.58, -0.19);
    torsoPivot.add(capePivot);
    v(capePivot, { w: 0.62, h: 0.88, d: 0.06, x: 0, y: -0.43, z: -0.04, color: 0xb91c1c, roughness: 0.55, rx: 0.2 });
    v(capePivot, { w: 0.66, h: 0.12, d: 0.07, x: 0, y: -0.84, z: -0.12, color: 0xfacc15, metalness: 0.85, roughness: 0.2, rx: 0.2 });
    // Golden Tail
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.1, -0.18);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.08, h: 0.08, d: 0.34, x: 0, y: -0.02, z: -0.16, color: 0xf472b6, rx: -0.2 });
    // Royal Golden Aura Particles
    auraParticles = [];
    for (let i = 0; i < 6; i++) {
      const m = v(root, {
        w: 0.09,
        h: 0.09,
        d: 0.09,
        x: 0,
        y: 1.0,
        z: 0,
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 1.8,
        roughness: 0.1,
      });
      m.castShadow = false;
      auraParticles.push({
        mesh: m,
        radius: 0.72 + (i % 2) * 0.16,
        heightOffset: 0.45 + (i % 3) * 0.45,
        speed: 2.2 + i * 0.25,
        angle: (i / 6) * Math.PI * 2,
      });
    }
    // 5 Animated Royal Follower Mice trailing behind Ratão Rei!
    followerMice = [];
    const mouseSlots: [number, number][] = [
      [-0.72, -1.28],
      [-0.36, -0.95],
      [0, -1.55],
      [0.36, -0.95],
      [0.72, -1.28],
    ];
    mouseSlots.forEach(([mx, mz], idx) => {
      const mGroup = new THREE.Group();
      mGroup.position.set(mx, 0, mz);
      root.add(mGroup);

      const mBody = new THREE.Group();
      mGroup.add(mBody);
      // Mini mouse torso, head, ears, snout, tiny royal cape & tail
      v(mBody, { w: 0.22, h: 0.22, d: 0.22, x: 0, y: 0.24, z: 0, color: 0x7e22ce, roughness: 0.65 });
      v(mBody, { w: 0.24, h: 0.2, d: 0.24, x: 0, y: 0.44, z: 0.02, color: 0x94a3b8, roughness: 0.65 });
      v(mBody, { w: 0.14, h: 0.1, d: 0.12, x: 0, y: 0.41, z: 0.16, color: 0xcbd5e1 });
      v(mBody, { w: 0.06, h: 0.05, d: 0.04, x: 0, y: 0.43, z: 0.23, color: 0xf472b6 });
      v(mBody, { w: 0.11, h: 0.12, d: 0.04, x: -0.13, y: 0.56, z: 0, color: 0x64748b });
      v(mBody, { w: 0.11, h: 0.12, d: 0.04, x: 0.13, y: 0.56, z: 0, color: 0x64748b });
      v(mBody, { w: 0.04, h: 0.04, d: 0.18, x: 0, y: 0.18, z: -0.18, color: 0xf472b6, rx: -0.3 });
      v(mBody, { w: 0.16, h: 0.05, d: 0.16, x: 0, y: 0.56, z: 0.02, color: 0xfacc15, metalness: 0.9 }); // Mini gold crown band

      const mLeftLeg = v(mBody, { w: 0.08, h: 0.14, d: 0.1, x: -0.06, y: 0.08, z: 0, color: 0x475569 });
      const mRightLeg = v(mBody, { w: 0.08, h: 0.14, d: 0.1, x: 0.06, y: 0.08, z: 0, color: 0x475569 });

      followerMice!.push({
        group: mGroup,
        body: mBody,
        leftLeg: mLeftLeg,
        rightLeg: mRightLeg,
        baseX: mx,
        baseZ: mz,
        phase: idx * 1.25,
      });
    });
  } else if (skin === 'lenda_suprema') {
    // TOP 1: LENDA SUPREMA — Radiant Golden Armor, Special Crown, Golden Aura & Particles
    v(torsoPivot, { w: 0.6, h: 0.62, d: 0.38, x: 0, y: 0.3, z: 0, color: 0xf59e0b, metalness: 0.92, roughness: 0.16 });
    v(torsoPivot, { w: 0.68, h: 0.16, d: 0.38, x: 0, y: 0.54, z: 0, color: 0xfde047, metalness: 0.94, roughness: 0.14 }); // Winged pauldrons
    v(torsoPivot, { w: 0.18, h: 0.18, d: 0.06, x: 0, y: 0.36, z: 0.2, color: 0xffffff, emissive: 0xfef08a, emissiveIntensity: 2.0 });
    v(headPivot, { w: 0.5, h: 0.48, d: 0.5, x: 0, y: 0.25, z: 0, color: 0xfacc15, metalness: 0.92, roughness: 0.15 });
    v(headPivot, { w: 0.36, h: 0.12, d: 0.06, x: 0, y: 0.27, z: 0.25, color: 0xffffff, emissive: 0xfef08a, emissiveIntensity: 2.2 }); // Glowing eyes visor
    // Special Champion Crown
    v(headPivot, { w: 0.54, h: 0.14, d: 0.54, x: 0, y: 0.52, z: 0, color: 0xfde047, metalness: 0.95, roughness: 0.1, emissive: 0xf59e0b, emissiveIntensity: 0.6 });
    v(headPivot, { w: 0.14, h: 0.22, d: 0.12, x: 0, y: 0.66, z: 0.2, color: 0xffffff, emissive: 0xfef08a, emissiveIntensity: 1.5 });
    v(headPivot, { w: 0.12, h: 0.18, d: 0.12, x: -0.2, y: 0.62, z: 0.18, color: 0xfacc15, metalness: 0.95 });
    v(headPivot, { w: 0.12, h: 0.18, d: 0.12, x: 0.2, y: 0.62, z: 0.18, color: 0xfacc15, metalness: 0.95 });
    buildLimbs(0xfef08a, 0xf59e0b, 0xd97706, 0xfde047, 0xffffff, 0.16);
    capePivot = new THREE.Group();
    capePivot.position.set(0, 0.58, -0.2);
    torsoPivot.add(capePivot);
    v(capePivot, { w: 0.6, h: 0.85, d: 0.05, x: 0, y: -0.41, z: -0.04, color: 0xfef9c3, emissive: 0xfacc15, emissiveIntensity: 0.3, rx: 0.2 });
    auraParticles = [];
    for (let i = 0; i < 6; i++) {
      const m = v(root, { w: 0.1, h: 0.1, d: 0.1, x: 0, y: 1.0, z: 0, color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 2.0 });
      m.castShadow = false;
      auraParticles.push({ mesh: m, radius: 0.78, heightOffset: 0.4 + (i % 3) * 0.48, speed: 2.8, angle: (i / 6) * Math.PI * 2 });
    }
  } else if (skin === 'campeao_prata') {
    // TOP 2: CAMPEÃO DE PRATA — Metallic Silver Armor, Cyan Visor & Silver Particles
    v(torsoPivot, { w: 0.58, h: 0.6, d: 0.36, x: 0, y: 0.3, z: 0, color: 0xcbd5e1, metalness: 0.9, roughness: 0.2 });
    v(torsoPivot, { w: 0.64, h: 0.14, d: 0.36, x: 0, y: 0.54, z: 0, color: 0xe2e8f0, metalness: 0.92, roughness: 0.18 });
    v(torsoPivot, { w: 0.16, h: 0.16, d: 0.05, x: 0, y: 0.36, z: 0.19, color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.8 });
    v(headPivot, { w: 0.48, h: 0.48, d: 0.48, x: 0, y: 0.25, z: 0, color: 0xe2e8f0, metalness: 0.92, roughness: 0.18 });
    v(headPivot, { w: 0.34, h: 0.1, d: 0.06, x: 0, y: 0.27, z: 0.24, color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.8 });
    v(headPivot, { w: 0.14, h: 0.24, d: 0.44, x: 0, y: 0.55, z: -0.02, color: 0x94a3b8, metalness: 0.9 }); // Silver crest
    buildLimbs(0xe2e8f0, 0x94a3b8, 0x64748b, 0xf8fafc, 0x38bdf8, 0.2);
    capePivot = new THREE.Group();
    capePivot.position.set(0, 0.58, -0.19);
    torsoPivot.add(capePivot);
    v(capePivot, { w: 0.56, h: 0.8, d: 0.05, x: 0, y: -0.39, z: -0.04, color: 0x0284c7, roughness: 0.45, rx: 0.18 });
    auraParticles = [];
    for (let i = 0; i < 5; i++) {
      const m = v(root, { w: 0.08, h: 0.08, d: 0.08, x: 0, y: 1.0, z: 0, color: 0xe2e8f0, emissive: 0x38bdf8, emissiveIntensity: 1.7 });
      m.castShadow = false;
      auraParticles.push({ mesh: m, radius: 0.72, heightOffset: 0.45 + (i % 3) * 0.42, speed: 2.3, angle: (i / 5) * Math.PI * 2 });
    }
  } else if (skin === 'guerreiro_bronze') {
    // TOP 3: GUERREIRO DE BRONZE — Forged Bronze Armor, Horned Crest & Ember Particles
    v(torsoPivot, { w: 0.58, h: 0.6, d: 0.36, x: 0, y: 0.3, z: 0, color: 0xb45309, metalness: 0.85, roughness: 0.28 });
    v(torsoPivot, { w: 0.64, h: 0.14, d: 0.36, x: 0, y: 0.54, z: 0, color: 0xd97706, metalness: 0.86, roughness: 0.26 });
    v(torsoPivot, { w: 0.16, h: 0.16, d: 0.05, x: 0, y: 0.36, z: 0.19, color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 1.7 });
    v(headPivot, { w: 0.48, h: 0.48, d: 0.48, x: 0, y: 0.25, z: 0, color: 0xb45309, metalness: 0.86, roughness: 0.26 });
    v(headPivot, { w: 0.34, h: 0.09, d: 0.06, x: 0, y: 0.27, z: 0.24, color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 1.7 });
    // Warrior bronze horns/crest
    v(headPivot, { w: 0.1, h: 0.22, d: 0.1, x: -0.24, y: 0.54, z: 0.04, color: 0xf59e0b, metalness: 0.88, rz: 0.25 });
    v(headPivot, { w: 0.1, h: 0.22, d: 0.1, x: 0.24, y: 0.54, z: 0.04, color: 0xf59e0b, metalness: 0.88, rz: -0.25 });
    buildLimbs(0xd97706, 0x92400e, 0x78350f, 0xd97706, 0xfb923c, 0.28);
    capePivot = new THREE.Group();
    capePivot.position.set(0, 0.58, -0.19);
    torsoPivot.add(capePivot);
    v(capePivot, { w: 0.54, h: 0.76, d: 0.05, x: 0, y: -0.37, z: -0.04, color: 0x7c2d12, roughness: 0.65, rx: 0.18 });
    auraParticles = [];
    for (let i = 0; i < 5; i++) {
      const m = v(root, { w: 0.08, h: 0.08, d: 0.08, x: 0, y: 1.0, z: 0, color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 1.6 });
      m.castShadow = false;
      auraParticles.push({ mesh: m, radius: 0.72, heightOffset: 0.45 + (i % 3) * 0.42, speed: 2.1, angle: (i / 5) * Math.PI * 2 });
    }
  } else if (skin === 'homem_aranha') {
    // Homem-Aranha: Red & Navy Suit with Web Accents, Chest Spider Emblem & White Lenses
    v(torsoPivot, { w: 0.56, h: 0.34, d: 0.34, x: 0, y: 0.42, z: 0, color: 0xdc2626, roughness: 0.45 });
    v(torsoPivot, { w: 0.54, h: 0.26, d: 0.33, x: 0, y: 0.14, z: 0, color: 0x1d4ed8, roughness: 0.52 });
    v(torsoPivot, { w: 0.24, h: 0.26, d: 0.35, x: 0, y: 0.18, z: 0, color: 0xdc2626, roughness: 0.45 });
    // Black Spider Chest & Back Emblems
    v(torsoPivot, { w: 0.12, h: 0.16, d: 0.04, x: 0, y: 0.39, z: 0.18, color: 0x09090b, roughness: 0.3 });
    v(torsoPivot, { w: 0.26, h: 0.04, d: 0.04, x: 0, y: 0.44, z: 0.18, color: 0x09090b, rz: 0.2 });
    v(torsoPivot, { w: 0.26, h: 0.04, d: 0.04, x: 0, y: 0.34, z: 0.18, color: 0x09090b, rz: -0.2 });
    v(torsoPivot, { w: 0.14, h: 0.16, d: 0.04, x: 0, y: 0.38, z: -0.18, color: 0xdc2626, roughness: 0.35 });
    v(torsoPivot, { w: 0.58, h: 0.06, d: 0.36, x: 0, y: 0.04, z: 0, color: 0x0f172a, roughness: 0.4 });
    // Red Masked Head & Signature White Triangular Spider Eyes
    v(headPivot, { w: 0.48, h: 0.48, d: 0.48, x: 0, y: 0.25, z: 0, color: 0xdc2626, roughness: 0.45 });
    v(headPivot, { w: 0.5, h: 0.03, d: 0.5, x: 0, y: 0.38, z: 0, color: 0x450a0a, roughness: 0.6 });
    v(headPivot, { w: 0.03, h: 0.2, d: 0.5, x: 0, y: 0.39, z: 0, color: 0x450a0a, roughness: 0.6 });
    v(headPivot, { w: 0.16, h: 0.14, d: 0.05, x: -0.12, y: 0.27, z: 0.245, color: 0x020617, rz: -0.22 });
    v(headPivot, { w: 0.16, h: 0.14, d: 0.05, x: 0.12, y: 0.27, z: 0.245, color: 0x020617, rz: 0.22 });
    v(headPivot, { w: 0.11, h: 0.09, d: 0.05, x: -0.12, y: 0.27, z: 0.255, color: 0xf8fafc, emissive: 0xe0f2fe, emissiveIntensity: 0.2, rz: -0.22 });
    v(headPivot, { w: 0.11, h: 0.09, d: 0.05, x: 0.12, y: 0.27, z: 0.255, color: 0xf8fafc, emissive: 0xe0f2fe, emissiveIntensity: 0.2, rz: 0.22 });
    // Arms (Red shoulders/gloves + Blue forearms + Web Shooters)
    v(leftArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xdc2626, roughness: 0.45 });
    v(leftArmPivot, { w: 0.17, h: 0.18, d: 0.17, x: 0, y: -0.27, z: 0, color: 0x1d4ed8, roughness: 0.52 });
    v(leftArmPivot, { w: 0.19, h: 0.06, d: 0.19, x: 0, y: -0.36, z: 0, color: 0x09090b, metalness: 0.6 });
    v(leftArmPivot, { w: 0.17, h: 0.11, d: 0.17, x: 0, y: -0.44, z: 0, color: 0xdc2626, roughness: 0.45 });
    v(rightArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xdc2626, roughness: 0.45 });
    v(rightArmPivot, { w: 0.17, h: 0.18, d: 0.17, x: 0, y: -0.27, z: 0, color: 0x1d4ed8, roughness: 0.52 });
    v(rightArmPivot, { w: 0.19, h: 0.06, d: 0.19, x: 0, y: -0.36, z: 0, color: 0x09090b, metalness: 0.6 });
    v(rightArmPivot, { w: 0.17, h: 0.11, d: 0.17, x: 0, y: -0.44, z: 0, color: 0xdc2626, roughness: 0.45 });
    // Legs (Blue pants + Red boots)
    v(leftLegPivot, { w: 0.2, h: 0.36, d: 0.2, x: 0, y: -0.22, z: 0, color: 0x1d4ed8, roughness: 0.55 });
    v(leftLegPivot, { w: 0.22, h: 0.18, d: 0.3, x: 0, y: -0.53, z: 0.04, color: 0xdc2626, roughness: 0.42 });
    v(leftLegPivot, { w: 0.23, h: 0.05, d: 0.31, x: 0, y: -0.63, z: 0.04, color: 0x0f172a, roughness: 0.4 });
    v(rightLegPivot, { w: 0.2, h: 0.36, d: 0.2, x: 0, y: -0.22, z: 0, color: 0x1d4ed8, roughness: 0.55 });
    v(rightLegPivot, { w: 0.22, h: 0.18, d: 0.3, x: 0, y: -0.53, z: 0.04, color: 0xdc2626, roughness: 0.42 });
    v(rightLegPivot, { w: 0.23, h: 0.05, d: 0.31, x: 0, y: -0.63, z: 0.04, color: 0x0f172a, roughness: 0.4 });
  } else if (skin === 'jegue') {
    // Jegue: Burro Cinza-Marrom com Orelhas Longas, Crina Escura, Sela Nordestina e Cascos
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x78716c, roughness: 0.85 });
    v(torsoPivot, { w: 0.36, h: 0.38, d: 0.04, x: 0, y: 0.28, z: 0.17, color: 0xd6d3d1, roughness: 0.85 });
    // Colorful Saddle Poncho & Leather Strap
    v(torsoPivot, { w: 0.62, h: 0.26, d: 0.4, x: 0, y: 0.42, z: -0.02, color: 0xd97706, roughness: 0.78 });
    v(torsoPivot, { w: 0.63, h: 0.06, d: 0.41, x: 0, y: 0.32, z: -0.02, color: 0x16a34a, roughness: 0.78 });
    v(torsoPivot, { w: 0.63, h: 0.05, d: 0.41, x: 0, y: 0.48, z: -0.02, color: 0xfacc15, roughness: 0.78 });
    v(torsoPivot, { w: 0.58, h: 0.08, d: 0.36, x: 0, y: 0.1, z: 0, color: 0x451a03, roughness: 0.6 });
    // Head, Long Muzzle, Teeth, Dark Mane & Long Donkey Ears
    v(headPivot, { w: 0.48, h: 0.46, d: 0.5, x: 0, y: 0.25, z: 0, color: 0x78716c, roughness: 0.84 });
    v(headPivot, { w: 0.34, h: 0.24, d: 0.28, x: 0, y: 0.16, z: 0.32, color: 0xa8a29e, roughness: 0.8 });
    v(headPivot, { w: 0.07, h: 0.06, d: 0.04, x: -0.09, y: 0.22, z: 0.46, color: 0x292524 });
    v(headPivot, { w: 0.07, h: 0.06, d: 0.04, x: 0.09, y: 0.22, z: 0.46, color: 0x292524 });
    v(headPivot, { w: 0.16, h: 0.07, d: 0.04, x: 0, y: 0.08, z: 0.45, color: 0xf8fafc, roughness: 0.25 });
    // Dark spiky mane
    v(headPivot, { w: 0.14, h: 0.16, d: 0.38, x: 0, y: 0.52, z: -0.08, color: 0x292524, roughness: 0.9 });
    v(headPivot, { w: 0.12, h: 0.26, d: 0.14, x: 0, y: 0.3, z: -0.28, color: 0x292524, roughness: 0.9 });
    // Tall upright donkey ears
    v(headPivot, { w: 0.14, h: 0.44, d: 0.1, x: -0.18, y: 0.66, z: -0.02, color: 0x78716c, roughness: 0.82, rz: 0.16 });
    v(headPivot, { w: 0.08, h: 0.34, d: 0.04, x: -0.18, y: 0.65, z: 0.03, color: 0xfda4af, roughness: 0.7, rz: 0.16 });
    v(headPivot, { w: 0.14, h: 0.44, d: 0.1, x: 0.18, y: 0.66, z: -0.02, color: 0x78716c, roughness: 0.82, rz: -0.16 });
    v(headPivot, { w: 0.08, h: 0.34, d: 0.04, x: 0.18, y: 0.65, z: 0.03, color: 0xfda4af, roughness: 0.7, rz: -0.16 });
    addEyes(0.32, 0.26, 0x1c1917);
    buildLimbs(0x78716c, 0x78716c, 0x78716c, 0x1c1917, 0x44403c, 0.84);
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.14, -0.19);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.07, h: 0.07, d: 0.38, x: 0, y: -0.04, z: -0.18, color: 0x78716c, roughness: 0.85, rx: -0.35 });
    v(tailPivot, { w: 0.12, h: 0.12, d: 0.16, x: 0, y: -0.16, z: -0.4, color: 0x292524, roughness: 0.9, rx: -0.45 });
  } else if (skin === 'capitao_america') {
    // Capitão América: Tactical Navy Armor, Chest Star, Red/White Stripes, Winged Helmet & Shield
    v(torsoPivot, { w: 0.58, h: 0.34, d: 0.35, x: 0, y: 0.43, z: 0, color: 0x1e3a8a, roughness: 0.5 });
    v(torsoPivot, { w: 0.56, h: 0.22, d: 0.34, x: 0, y: 0.17, z: 0, color: 0xf8fafc, roughness: 0.55 });
    v(torsoPivot, { w: 0.12, h: 0.22, d: 0.35, x: -0.16, y: 0.17, z: 0, color: 0xdc2626, roughness: 0.55 });
    v(torsoPivot, { w: 0.12, h: 0.22, d: 0.35, x: 0.16, y: 0.17, z: 0, color: 0xdc2626, roughness: 0.55 });
    // White Chest Star Emblem
    v(torsoPivot, { w: 0.16, h: 0.16, d: 0.04, x: 0, y: 0.42, z: 0.185, color: 0xf8fafc, emissive: 0x94a3b8, emissiveIntensity: 0.15, rz: 0.78 });
    v(torsoPivot, { w: 0.16, h: 0.16, d: 0.04, x: 0, y: 0.42, z: 0.185, color: 0xf8fafc, emissive: 0x94a3b8, emissiveIntensity: 0.15 });
    // Tactical Belt
    v(torsoPivot, { w: 0.6, h: 0.08, d: 0.37, x: 0, y: 0.05, z: 0, color: 0x78350f, roughness: 0.55 });
    v(torsoPivot, { w: 0.12, h: 0.09, d: 0.04, x: 0, y: 0.05, z: 0.19, color: 0xfacc15, metalness: 0.85 });
    // Head + Winged Blue Helmet + Exposed Jaw
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xf3cfb6, roughness: 0.7 });
    v(headPivot, { w: 0.5, h: 0.3, d: 0.5, x: 0, y: 0.35, z: 0, color: 0x1e3a8a, roughness: 0.42 });
    v(headPivot, { w: 0.5, h: 0.26, d: 0.16, x: 0, y: 0.14, z: -0.17, color: 0x1e3a8a, roughness: 0.42 });
    v(headPivot, { w: 0.1, h: 0.11, d: 0.04, x: 0, y: 0.4, z: 0.255, color: 0xf8fafc }); // 'A' Crest
    v(headPivot, { w: 0.05, h: 0.14, d: 0.1, x: -0.27, y: 0.36, z: -0.02, color: 0xf8fafc, rx: -0.3 });
    v(headPivot, { w: 0.05, h: 0.14, d: 0.1, x: 0.27, y: 0.36, z: -0.02, color: 0xf8fafc, rx: -0.3 });
    addEyes(0.26, 0.25, 0x2563eb);
    buildLimbs(0xf3cfb6, 0x1e3a8a, 0x1e3a8a, 0xb91c1c, 0x0f172a, 0.48);
    // Red Tactical Gloves
    v(leftArmPivot, { w: 0.17, h: 0.14, d: 0.17, x: 0, y: -0.4, z: 0, color: 0xb91c1c, roughness: 0.45 });
    v(rightArmPivot, { w: 0.17, h: 0.14, d: 0.17, x: 0, y: -0.4, z: 0, color: 0xb91c1c, roughness: 0.45 });
    // Iconic Vibranium Shield on Left Arm
    v(leftArmPivot, { w: 0.06, h: 0.62, d: 0.62, x: -0.14, y: -0.28, z: 0.04, color: 0xdc2626, metalness: 0.7, roughness: 0.22 });
    v(leftArmPivot, { w: 0.07, h: 0.48, d: 0.48, x: -0.145, y: -0.28, z: 0.04, color: 0xf8fafc, metalness: 0.72, roughness: 0.2 });
    v(leftArmPivot, { w: 0.08, h: 0.34, d: 0.34, x: -0.15, y: -0.28, z: 0.04, color: 0xdc2626, metalness: 0.7, roughness: 0.22 });
    v(leftArmPivot, { w: 0.09, h: 0.2, d: 0.2, x: -0.155, y: -0.28, z: 0.04, color: 0x1d4ed8, metalness: 0.75, roughness: 0.2 });
    v(leftArmPivot, { w: 0.1, h: 0.11, d: 0.11, x: -0.16, y: -0.28, z: 0.04, color: 0xf8fafc, metalness: 0.6, roughness: 0.2 });
  } else if (skin === 'pele') {
    // Pelé: Camisa Amarela Clássica #10, Gola Verde, Calção Azul, Meião Branco & Coroa do Rei do Futebol
    v(torsoPivot, { w: 0.55, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xfacc15, roughness: 0.65 });
    v(torsoPivot, { w: 0.4, h: 0.09, d: 0.34, x: 0, y: 0.56, z: 0, color: 0x16a34a, roughness: 0.6 }); // Green collar
    // Green #10 Front & Back
    v(torsoPivot, { w: 0.05, h: 0.22, d: 0.03, x: -0.09, y: 0.3, z: 0.17, color: 0x15803d });
    v(torsoPivot, { w: 0.12, h: 0.22, d: 0.03, x: 0.07, y: 0.3, z: 0.17, color: 0x15803d });
    v(torsoPivot, { w: 0.05, h: 0.12, d: 0.04, x: 0.07, y: 0.3, z: 0.175, color: 0xfacc15 });
    v(torsoPivot, { w: 0.05, h: 0.24, d: 0.03, x: -0.09, y: 0.3, z: -0.17, color: 0x15803d });
    v(torsoPivot, { w: 0.13, h: 0.24, d: 0.03, x: 0.07, y: 0.3, z: -0.17, color: 0x15803d });
    v(torsoPivot, { w: 0.05, h: 0.13, d: 0.04, x: 0.07, y: 0.3, z: -0.175, color: 0xfacc15 });
    // Head + Classic Curly Hair + King of Football Mini Gold Crown
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0x7c4a2d, roughness: 0.72 });
    v(headPivot, { w: 0.52, h: 0.14, d: 0.52, x: 0, y: 0.49, z: -0.01, color: 0x111827, roughness: 0.88 });
    v(headPivot, { w: 0.5, h: 0.22, d: 0.14, x: 0, y: 0.36, z: -0.2, color: 0x111827, roughness: 0.88 });
    // Subtle Golden King Crown
    v(headPivot, { w: 0.32, h: 0.07, d: 0.32, x: 0, y: 0.59, z: 0.02, color: 0xfacc15, metalness: 0.9, roughness: 0.18 });
    v(headPivot, { w: 0.08, h: 0.09, d: 0.08, x: 0, y: 0.66, z: 0.13, color: 0xfde047, metalness: 0.92 });
    v(headPivot, { w: 0.07, h: 0.07, d: 0.07, x: -0.11, y: 0.65, z: 0.12, color: 0xfacc15, metalness: 0.9 });
    v(headPivot, { w: 0.07, h: 0.07, d: 0.07, x: 0.11, y: 0.65, z: 0.12, color: 0xfacc15, metalness: 0.9 });
    addEyes(0.27, 0.25, 0x1c1917);
    // Arms (Yellow jersey sleeves + green cuffs + warm dark brown arms)
    v(leftArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xfacc15, roughness: 0.65 });
    v(leftArmPivot, { w: 0.195, h: 0.05, d: 0.195, x: 0, y: -0.21, z: 0, color: 0x16a34a });
    v(leftArmPivot, { w: 0.16, h: 0.25, d: 0.16, x: 0, y: -0.35, z: 0, color: 0x7c4a2d, roughness: 0.72 });
    v(rightArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xfacc15, roughness: 0.65 });
    v(rightArmPivot, { w: 0.195, h: 0.05, d: 0.195, x: 0, y: -0.21, z: 0, color: 0x16a34a });
    v(rightArmPivot, { w: 0.16, h: 0.25, d: 0.16, x: 0, y: -0.35, z: 0, color: 0x7c4a2d, roughness: 0.72 });
    // Legs (Royal blue shorts + brown knee + tall white socks + classic black cleats)
    v(leftLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0x1d4ed8, roughness: 0.7 });
    v(leftLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0x7c4a2d });
    v(leftLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.41, z: 0, color: 0xf8fafc });
    v(leftLegPivot, { w: 0.22, h: 0.14, d: 0.3, x: 0, y: -0.55, z: 0.04, color: 0x0f172a, roughness: 0.4 });
    v(rightLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0x1d4ed8, roughness: 0.7 });
    v(rightLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0x7c4a2d });
    v(rightLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.41, z: 0, color: 0xf8fafc });
    v(rightLegPivot, { w: 0.22, h: 0.14, d: 0.3, x: 0, y: -0.55, z: 0.04, color: 0x0f172a, roughness: 0.4 });
  } else if (skin === 'maradona') {
    // Maradona: Camisa Listrada Albiceleste #10, Cabelo Cacheado Volumoso e Faixa de Capitão
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xf8fafc, roughness: 0.62 });
    v(torsoPivot, { w: 0.14, h: 0.58, d: 0.335, x: -0.17, y: 0.3, z: 0, color: 0x38bdf8, roughness: 0.6 });
    v(torsoPivot, { w: 0.14, h: 0.58, d: 0.335, x: 0.17, y: 0.3, z: 0, color: 0x38bdf8, roughness: 0.6 });
    v(torsoPivot, { w: 0.12, h: 0.58, d: 0.335, x: 0, y: 0.3, z: 0, color: 0x38bdf8, roughness: 0.6 });
    // Navy #10
    v(torsoPivot, { w: 0.05, h: 0.22, d: 0.03, x: -0.09, y: 0.3, z: -0.175, color: 0x0f172a });
    v(torsoPivot, { w: 0.12, h: 0.22, d: 0.03, x: 0.07, y: 0.3, z: -0.175, color: 0x0f172a });
    v(torsoPivot, { w: 0.05, h: 0.12, d: 0.04, x: 0.07, y: 0.3, z: -0.18, color: 0xf8fafc });
    v(torsoPivot, { w: 0.08, h: 0.14, d: 0.03, x: 0.16, y: 0.44, z: 0.175, color: 0xfacc15, metalness: 0.6 });
    // Head + Signature Voluminous 80s Curly Hair
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xdba885, roughness: 0.72 });
    const curls = [
      [-0.18, 0.52, 0.06], [0, 0.54, 0.08], [0.18, 0.52, 0.06],
      [-0.22, 0.46, -0.1], [0.22, 0.46, -0.1], [0, 0.52, -0.14],
      [-0.25, 0.28, -0.14], [0.25, 0.28, -0.14], [0, 0.3, -0.24],
    ];
    for (const [cx, cy, cz] of curls) {
      v(headPivot, { w: 0.22, h: 0.2, d: 0.22, x: cx, y: cy, z: cz, color: 0x18181b, roughness: 0.9 });
    }
    addEyes(0.27, 0.25, 0x292524);
    // Arms (White sleeves + Captain Armband on Left Arm)
    v(leftArmPivot, { w: 0.19, h: 0.24, d: 0.19, x: 0, y: -0.1, z: 0, color: 0xf8fafc, roughness: 0.62 });
    v(leftArmPivot, { w: 0.2, h: 0.08, d: 0.2, x: 0, y: -0.14, z: 0, color: 0xfacc15, roughness: 0.4 });
    v(leftArmPivot, { w: 0.16, h: 0.24, d: 0.16, x: 0, y: -0.34, z: 0, color: 0xdba885, roughness: 0.72 });
    v(rightArmPivot, { w: 0.19, h: 0.24, d: 0.19, x: 0, y: -0.1, z: 0, color: 0x38bdf8, roughness: 0.62 });
    v(rightArmPivot, { w: 0.16, h: 0.24, d: 0.16, x: 0, y: -0.34, z: 0, color: 0xdba885, roughness: 0.72 });
    // Legs (Black shorts + White socks + Black classic cleats)
    v(leftLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0x0f172a, roughness: 0.72 });
    v(leftLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0xdba885 });
    v(leftLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.41, z: 0, color: 0xf8fafc });
    v(leftLegPivot, { w: 0.22, h: 0.14, d: 0.3, x: 0, y: -0.55, z: 0.04, color: 0x020617, roughness: 0.4 });
    v(rightLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0x0f172a, roughness: 0.72 });
    v(rightLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0xdba885 });
    v(rightLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.41, z: 0, color: 0xf8fafc });
    v(rightLegPivot, { w: 0.22, h: 0.14, d: 0.3, x: 0, y: -0.55, z: 0.04, color: 0x020617, roughness: 0.4 });
  } else if (skin === 'messi') {
    // Messi: Uniforme Albiceleste Moderno #10 Dourado, Barba Aparada & Chuteiras Douradas
    v(torsoPivot, { w: 0.55, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xf8fafc, roughness: 0.58 });
    v(torsoPivot, { w: 0.15, h: 0.58, d: 0.335, x: -0.17, y: 0.3, z: 0, color: 0x0ea5e9, roughness: 0.55 });
    v(torsoPivot, { w: 0.15, h: 0.58, d: 0.335, x: 0.17, y: 0.3, z: 0, color: 0x0ea5e9, roughness: 0.55 });
    v(torsoPivot, { w: 0.12, h: 0.58, d: 0.335, x: 0, y: 0.3, z: 0, color: 0x0ea5e9, roughness: 0.55 });
    // Gold Champion Patch & #10
    v(torsoPivot, { w: 0.1, h: 0.12, d: 0.03, x: 0, y: 0.44, z: 0.175, color: 0xfacc15, metalness: 0.82, roughness: 0.2 });
    v(torsoPivot, { w: 0.05, h: 0.22, d: 0.03, x: -0.09, y: 0.28, z: -0.175, color: 0xfacc15, metalness: 0.7 });
    v(torsoPivot, { w: 0.12, h: 0.22, d: 0.03, x: 0.07, y: 0.28, z: -0.175, color: 0xfacc15, metalness: 0.7 });
    v(torsoPivot, { w: 0.05, h: 0.12, d: 0.04, x: 0.07, y: 0.28, z: -0.18, color: 0x0ea5e9 });
    // Head + Styled Brown Hair + Trimmed Beard
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xebc09e, roughness: 0.7 });
    v(headPivot, { w: 0.5, h: 0.13, d: 0.5, x: 0, y: 0.49, z: 0, color: 0x451a03, roughness: 0.65 });
    v(headPivot, { w: 0.32, h: 0.09, d: 0.16, x: 0.04, y: 0.54, z: 0.12, color: 0x572408, rz: -0.12 });
    v(headPivot, { w: 0.49, h: 0.22, d: 0.12, x: 0, y: 0.36, z: -0.2, color: 0x451a03, roughness: 0.7 });
    // Trimmed Beard & Mustache
    v(headPivot, { w: 0.46, h: 0.13, d: 0.14, x: 0, y: 0.08, z: 0.2, color: 0x451a03, roughness: 0.78 });
    v(headPivot, { w: 0.22, h: 0.05, d: 0.04, x: 0, y: 0.16, z: 0.245, color: 0x451a03 });
    addEyes(0.28, 0.25, 0x3f2e21);
    buildLimbs(0xebc09e, 0x0ea5e9, 0x0f172a, 0xfacc15, 0xf8fafc, 0.58);
    // Gold Metallic Boots Upgrade
    v(leftLegPivot, { w: 0.23, h: 0.16, d: 0.31, x: 0, y: -0.54, z: 0.04, color: 0xfacc15, metalness: 0.88, roughness: 0.2 });
    v(rightLegPivot, { w: 0.23, h: 0.16, d: 0.31, x: 0, y: -0.54, z: 0.04, color: 0xfacc15, metalness: 0.88, roughness: 0.2 });
  } else if (skin === 'neymar_atual') {
    // Neymar Atual: Camisa Branca/Azul #10 Moderna, Faixa na Testa, Cabelo Descolorido e Tatuagens
    v(torsoPivot, { w: 0.54, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xf8fafc, roughness: 0.56 });
    v(torsoPivot, { w: 0.55, h: 0.16, d: 0.33, x: 0, y: 0.5, z: 0, color: 0x0284c7, roughness: 0.52 });
    v(torsoPivot, { w: 0.18, h: 0.06, d: 0.34, x: 0, y: 0.38, z: 0, color: 0xfacc15, metalness: 0.5 });
    // #10 on back
    v(torsoPivot, { w: 0.05, h: 0.22, d: 0.03, x: -0.09, y: 0.26, z: -0.175, color: 0x0284c7 });
    v(torsoPivot, { w: 0.12, h: 0.22, d: 0.03, x: 0.07, y: 0.26, z: -0.175, color: 0x0284c7 });
    v(torsoPivot, { w: 0.05, h: 0.12, d: 0.04, x: 0.07, y: 0.26, z: -0.18, color: 0xf8fafc });
    // Head + White/Gold Headband + Bleached Hair + Goatee
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xd8a47f, roughness: 0.68 });
    v(headPivot, { w: 0.51, h: 0.09, d: 0.51, x: 0, y: 0.42, z: 0, color: 0xf8fafc, roughness: 0.45 }); // Headband
    v(headPivot, { w: 0.1, h: 0.06, d: 0.04, x: 0, y: 0.42, z: 0.255, color: 0xfacc15, metalness: 0.7 });
    v(headPivot, { w: 0.46, h: 0.12, d: 0.46, x: 0, y: 0.51, z: 0, color: 0xfde047, roughness: 0.72 }); // Bleached top
    v(headPivot, { w: 0.49, h: 0.16, d: 0.12, x: 0, y: 0.32, z: -0.2, color: 0x18181b, roughness: 0.75 });
    v(headPivot, { w: 0.16, h: 0.09, d: 0.05, x: 0, y: 0.07, z: 0.23, color: 0x18181b }); // Goatee
    addEyes(0.28, 0.25, 0x3b2f2f);
    // Arms with Tattooed Sleeves & Wrist Tape
    v(leftArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xf8fafc, roughness: 0.55 });
    v(leftArmPivot, { w: 0.165, h: 0.2, d: 0.165, x: 0, y: -0.29, z: 0, color: 0x334155, roughness: 0.7 }); // Tattoo sleeve
    v(leftArmPivot, { w: 0.175, h: 0.06, d: 0.175, x: 0, y: -0.4, z: 0, color: 0xf8fafc });
    v(leftArmPivot, { w: 0.16, h: 0.08, d: 0.16, x: 0, y: -0.46, z: 0, color: 0xd8a47f });
    v(rightArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xf8fafc, roughness: 0.55 });
    v(rightArmPivot, { w: 0.165, h: 0.2, d: 0.165, x: 0, y: -0.29, z: 0, color: 0x334155, roughness: 0.7 });
    v(rightArmPivot, { w: 0.175, h: 0.06, d: 0.175, x: 0, y: -0.4, z: 0, color: 0xf8fafc });
    v(rightArmPivot, { w: 0.16, h: 0.08, d: 0.16, x: 0, y: -0.46, z: 0, color: 0xd8a47f });
    // Legs (Dark shorts + White socks + Neon Lime/Gold Boots)
    v(leftLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0x0f172a, roughness: 0.7 });
    v(leftLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0xd8a47f });
    v(leftLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.41, z: 0, color: 0xf8fafc });
    v(leftLegPivot, { w: 0.22, h: 0.14, d: 0.3, x: 0, y: -0.55, z: 0.04, color: 0x84cc16, roughness: 0.35 });
    v(rightLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0x0f172a, roughness: 0.7 });
    v(rightLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0xd8a47f });
    v(rightLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.41, z: 0, color: 0xf8fafc });
    v(rightLegPivot, { w: 0.22, h: 0.14, d: 0.3, x: 0, y: -0.55, z: 0.04, color: 0x84cc16, roughness: 0.35 });
  } else if (skin === 'hacker') {
    // Hacker: Capuz Sombrio, Máscara Matrix Neon Verde, Mochila Cyber e Cubos de Dados Orbitando
    v(torsoPivot, { w: 0.58, h: 0.6, d: 0.36, x: 0, y: 0.3, z: 0, color: 0x09090b, roughness: 0.78 });
    v(torsoPivot, { w: 0.6, h: 0.12, d: 0.38, x: 0, y: 0.56, z: -0.02, color: 0x18181b, roughness: 0.8 }); // Hood collar
    // Neon green matrix chest circuit + hoodie strings
    v(torsoPivot, { w: 0.26, h: 0.06, d: 0.04, x: 0, y: 0.34, z: 0.19, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.6 });
    v(torsoPivot, { w: 0.04, h: 0.22, d: 0.04, x: -0.09, y: 0.44, z: 0.19, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.1 });
    v(torsoPivot, { w: 0.04, h: 0.22, d: 0.04, x: 0.09, y: 0.44, z: 0.19, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.1 });
    // Cyber Laptop Backpack
    v(torsoPivot, { w: 0.42, h: 0.46, d: 0.18, x: 0, y: 0.31, z: -0.25, color: 0x18181b, roughness: 0.55 });
    v(torsoPivot, { w: 0.32, h: 0.06, d: 0.04, x: 0, y: 0.42, z: -0.35, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.8 });
    // Deep Dark Hood + Glowing Neon Hacker Mask
    v(headPivot, { w: 0.56, h: 0.54, d: 0.54, x: 0, y: 0.27, z: -0.02, color: 0x09090b, roughness: 0.82 });
    v(headPivot, { w: 0.44, h: 0.42, d: 0.08, x: 0, y: 0.25, z: 0.24, color: 0x18181b, roughness: 0.35 });
    v(headPivot, { w: 0.14, h: 0.06, d: 0.04, x: -0.11, y: 0.31, z: 0.28, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 2.0, rz: -0.18 });
    v(headPivot, { w: 0.14, h: 0.06, d: 0.04, x: 0.11, y: 0.31, z: 0.28, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 2.0, rz: 0.18 });
    v(headPivot, { w: 0.22, h: 0.04, d: 0.04, x: 0, y: 0.14, z: 0.28, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.7 });
    buildLimbs(0x18181b, 0x09090b, 0x18181b, 0x09090b, 0x22c55e, 0.78);
    // Orbiting Neon Data Bits
    auraParticles = [];
    for (let i = 0; i < 4; i++) {
      const m = v(root, { w: 0.08, h: 0.08, d: 0.08, x: 0, y: 1.0, z: 0, color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.9 });
      m.castShadow = false;
      auraParticles.push({ mesh: m, radius: 0.72, heightOffset: 0.5 + (i % 2) * 0.55, speed: 2.4, angle: (i / 4) * Math.PI * 2 });
    }
  } else if (skin === 'bandido') {
    // Bandido: Camisa Listrada P&B, Balaclava Preta, Gorro & Saco de Dinheiro nas Costas
    v(torsoPivot, { w: 0.55, h: 0.58, d: 0.33, x: 0, y: 0.3, z: 0, color: 0xf8fafc, roughness: 0.72 });
    v(torsoPivot, { w: 0.56, h: 0.1, d: 0.34, x: 0, y: 0.5, z: 0, color: 0x0f172a, roughness: 0.75 });
    v(torsoPivot, { w: 0.56, h: 0.1, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x0f172a, roughness: 0.75 });
    v(torsoPivot, { w: 0.56, h: 0.1, d: 0.34, x: 0, y: 0.1, z: 0, color: 0x0f172a, roughness: 0.75 });
    // Brown Heist Belt
    v(torsoPivot, { w: 0.58, h: 0.08, d: 0.36, x: 0, y: 0.04, z: 0, color: 0x78350f, roughness: 0.6 });
    v(torsoPivot, { w: 0.1, h: 0.09, d: 0.04, x: 0, y: 0.04, z: 0.185, color: 0xfacc15, metalness: 0.8 });
    // Loot Sack on Back with Dollar Sign & Gold Coins Peeking Out
    v(torsoPivot, { w: 0.44, h: 0.46, d: 0.28, x: 0, y: 0.31, z: -0.29, color: 0xd6d3d1, roughness: 0.88 });
    v(torsoPivot, { w: 0.16, h: 0.16, d: 0.04, x: 0, y: 0.3, z: -0.44, color: 0x16a34a }); // $ badge
    v(torsoPivot, { w: 0.2, h: 0.09, d: 0.16, x: 0, y: 0.56, z: -0.28, color: 0xfacc15, metalness: 0.85 }); // Gold loot top
    // Head + Black Knit Beanie + Balaclava Mask
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0x09090b, roughness: 0.84 });
    v(headPivot, { w: 0.38, h: 0.14, d: 0.06, x: 0, y: 0.27, z: 0.23, color: 0xe8be9e, roughness: 0.7 }); // Eye slit
    v(headPivot, { w: 0.52, h: 0.16, d: 0.52, x: 0, y: 0.49, z: 0, color: 0x1e293b, roughness: 0.85 }); // Knit beanie
    v(headPivot, { w: 0.53, h: 0.08, d: 0.53, x: 0, y: 0.42, z: 0, color: 0x0f172a, roughness: 0.85 });
    addEyes(0.28, 0.26, 0x0f172a);
    buildLimbs(0x09090b, 0x0f172a, 0x1e293b, 0x020617, 0x475569, 0.78);
  } else if (skin === 'ghost_face') {
    // Ghost Face: Manto Sombrio, Capuz Longo, Máscara Branca Icônica & Lâmina Metálica
    v(torsoPivot, { w: 0.6, h: 0.64, d: 0.38, x: 0, y: 0.29, z: 0, color: 0x09090b, roughness: 0.9 });
    v(torsoPivot, { w: 0.56, h: 0.24, d: 0.36, x: 0, y: -0.02, z: 0, color: 0x18181b, roughness: 0.9 }); // Draped robe skirt
    // Deep Black Reaper Hood + Elongated White Mask
    v(headPivot, { w: 0.58, h: 0.56, d: 0.56, x: 0, y: 0.28, z: -0.02, color: 0x020617, roughness: 0.92 });
    v(headPivot, { w: 0.4, h: 0.48, d: 0.1, x: 0, y: 0.23, z: 0.24, color: 0xf8fafc, roughness: 0.3 });
    v(headPivot, { w: 0.28, h: 0.12, d: 0.1, x: 0, y: 0.04, z: 0.24, color: 0xf8fafc, roughness: 0.3 }); // Elongated chin
    // Hollow Ghost Eyes & Iconic Screaming Mouth
    v(headPivot, { w: 0.12, h: 0.12, d: 0.05, x: -0.1, y: 0.3, z: 0.285, color: 0x020617, rz: 0.35 });
    v(headPivot, { w: 0.12, h: 0.12, d: 0.05, x: 0.1, y: 0.3, z: 0.285, color: 0x020617, rz: -0.35 });
    v(headPivot, { w: 0.06, h: 0.06, d: 0.05, x: 0, y: 0.2, z: 0.285, color: 0x020617 }); // Nose
    v(headPivot, { w: 0.12, h: 0.2, d: 0.05, x: 0, y: 0.06, z: 0.285, color: 0x020617 }); // Screaming oval mouth
    // Wide Draped Robe Sleeves & Black Gloves
    v(leftArmPivot, { w: 0.22, h: 0.38, d: 0.24, x: 0, y: -0.18, z: 0, color: 0x09090b, roughness: 0.9 });
    v(leftArmPivot, { w: 0.14, h: 0.12, d: 0.14, x: 0, y: -0.43, z: 0, color: 0x020617, roughness: 0.7 });
    v(rightArmPivot, { w: 0.22, h: 0.38, d: 0.24, x: 0, y: -0.18, z: 0, color: 0x09090b, roughness: 0.9 });
    v(rightArmPivot, { w: 0.14, h: 0.12, d: 0.14, x: 0, y: -0.43, z: 0, color: 0x020617, roughness: 0.7 });
    // Shiny Silver Prop Blade in Right Hand
    v(rightArmPivot, { w: 0.06, h: 0.08, d: 0.14, x: 0, y: -0.46, z: 0.08, color: 0x18181b, roughness: 0.6 });
    v(rightArmPivot, { w: 0.04, h: 0.09, d: 0.36, x: 0, y: -0.44, z: 0.31, color: 0xe2e8f0, metalness: 0.92, roughness: 0.15 });
    // Dark Robe Lower Legs & Boots
    v(leftLegPivot, { w: 0.21, h: 0.4, d: 0.21, x: 0, y: -0.22, z: 0, color: 0x09090b, roughness: 0.9 });
    v(leftLegPivot, { w: 0.22, h: 0.16, d: 0.3, x: 0, y: -0.54, z: 0.04, color: 0x020617, roughness: 0.5 });
    v(rightLegPivot, { w: 0.21, h: 0.4, d: 0.21, x: 0, y: -0.22, z: 0, color: 0x09090b, roughness: 0.9 });
    v(rightLegPivot, { w: 0.22, h: 0.16, d: 0.3, x: 0, y: -0.54, z: 0.04, color: 0x020617, roughness: 0.5 });
    // Flowing Tattered Reaper Cape
    capePivot = new THREE.Group();
    capePivot.position.set(0, 0.58, -0.2);
    torsoPivot.add(capePivot);
    v(capePivot, { w: 0.62, h: 0.92, d: 0.05, x: 0, y: -0.44, z: -0.04, color: 0x09090b, roughness: 0.92, rx: 0.18 });
    v(capePivot, { w: 0.48, h: 0.16, d: 0.05, x: 0, y: -0.92, z: -0.04, color: 0x18181b, roughness: 0.92, rx: 0.18 });
  } else if (skin === 'shrek') {
    // SHREK: Large green ogre, wide head, tubular side ears, brown vest, beige shirt, brown pants, dark boots
    // Beige long-sleeve tunic base + open brown leather vest
    v(torsoPivot, { w: 0.64, h: 0.6, d: 0.38, x: 0, y: 0.3, z: 0, color: 0xe7e5e4, roughness: 0.86 });
    v(torsoPivot, { w: 0.22, h: 0.58, d: 0.4, x: -0.22, y: 0.3, z: 0, color: 0x5c3317, roughness: 0.72 }); // Left vest
    v(torsoPivot, { w: 0.22, h: 0.58, d: 0.4, x: 0.22, y: 0.3, z: 0, color: 0x5c3317, roughness: 0.72 }); // Right vest
    v(torsoPivot, { w: 0.66, h: 0.58, d: 0.14, x: 0, y: 0.3, z: -0.14, color: 0x5c3317, roughness: 0.72 }); // Vest back
    v(torsoPivot, { w: 0.18, h: 0.05, d: 0.04, x: 0, y: 0.34, z: 0.195, color: 0x78350f }); // Vest lacing
    v(torsoPivot, { w: 0.18, h: 0.05, d: 0.04, x: 0, y: 0.22, z: 0.195, color: 0x78350f });
    v(torsoPivot, { w: 0.68, h: 0.09, d: 0.42, x: 0, y: 0.06, z: 0, color: 0x3f230e, roughness: 0.6 }); // Belt
    v(torsoPivot, { w: 0.14, h: 0.11, d: 0.04, x: 0, y: 0.06, z: 0.215, color: 0xa16207, metalness: 0.65 }); // Brass buckle
    // Wide Green Ogre Head & Confident Face
    v(headPivot, { w: 0.56, h: 0.48, d: 0.52, x: 0, y: 0.25, z: 0, color: 0x84cc16, roughness: 0.72 });
    v(headPivot, { w: 0.5, h: 0.16, d: 0.5, x: 0, y: 0.1, z: 0.02, color: 0x65a30d, roughness: 0.74 }); // Broad jaw
    // Tubular Trumpet Side Ears
    addCyl(headPivot, { rt: 0.05, rb: 0.04, h: 0.18, x: -0.34, y: 0.37, z: -0.02, color: 0x84cc16, roughness: 0.7, rz: 1.05 });
    addCyl(headPivot, { rt: 0.08, rb: 0.045, h: 0.09, x: -0.43, y: 0.42, z: -0.02, color: 0x65a30d, roughness: 0.68, rz: 1.05 });
    addCyl(headPivot, { rt: 0.038, rb: 0.03, h: 0.04, x: -0.46, y: 0.435, z: -0.02, color: 0x365314, roughness: 0.85, rz: 1.05 });
    addCyl(headPivot, { rt: 0.05, rb: 0.04, h: 0.18, x: 0.34, y: 0.37, z: -0.02, color: 0x84cc16, roughness: 0.7, rz: -1.05 });
    addCyl(headPivot, { rt: 0.08, rb: 0.045, h: 0.09, x: 0.43, y: 0.42, z: -0.02, color: 0x65a30d, roughness: 0.68, rz: -1.05 });
    addCyl(headPivot, { rt: 0.038, rb: 0.03, h: 0.04, x: 0.46, y: 0.435, z: -0.02, color: 0x365314, roughness: 0.85, rz: -1.05 });
    // Wide Ogre Nose & Thick Confident Eyebrows
    v(headPivot, { w: 0.17, h: 0.12, d: 0.14, x: 0, y: 0.21, z: 0.29, color: 0x65a30d, roughness: 0.68 });
    addEyes(0.3, 0.27, 0x78350f, 0xfefce8);
    v(headPivot, { w: 0.16, h: 0.06, d: 0.05, x: -0.12, y: 0.39, z: 0.275, color: 0x365314, rz: -0.15 });
    v(headPivot, { w: 0.16, h: 0.06, d: 0.05, x: 0.12, y: 0.41, z: 0.275, color: 0x365314, rz: 0.26 }); // Cocked brow
    // Funny Confident Crooked Grin
    v(headPivot, { w: 0.24, h: 0.04, d: 0.04, x: 0.02, y: 0.1, z: 0.275, color: 0x365314, rz: 0.08 });
    v(headPivot, { w: 0.06, h: 0.05, d: 0.04, x: 0.11, y: 0.12, z: 0.278, color: 0xfef9c3 });
    // Arms (slightly offset outward so wide vest doesn't clip sleeves)
    v(leftArmPivot, { w: 0.2, h: 0.28, d: 0.2, x: -0.07, y: -0.11, z: 0, color: 0xe7e5e4, roughness: 0.86 });
    v(leftArmPivot, { w: 0.19, h: 0.12, d: 0.19, x: -0.07, y: -0.3, z: 0, color: 0xd6d3d1, roughness: 0.86 });
    v(leftArmPivot, { w: 0.18, h: 0.13, d: 0.18, x: -0.07, y: -0.42, z: 0, color: 0x84cc16, roughness: 0.72 });
    v(rightArmPivot, { w: 0.2, h: 0.28, d: 0.2, x: 0.07, y: -0.11, z: 0, color: 0xe7e5e4, roughness: 0.86 });
    v(rightArmPivot, { w: 0.19, h: 0.12, d: 0.19, x: 0.07, y: -0.3, z: 0, color: 0xd6d3d1, roughness: 0.86 });
    v(rightArmPivot, { w: 0.18, h: 0.13, d: 0.18, x: 0.07, y: -0.42, z: 0, color: 0x84cc16, roughness: 0.72 });
    // Brown Trousers & Large Dark Boots
    v(leftLegPivot, { w: 0.23, h: 0.34, d: 0.23, x: -0.02, y: -0.2, z: 0, color: 0x5c3317, roughness: 0.8 });
    v(leftLegPivot, { w: 0.26, h: 0.22, d: 0.34, x: -0.02, y: -0.52, z: 0.04, color: 0x292524, roughness: 0.65 });
    v(leftLegPivot, { w: 0.27, h: 0.06, d: 0.27, x: -0.02, y: -0.39, z: 0, color: 0x451a03, roughness: 0.65 });
    v(rightLegPivot, { w: 0.23, h: 0.34, d: 0.23, x: 0.02, y: -0.2, z: 0, color: 0x5c3317, roughness: 0.8 });
    v(rightLegPivot, { w: 0.26, h: 0.22, d: 0.34, x: 0.02, y: -0.52, z: 0.04, color: 0x292524, roughness: 0.65 });
    v(rightLegPivot, { w: 0.27, h: 0.06, d: 0.27, x: 0.02, y: -0.39, z: 0, color: 0x451a03, roughness: 0.65 });
  } else if (skin === 'herobrine') {
    // HEROBRINE: Classic Minecraft blocky proportions, light-blue shirt, dark-blue pants, glowing white eyes + eye aura
    v(torsoPivot, { w: 0.52, h: 0.58, d: 0.28, x: 0, y: 0.3, z: 0, color: 0x06b6d4, roughness: 0.72 });
    v(torsoPivot, { w: 0.2, h: 0.08, d: 0.29, x: 0, y: 0.56, z: 0.01, color: 0xe2b18d, roughness: 0.72 }); // Collar skin V
    v(torsoPivot, { w: 0.14, h: 0.08, d: 0.03, x: 0.14, y: 0.04, z: 0.145, color: 0x0284c7 }); // Shirt tuck detail
    // Blocky Minecraft Head + Brown Hair + Glowing Pure-White Eyes
    v(headPivot, { w: 0.48, h: 0.48, d: 0.48, x: 0, y: 0.25, z: 0, color: 0xe2b18d, roughness: 0.72 });
    v(headPivot, { w: 0.5, h: 0.13, d: 0.5, x: 0, y: 0.46, z: 0, color: 0x4a2c18, roughness: 0.84 }); // Top hair
    v(headPivot, { w: 0.5, h: 0.1, d: 0.12, x: 0, y: 0.38, z: 0.2, color: 0x4a2c18, roughness: 0.84 }); // Forehead fringe
    v(headPivot, { w: 0.5, h: 0.3, d: 0.14, x: 0, y: 0.31, z: -0.18, color: 0x4a2c18, roughness: 0.84 }); // Back hair
    v(headPivot, { w: 0.08, h: 0.14, d: 0.12, x: -0.23, y: 0.36, z: 0.06, color: 0x4a2c18 });
    v(headPivot, { w: 0.08, h: 0.14, d: 0.12, x: 0.23, y: 0.36, z: 0.06, color: 0x4a2c18 });
    // Nose & mysterious stern beard-line
    v(headPivot, { w: 0.1, h: 0.06, d: 0.03, x: 0, y: 0.18, z: 0.245, color: 0xc89572 });
    v(headPivot, { w: 0.22, h: 0.08, d: 0.03, x: 0, y: 0.09, z: 0.245, color: 0x7c4a2d });
    // Pure White Glowing Herobrine Eyes (No Pupils!)
    v(headPivot, {
      w: 0.13,
      h: 0.055,
      d: 0.04,
      x: -0.11,
      y: 0.24,
      z: 0.245,
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.6,
      roughness: 0.08,
    });
    v(headPivot, {
      w: 0.13,
      h: 0.055,
      d: 0.04,
      x: 0.11,
      y: 0.24,
      z: 0.245,
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.6,
      roughness: 0.08,
    });
    // Subtle white glowing particles near eyes/head
    eyeAuraParticles = [];
    const eyeParticleOffsets: [number, number, number][] = [
      [-0.22, 0.26, 0.28],
      [0.22, 0.26, 0.28],
      [-0.14, 0.36, 0.3],
      [0.14, 0.36, 0.3],
      [0, 0.56, 0.16],
    ];
    eyeParticleOffsets.forEach(([px, py, pz], idx) => {
      const m = v(headPivot, {
        w: 0.045,
        h: 0.045,
        d: 0.045,
        x: px,
        y: py,
        z: pz,
        color: 0xffffff,
        emissive: 0xe0f2fe,
        emissiveIntensity: 2.2,
        roughness: 0.1,
      });
      m.castShadow = false;
      eyeAuraParticles!.push({ mesh: m, baseX: px, baseY: py, baseZ: pz, phase: idx * 1.3 });
    });
    // Blocky Minecraft Limbs (Light-blue short sleeves, light skin arms, dark blue pants)
    v(leftArmPivot, { w: 0.2, h: 0.2, d: 0.2, x: 0, y: -0.07, z: 0, color: 0x06b6d4, roughness: 0.72 });
    v(leftArmPivot, { w: 0.19, h: 0.34, d: 0.19, x: 0, y: -0.34, z: 0, color: 0xe2b18d, roughness: 0.72 });
    v(rightArmPivot, { w: 0.2, h: 0.2, d: 0.2, x: 0, y: -0.07, z: 0, color: 0x06b6d4, roughness: 0.72 });
    v(rightArmPivot, { w: 0.19, h: 0.34, d: 0.19, x: 0, y: -0.34, z: 0, color: 0xe2b18d, roughness: 0.72 });
    v(leftLegPivot, { w: 0.22, h: 0.44, d: 0.24, x: 0, y: -0.24, z: 0, color: 0x1e3a8a, roughness: 0.76 });
    v(leftLegPivot, { w: 0.225, h: 0.16, d: 0.26, x: 0, y: -0.55, z: 0.01, color: 0x475569, roughness: 0.55 });
    v(rightLegPivot, { w: 0.22, h: 0.44, d: 0.24, x: 0, y: -0.24, z: 0, color: 0x1e3a8a, roughness: 0.76 });
    v(rightLegPivot, { w: 0.225, h: 0.16, d: 0.26, x: 0, y: -0.55, z: 0.01, color: 0x475569, roughness: 0.55 });
  } else if (skin === 'freddy_fazbear') {
    // FREDDY FAZBEAR: Brown animatronic bear, black top hat, bow tie, beige snout, teeth, eyelids & microphone
    v(torsoPivot, { w: 0.58, h: 0.58, d: 0.36, x: 0, y: 0.3, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(torsoPivot, { w: 0.4, h: 0.4, d: 0.05, x: 0, y: 0.27, z: 0.175, color: 0xd2a679, roughness: 0.58 }); // Tan belly
    v(torsoPivot, { w: 0.52, h: 0.1, d: 0.32, x: 0, y: 0.04, z: 0, color: 0x334155, metalness: 0.75, roughness: 0.3 }); // Endo waist
    // Black Bow Tie
    v(torsoPivot, { w: 0.11, h: 0.09, d: 0.05, x: -0.08, y: 0.52, z: 0.195, color: 0x09090b, roughness: 0.3, rz: 0.15 });
    v(torsoPivot, { w: 0.11, h: 0.09, d: 0.05, x: 0.08, y: 0.52, z: 0.195, color: 0x09090b, roughness: 0.3, rz: -0.15 });
    v(torsoPivot, { w: 0.07, h: 0.06, d: 0.06, x: 0, y: 0.52, z: 0.2, color: 0x18181b, roughness: 0.25 });
    // Animatronic Bear Head, Jaw, Subtle Teeth, Snout, Blinking Eyes & Top Hat
    v(headPivot, { w: 0.52, h: 0.38, d: 0.48, x: 0, y: 0.32, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(headPivot, { w: 0.56, h: 0.16, d: 0.44, x: 0, y: 0.21, z: 0.01, color: 0x7c3f1c, roughness: 0.52 }); // Cheekplates
    // Articulated Jaw + Subtle Teeth
    v(headPivot, { w: 0.4, h: 0.09, d: 0.28, x: 0, y: 0.06, z: 0.12, color: 0x6b3416, roughness: 0.55 });
    v(headPivot, { w: 0.28, h: 0.05, d: 0.04, x: 0, y: 0.12, z: 0.25, color: 0x09090b }); // Mouth interior
    for (const tx of [-0.09, -0.03, 0.03, 0.09]) {
      v(headPivot, { w: 0.04, h: 0.035, d: 0.03, x: tx, y: 0.105, z: 0.265, color: 0xf8fafc, roughness: 0.25 });
    }
    // Tan Snout + Shiny Black Nose
    v(headPivot, { w: 0.36, h: 0.15, d: 0.16, x: 0, y: 0.18, z: 0.27, color: 0xd2a679, roughness: 0.55 });
    v(headPivot, { w: 0.12, h: 0.07, d: 0.07, x: 0, y: 0.24, z: 0.35, color: 0x09090b, roughness: 0.15 });
    // Eye Sockets, Blue Animatronic Eyes & Blinking Eyelids
    v(headPivot, { w: 0.14, h: 0.12, d: 0.04, x: -0.12, y: 0.31, z: 0.238, color: 0x09090b });
    v(headPivot, { w: 0.14, h: 0.12, d: 0.04, x: 0.12, y: 0.31, z: 0.238, color: 0x09090b });
    addEyes(0.31, 0.245, 0x38bdf8, 0xf8fafc);
    const lidL = v(headPivot, { w: 0.14, h: 0.12, d: 0.06, x: -0.12, y: 0.36, z: 0.25, color: 0x6b3416, roughness: 0.55 });
    const lidR = v(headPivot, { w: 0.14, h: 0.12, d: 0.06, x: 0.12, y: 0.36, z: 0.25, color: 0x6b3416, roughness: 0.55 });
    lidL.scale.y = 0.18;
    lidR.scale.y = 0.18;
    blinkLids = [lidL, lidR];
    v(headPivot, { w: 0.14, h: 0.04, d: 0.05, x: -0.12, y: 0.4, z: 0.255, color: 0x09090b, rz: 0.12 });
    v(headPivot, { w: 0.14, h: 0.04, d: 0.05, x: 0.12, y: 0.4, z: 0.255, color: 0x09090b, rz: -0.12 });
    // Bear Ears on Metallic Endo Stems
    v(headPivot, { w: 0.05, h: 0.08, d: 0.05, x: -0.23, y: 0.5, z: 0, color: 0x334155, metalness: 0.8 });
    v(headPivot, { w: 0.16, h: 0.16, d: 0.07, x: -0.26, y: 0.56, z: 0, color: 0x7c3f1c, roughness: 0.55 });
    v(headPivot, { w: 0.09, h: 0.09, d: 0.08, x: -0.26, y: 0.56, z: 0.01, color: 0xd2a679, roughness: 0.6 });
    v(headPivot, { w: 0.05, h: 0.08, d: 0.05, x: 0.23, y: 0.5, z: 0, color: 0x334155, metalness: 0.8 });
    v(headPivot, { w: 0.16, h: 0.16, d: 0.07, x: 0.26, y: 0.56, z: 0, color: 0x7c3f1c, roughness: 0.55 });
    v(headPivot, { w: 0.09, h: 0.09, d: 0.08, x: 0.26, y: 0.56, z: 0.01, color: 0xd2a679, roughness: 0.6 });
    // Small Black Top Hat
    addCyl(headPivot, { rt: 0.18, rb: 0.18, h: 0.03, x: 0, y: 0.525, z: 0, color: 0x18181b, roughness: 0.35 });
    addCyl(headPivot, { rt: 0.125, rb: 0.115, h: 0.18, x: 0, y: 0.62, z: 0, color: 0x18181b, roughness: 0.35 });
    addCyl(headPivot, { rt: 0.122, rb: 0.12, h: 0.035, x: 0, y: 0.555, z: 0, color: 0x3f3f46, roughness: 0.3 });
    // Segmented Animatronic Arms & Legs + Endo Joints
    v(leftArmPivot, { w: 0.19, h: 0.2, d: 0.19, x: -0.02, y: -0.09, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(leftArmPivot, { w: 0.11, h: 0.08, d: 0.11, x: -0.02, y: -0.22, z: 0, color: 0x334155, metalness: 0.78 });
    v(leftArmPivot, { w: 0.18, h: 0.22, d: 0.18, x: -0.02, y: -0.35, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(rightArmPivot, { w: 0.19, h: 0.2, d: 0.19, x: 0.02, y: -0.09, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(rightArmPivot, { w: 0.11, h: 0.08, d: 0.11, x: 0.02, y: -0.22, z: 0, color: 0x334155, metalness: 0.78 });
    v(rightArmPivot, { w: 0.18, h: 0.22, d: 0.18, x: 0.02, y: -0.35, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    // Classic Black & Silver Microphone in Right Hand
    addCyl(rightArmPivot, { rt: 0.03, rb: 0.025, h: 0.24, x: 0.02, y: -0.43, z: 0.12, color: 0x09090b, roughness: 0.35, rx: 1.05 });
    addCyl(rightArmPivot, { rt: 0.055, rb: 0.045, h: 0.08, x: 0.02, y: -0.38, z: 0.24, color: 0xcbd5e1, metalness: 0.85, roughness: 0.25, rx: 1.05 });
    v(leftLegPivot, { w: 0.22, h: 0.22, d: 0.22, x: 0, y: -0.14, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(leftLegPivot, { w: 0.13, h: 0.08, d: 0.13, x: 0, y: -0.28, z: 0, color: 0x334155, metalness: 0.78 });
    v(leftLegPivot, { w: 0.21, h: 0.16, d: 0.21, x: 0, y: -0.39, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(leftLegPivot, { w: 0.24, h: 0.16, d: 0.32, x: 0, y: -0.55, z: 0.04, color: 0x5c2e14, roughness: 0.58 });
    v(rightLegPivot, { w: 0.22, h: 0.22, d: 0.22, x: 0, y: -0.14, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(rightLegPivot, { w: 0.13, h: 0.08, d: 0.13, x: 0, y: -0.28, z: 0, color: 0x334155, metalness: 0.78 });
    v(rightLegPivot, { w: 0.21, h: 0.16, d: 0.21, x: 0, y: -0.39, z: 0, color: 0x7c3f1c, roughness: 0.52 });
    v(rightLegPivot, { w: 0.24, h: 0.16, d: 0.32, x: 0, y: -0.55, z: 0.04, color: 0x5c2e14, roughness: 0.58 });
  } else if (skin === 'sonic') {
    // SONIC: Blue body, backward quills, beige muzzle & belly, connected eyes, white gloves, red sneakers w/ white stripe & speed aura
    v(torsoPivot, { w: 0.48, h: 0.54, d: 0.3, x: 0, y: 0.28, z: 0, color: 0x2563eb, roughness: 0.4 });
    v(torsoPivot, { w: 0.32, h: 0.38, d: 0.05, x: 0, y: 0.25, z: 0.145, color: 0xf3cfa4, roughness: 0.65 }); // Tan belly
    // Back Quills & Tail Spike
    v(torsoPivot, { w: 0.16, h: 0.16, d: 0.34, x: 0, y: 0.42, z: -0.24, color: 0x1d4ed8, roughness: 0.38, rx: 0.45 });
    v(torsoPivot, { w: 0.14, h: 0.14, d: 0.3, x: 0, y: 0.26, z: -0.22, color: 0x1d4ed8, roughness: 0.38, rx: 0.3 });
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.22, x: 0, y: 0.09, z: -0.22, color: 0x2563eb, rx: 0.25 }); // Pointy tail
    // Sonic Head + 5 Signature Backward-Swept Quills + Pointed Ears
    v(headPivot, { w: 0.48, h: 0.46, d: 0.46, x: 0, y: 0.25, z: 0, color: 0x2563eb, roughness: 0.4 });
    v(headPivot, { w: 0.18, h: 0.2, d: 0.48, x: 0, y: 0.42, z: -0.26, color: 0x2563eb, roughness: 0.38, rx: -0.25 });
    v(headPivot, { w: 0.15, h: 0.17, d: 0.44, x: -0.15, y: 0.35, z: -0.26, color: 0x1d4ed8, roughness: 0.38, rx: -0.35, ry: -0.2 });
    v(headPivot, { w: 0.15, h: 0.17, d: 0.44, x: 0.15, y: 0.35, z: -0.26, color: 0x1d4ed8, roughness: 0.38, rx: -0.35, ry: 0.2 });
    v(headPivot, { w: 0.14, h: 0.14, d: 0.38, x: 0, y: 0.22, z: -0.28, color: 0x1d4ed8, roughness: 0.38, rx: -0.5 });
    // Triangular Blue/Tan Ears
    v(headPivot, { w: 0.12, h: 0.18, d: 0.08, x: -0.18, y: 0.54, z: 0.05, color: 0x2563eb, rz: 0.22 });
    v(headPivot, { w: 0.06, h: 0.1, d: 0.04, x: -0.18, y: 0.52, z: 0.085, color: 0xf3cfa4, rz: 0.22 });
    v(headPivot, { w: 0.12, h: 0.18, d: 0.08, x: 0.18, y: 0.54, z: 0.05, color: 0x2563eb, rz: -0.22 });
    v(headPivot, { w: 0.06, h: 0.1, d: 0.04, x: 0.18, y: 0.52, z: 0.085, color: 0xf3cfa4, rz: -0.22 });
    // Tan Muzzle + Pointy Black Nose + Large Connected Eyes
    v(headPivot, { w: 0.38, h: 0.16, d: 0.16, x: 0, y: 0.14, z: 0.23, color: 0xf3cfa4, roughness: 0.62 });
    v(headPivot, { w: 0.08, h: 0.07, d: 0.1, x: 0, y: 0.2, z: 0.33, color: 0x09090b, roughness: 0.18 });
    v(headPivot, { w: 0.36, h: 0.19, d: 0.05, x: 0, y: 0.29, z: 0.23, color: 0xf8fafc, roughness: 0.2 }); // Connected white eyes
    v(headPivot, { w: 0.08, h: 0.13, d: 0.05, x: -0.09, y: 0.29, z: 0.245, color: 0x16a34a, roughness: 0.18 });
    v(headPivot, { w: 0.08, h: 0.13, d: 0.05, x: 0.09, y: 0.29, z: 0.245, color: 0x16a34a, roughness: 0.18 });
    v(headPivot, { w: 0.045, h: 0.08, d: 0.05, x: -0.09, y: 0.29, z: 0.252, color: 0x09090b });
    v(headPivot, { w: 0.045, h: 0.08, d: 0.05, x: 0.09, y: 0.29, z: 0.252, color: 0x09090b });
    // Tan Slender Arms + Chunky White Gloves
    v(leftArmPivot, { w: 0.14, h: 0.3, d: 0.14, x: 0.02, y: -0.14, z: 0, color: 0xf3cfa4, roughness: 0.65 });
    v(leftArmPivot, { w: 0.21, h: 0.08, d: 0.21, x: 0.02, y: -0.32, z: 0, color: 0xf8fafc, roughness: 0.45 });
    v(leftArmPivot, { w: 0.19, h: 0.15, d: 0.19, x: 0.02, y: -0.43, z: 0, color: 0xf8fafc, roughness: 0.45 });
    v(rightArmPivot, { w: 0.14, h: 0.3, d: 0.14, x: -0.02, y: -0.14, z: 0, color: 0xf3cfa4, roughness: 0.65 });
    v(rightArmPivot, { w: 0.21, h: 0.08, d: 0.21, x: -0.02, y: -0.32, z: 0, color: 0xf8fafc, roughness: 0.45 });
    v(rightArmPivot, { w: 0.19, h: 0.15, d: 0.19, x: -0.02, y: -0.43, z: 0, color: 0xf8fafc, roughness: 0.45 });
    // Slender Blue Legs, Sock Cuffs & Iconic Red Sneakers with White Stripe + Gold Buckle
    for (const [legPivot] of [[leftLegPivot], [rightLegPivot]]) {
      v(legPivot, { w: 0.15, h: 0.34, d: 0.15, x: 0, y: -0.2, z: 0, color: 0x2563eb, roughness: 0.42 });
      v(legPivot, { w: 0.22, h: 0.08, d: 0.22, x: 0, y: -0.41, z: 0, color: 0xf8fafc, roughness: 0.5 });
      v(legPivot, { w: 0.24, h: 0.16, d: 0.33, x: 0, y: -0.54, z: 0.04, color: 0xdc2626, roughness: 0.35 });
      v(legPivot, { w: 0.25, h: 0.06, d: 0.1, x: 0, y: -0.53, z: 0.04, color: 0xf8fafc, roughness: 0.35 }); // White stripe
      v(legPivot, { w: 0.04, h: 0.06, d: 0.06, x: 0.13, y: -0.53, z: 0.04, color: 0xfacc15, metalness: 0.85, roughness: 0.2 }); // Gold buckle
      v(legPivot, { w: 0.25, h: 0.05, d: 0.34, x: 0, y: -0.63, z: 0.04, color: 0xf8fafc, roughness: 0.45 });
    }
    // Blue Speed Trail Particles
    speedTrailParticles = [];
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const bx = side * (0.28 + (i % 3) * 0.12);
      const by = 0.35 + (i % 3) * 0.42;
      const bz = -0.45 - i * 0.14;
      const m = v(root, {
        w: 0.08,
        h: 0.08,
        d: 0.26,
        x: bx,
        y: by,
        z: bz,
        color: 0x60a5fa,
        emissive: 0x38bdf8,
        emissiveIntensity: 2.0,
        roughness: 0.1,
      });
      m.castShadow = false;
      speedTrailParticles.push({ mesh: m, baseX: bx, baseY: by, baseZ: bz, phase: i * 1.05 });
    }
  } else if (skin === 'tung_tung_sahur') {
    // TUNG TUNG TUNG SAHUR: Elongated cylindrical brown wood humanoid, goofy big eyes, funny mouth & wooden bat
    addCyl(torsoPivot, { rt: 0.23, rb: 0.25, h: 0.64, x: 0, y: 0.32, z: 0, color: 0xb45309, roughness: 0.78 });
    addCyl(torsoPivot, { rt: 0.24, rb: 0.24, h: 0.06, x: 0, y: 0.16, z: 0, color: 0x92400e, roughness: 0.82 }); // Wood ring
    addCyl(torsoPivot, { rt: 0.235, rb: 0.235, h: 0.05, x: 0, y: 0.46, z: 0, color: 0x92400e, roughness: 0.82 });
    // Elongated Cylindrical Wooden Head
    addCyl(headPivot, { rt: 0.21, rb: 0.23, h: 0.56, x: 0, y: 0.28, z: 0, color: 0xb45309, roughness: 0.76 });
    addCyl(headPivot, { rt: 0.19, rb: 0.21, h: 0.05, x: 0, y: 0.57, z: 0, color: 0x78350f, roughness: 0.84 });
    // Funny Big Wide Eyes, Wood Nose & Expressive Open Mouth
    v(headPivot, { w: 0.14, h: 0.14, d: 0.05, x: -0.095, y: 0.35, z: 0.21, color: 0xf8fafc, roughness: 0.25 });
    v(headPivot, { w: 0.14, h: 0.14, d: 0.05, x: 0.095, y: 0.35, z: 0.21, color: 0xf8fafc, roughness: 0.25 });
    v(headPivot, { w: 0.06, h: 0.065, d: 0.05, x: -0.08, y: 0.35, z: 0.222, color: 0x09090b });
    v(headPivot, { w: 0.06, h: 0.065, d: 0.05, x: 0.11, y: 0.36, z: 0.222, color: 0x09090b }); // Slight goofy asymmetry
    v(headPivot, { w: 0.13, h: 0.035, d: 0.04, x: -0.095, y: 0.44, z: 0.21, color: 0x451a03, rz: 0.12 });
    v(headPivot, { w: 0.13, h: 0.035, d: 0.04, x: 0.095, y: 0.44, z: 0.21, color: 0x451a03, rz: -0.12 });
    v(headPivot, { w: 0.09, h: 0.08, d: 0.1, x: 0, y: 0.24, z: 0.25, color: 0x92400e, roughness: 0.78 }); // Wood nose
    v(headPivot, { w: 0.22, h: 0.13, d: 0.05, x: 0, y: 0.12, z: 0.21, color: 0x451a03 }); // Open mouth
    v(headPivot, { w: 0.18, h: 0.04, d: 0.05, x: 0, y: 0.16, z: 0.216, color: 0xfef9c3 }); // Upper teeth
    v(headPivot, { w: 0.12, h: 0.04, d: 0.05, x: 0, y: 0.085, z: 0.216, color: 0xf43f5e }); // Tongue
    // Slender Wooden Arms & Legs + Wooden Bat in Right Hand
    addCyl(leftArmPivot, { rt: 0.065, rb: 0.06, h: 0.46, x: 0.04, y: -0.22, z: 0, color: 0x92400e, roughness: 0.78 });
    v(leftArmPivot, { w: 0.13, h: 0.11, d: 0.13, x: 0.04, y: -0.47, z: 0, color: 0x78350f, roughness: 0.8 });
    addCyl(rightArmPivot, { rt: 0.065, rb: 0.06, h: 0.46, x: -0.04, y: -0.22, z: 0, color: 0x92400e, roughness: 0.78 });
    v(rightArmPivot, { w: 0.13, h: 0.11, d: 0.13, x: -0.04, y: -0.47, z: 0, color: 0x78350f, roughness: 0.8 });
    // Wooden Sahur Bat held cleanly forward-upward
    addCyl(rightArmPivot, { rt: 0.065, rb: 0.032, h: 0.62, x: -0.04, y: -0.38, z: 0.24, color: 0xd97706, roughness: 0.65, rx: 0.85 });
    addCyl(rightArmPivot, { rt: 0.072, rb: 0.072, h: 0.06, x: -0.04, y: -0.2, z: 0.44, color: 0x78350f, roughness: 0.75, rx: 0.85 });
    addCyl(leftLegPivot, { rt: 0.075, rb: 0.07, h: 0.48, x: 0, y: -0.25, z: 0, color: 0x92400e, roughness: 0.78 });
    v(leftLegPivot, { w: 0.17, h: 0.12, d: 0.28, x: 0, y: -0.56, z: 0.04, color: 0x78350f, roughness: 0.8 });
    addCyl(rightLegPivot, { rt: 0.075, rb: 0.07, h: 0.48, x: 0, y: -0.25, z: 0, color: 0x92400e, roughness: 0.78 });
    v(rightLegPivot, { w: 0.17, h: 0.12, d: 0.28, x: 0, y: -0.56, z: 0.04, color: 0x78350f, roughness: 0.8 });
  } else if (skin === 'cristiano_ronaldo') {
    // CRISTIANO RONALDO: Athletic footballer, styled short dark hair, marked eyebrows, red #7 Portugal-inspired kit, socks & cleats
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xdc2626, roughness: 0.55 });
    v(torsoPivot, { w: 0.42, h: 0.08, d: 0.34, x: 0, y: 0.56, z: 0, color: 0x16a34a, roughness: 0.55 }); // Green collar
    v(torsoPivot, { w: 0.06, h: 0.56, d: 0.33, x: -0.26, y: 0.3, z: 0, color: 0x16a34a, roughness: 0.55 }); // Green side trim
    v(torsoPivot, { w: 0.06, h: 0.56, d: 0.33, x: 0.26, y: 0.3, z: 0, color: 0x16a34a, roughness: 0.55 });
    v(torsoPivot, { w: 0.09, h: 0.11, d: 0.03, x: 0.13, y: 0.42, z: 0.17, color: 0xfacc15, metalness: 0.75 }); // Gold chest crest
    // Visible #7 on Back (and small #7 on Chest!)
    v(torsoPivot, { w: 0.16, h: 0.05, d: 0.03, x: 0, y: 0.42, z: -0.175, color: 0xf8fafc });
    v(torsoPivot, { w: 0.055, h: 0.24, d: 0.03, x: 0.01, y: 0.3, z: -0.175, color: 0xf8fafc, rz: -0.26 });
    v(torsoPivot, { w: 0.1, h: 0.035, d: 0.03, x: -0.12, y: 0.39, z: 0.17, color: 0xfacc15 });
    v(torsoPivot, { w: 0.035, h: 0.13, d: 0.03, x: -0.11, y: 0.33, z: 0.17, color: 0xfacc15, rz: -0.25 });
    // Sculpted Athletic Head + Dark Styled Hair + Marked Eyebrows
    v(headPivot, { w: 0.47, h: 0.46, d: 0.47, x: 0, y: 0.24, z: 0, color: 0xd99b66, roughness: 0.68 });
    v(headPivot, { w: 0.5, h: 0.13, d: 0.5, x: 0, y: 0.48, z: -0.01, color: 0x18181b, roughness: 0.68 });
    v(headPivot, { w: 0.34, h: 0.1, d: 0.22, x: 0, y: 0.54, z: 0.12, color: 0x18181b, roughness: 0.62, rx: -0.15 }); // Styled front quiff
    v(headPivot, { w: 0.48, h: 0.22, d: 0.12, x: 0, y: 0.36, z: -0.2, color: 0x18181b, roughness: 0.72 });
    addEyes(0.26, 0.245, 0x292524);
    v(headPivot, { w: 0.14, h: 0.04, d: 0.04, x: -0.11, y: 0.34, z: 0.25, color: 0x18181b, rz: -0.08 }); // Sharp eyebrows
    v(headPivot, { w: 0.14, h: 0.04, d: 0.04, x: 0.11, y: 0.34, z: 0.25, color: 0x18181b, rz: 0.08 });
    v(headPivot, { w: 0.14, h: 0.028, d: 0.03, x: 0, y: 0.11, z: 0.245, color: 0xf8fafc }); // Confident grin
    // Athletic Arms
    v(leftArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xdc2626, roughness: 0.55 });
    v(leftArmPivot, { w: 0.195, h: 0.045, d: 0.195, x: 0, y: -0.21, z: 0, color: 0x16a34a });
    v(leftArmPivot, { w: 0.16, h: 0.25, d: 0.16, x: 0, y: -0.35, z: 0, color: 0xd99b66, roughness: 0.68 });
    v(rightArmPivot, { w: 0.19, h: 0.22, d: 0.19, x: 0, y: -0.09, z: 0, color: 0xdc2626, roughness: 0.55 });
    v(rightArmPivot, { w: 0.195, h: 0.045, d: 0.195, x: 0, y: -0.21, z: 0, color: 0x16a34a });
    v(rightArmPivot, { w: 0.16, h: 0.25, d: 0.16, x: 0, y: -0.35, z: 0, color: 0xd99b66, roughness: 0.68 });
    // Red Football Shorts, Tall Red/Green Socks & Sleek White/Gold Cleats
    v(leftLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0xb91c1c, roughness: 0.6 });
    v(leftLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0xd99b66 });
    v(leftLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.42, z: 0, color: 0xdc2626 });
    v(leftLegPivot, { w: 0.195, h: 0.04, d: 0.195, x: 0, y: -0.37, z: 0, color: 0x16a34a });
    v(leftLegPivot, { w: 0.22, h: 0.14, d: 0.31, x: 0, y: -0.55, z: 0.04, color: 0xf8fafc, roughness: 0.32 });
    v(leftLegPivot, { w: 0.23, h: 0.04, d: 0.32, x: 0, y: -0.63, z: 0.04, color: 0xfacc15, metalness: 0.8 });
    v(rightLegPivot, { w: 0.22, h: 0.24, d: 0.22, x: 0, y: -0.15, z: 0, color: 0xb91c1c, roughness: 0.6 });
    v(rightLegPivot, { w: 0.18, h: 0.08, d: 0.18, x: 0, y: -0.31, z: 0, color: 0xd99b66 });
    v(rightLegPivot, { w: 0.19, h: 0.14, d: 0.19, x: 0, y: -0.42, z: 0, color: 0xdc2626 });
    v(rightLegPivot, { w: 0.195, h: 0.04, d: 0.195, x: 0, y: -0.37, z: 0, color: 0x16a34a });
    v(rightLegPivot, { w: 0.22, h: 0.14, d: 0.31, x: 0, y: -0.55, z: 0.04, color: 0xf8fafc, roughness: 0.32 });
    v(rightLegPivot, { w: 0.23, h: 0.04, d: 0.32, x: 0, y: -0.63, z: 0.04, color: 0xfacc15, metalness: 0.8 });
  } else if (skin === 'meu_ratao') {
    const cfg = customConfig || DEFAULT_CUSTOM_CHARACTER_CONFIG;
    const hex = (c: string) => new THREE.Color(c).getHex();
    const bc = cfg.bodyColors;
    const cl = cfg.clothing;

    // 1. Torso base + optional Shirt / Jacket
    v(torsoPivot, { w: 0.54, h: 0.58, d: 0.34, x: 0, y: 0.3, z: 0, color: hex(bc.torso), roughness: 0.68 });
    if (cl.topType === 'tshirt') {
      v(torsoPivot, { w: 0.57, h: 0.54, d: 0.36, x: 0, y: 0.31, z: 0, color: hex(cl.topColor), roughness: 0.62 });
    } else if (cl.topType === 'jacket') {
      v(torsoPivot, { w: 0.59, h: 0.56, d: 0.37, x: 0, y: 0.31, z: 0, color: hex(cl.topColor), roughness: 0.52 });
      // Jacket collar & open zipper front accent
      v(torsoPivot, { w: 0.14, h: 0.48, d: 0.03, x: 0, y: 0.3, z: 0.185, color: hex(bc.torso), roughness: 0.7 });
      v(torsoPivot, { w: 0.61, h: 0.08, d: 0.39, x: 0, y: 0.57, z: 0, color: hex(cl.topColor), roughness: 0.45 });
    }

    // 2. Head, Snout, Eyes & Mouse Ears
    v(headPivot, { w: 0.5, h: 0.48, d: 0.5, x: 0, y: 0.25, z: 0, color: hex(bc.head), roughness: 0.68 });
    v(headPivot, { w: 0.28, h: 0.16, d: 0.18, x: 0, y: 0.16, z: 0.29, color: hex(bc.snout), roughness: 0.68 });
    const noseTipColor = bc.snout.toLowerCase() === '#ffffff' ? 0xe2e8f0 : 0xf43f5e;
    v(headPivot, { w: 0.11, h: 0.08, d: 0.08, x: 0, y: 0.2, z: 0.39, color: noseTipColor, roughness: 0.4 });
    // Left & Right rounded voxel rat ears
    v(headPivot, { w: 0.24, h: 0.24, d: 0.09, x: -0.24, y: 0.53, z: -0.02, color: hex(bc.head), roughness: 0.68 });
    v(headPivot, { w: 0.16, h: 0.16, d: 0.05, x: -0.24, y: 0.53, z: 0.03, color: hex(bc.ears), roughness: 0.65 });
    v(headPivot, { w: 0.24, h: 0.24, d: 0.09, x: 0.24, y: 0.53, z: -0.02, color: hex(bc.head), roughness: 0.68 });
    v(headPivot, { w: 0.16, h: 0.16, d: 0.05, x: 0.24, y: 0.53, z: 0.03, color: hex(bc.ears), roughness: 0.65 });
    addEyes(0.28, 0.26);

    // 3. 7 Voxel Hairstyles
    const hairHex = hex(cfg.hairColor);
    if (cfg.hairStyle === 'short') {
      v(headPivot, { w: 0.52, h: 0.14, d: 0.52, x: 0, y: 0.52, z: -0.01, color: hairHex, roughness: 0.65 });
      v(headPivot, { w: 0.52, h: 0.2, d: 0.12, x: 0, y: 0.42, z: -0.22, color: hairHex, roughness: 0.65 });
    } else if (cfg.hairStyle === 'spiky') {
      v(headPivot, { w: 0.5, h: 0.11, d: 0.48, x: 0, y: 0.51, z: 0, color: hairHex, roughness: 0.6 });
      v(headPivot, { w: 0.12, h: 0.18, d: 0.12, x: -0.14, y: 0.62, z: 0.08, color: hairHex, rz: 0.18 });
      v(headPivot, { w: 0.12, h: 0.22, d: 0.12, x: 0, y: 0.64, z: 0.02, color: hairHex });
      v(headPivot, { w: 0.12, h: 0.18, d: 0.12, x: 0.14, y: 0.62, z: 0.08, color: hairHex, rz: -0.18 });
      v(headPivot, { w: 0.12, h: 0.16, d: 0.12, x: 0, y: 0.6, z: -0.14, color: hairHex, rx: -0.25 });
    } else if (cfg.hairStyle === 'long') {
      v(headPivot, { w: 0.54, h: 0.14, d: 0.54, x: 0, y: 0.52, z: -0.02, color: hairHex, roughness: 0.65 });
      v(headPivot, { w: 0.54, h: 0.48, d: 0.14, x: 0, y: 0.24, z: -0.24, color: hairHex, roughness: 0.65 });
      v(headPivot, { w: 0.1, h: 0.34, d: 0.22, x: -0.27, y: 0.3, z: -0.1, color: hairHex, roughness: 0.65 });
      v(headPivot, { w: 0.1, h: 0.34, d: 0.22, x: 0.27, y: 0.3, z: -0.1, color: hairHex, roughness: 0.65 });
    } else if (cfg.hairStyle === 'mohawk') {
      v(headPivot, { w: 0.14, h: 0.24, d: 0.52, x: 0, y: 0.59, z: -0.02, color: hairHex, roughness: 0.5 });
      v(headPivot, { w: 0.12, h: 0.18, d: 0.14, x: 0, y: 0.48, z: -0.28, color: hairHex, roughness: 0.5 });
    } else if (cfg.hairStyle === 'curly') {
      const puffOffsets = [
        [-0.16, 0.54, 0.08],
        [0.16, 0.54, 0.08],
        [0, 0.58, 0.04],
        [-0.16, 0.54, -0.12],
        [0.16, 0.54, -0.12],
        [0, 0.52, -0.22],
      ];
      for (const [px, py, pz] of puffOffsets) {
        v(headPivot, { w: 0.24, h: 0.2, d: 0.24, x: px, y: py, z: pz, color: hairHex, roughness: 0.78 });
      }
    } else if (cfg.hairStyle === 'pompadour') {
      v(headPivot, { w: 0.5, h: 0.12, d: 0.46, x: 0, y: 0.51, z: -0.02, color: hairHex, roughness: 0.5 });
      v(headPivot, { w: 0.34, h: 0.2, d: 0.36, x: 0, y: 0.6, z: 0.14, color: hairHex, roughness: 0.4, rx: -0.18 });
    }

    // 4. Hat / Cap & Glasses & Back/Neck Accessories
    if (cl.hatType === 'cap') {
      v(headPivot, { w: 0.54, h: 0.16, d: 0.54, x: 0, y: 0.54, z: 0, color: hex(cl.hatColor), roughness: 0.55 });
      v(headPivot, { w: 0.5, h: 0.05, d: 0.22, x: 0, y: 0.47, z: 0.29, color: hex(cl.hatColor), roughness: 0.5 });
    } else if (cl.hatType === 'hat') {
      v(headPivot, { w: 0.76, h: 0.05, d: 0.76, x: 0, y: 0.5, z: 0, color: hex(cl.hatColor), roughness: 0.6 });
      v(headPivot, { w: 0.48, h: 0.24, d: 0.48, x: 0, y: 0.62, z: 0, color: hex(cl.hatColor), roughness: 0.6 });
    }

    if (cl.glassesType === 'sunglasses') {
      v(headPivot, { w: 0.19, h: 0.12, d: 0.05, x: -0.12, y: 0.29, z: 0.275, color: hex(cl.glassesColor), metalness: 0.4, roughness: 0.15 });
      v(headPivot, { w: 0.19, h: 0.12, d: 0.05, x: 0.12, y: 0.29, z: 0.275, color: hex(cl.glassesColor), metalness: 0.4, roughness: 0.15 });
      v(headPivot, { w: 0.1, h: 0.04, d: 0.04, x: 0, y: 0.31, z: 0.275, color: hex(cl.glassesColor) });
    } else if (cl.glassesType === 'visor') {
      v(headPivot, { w: 0.48, h: 0.13, d: 0.07, x: 0, y: 0.29, z: 0.275, color: hex(cl.glassesColor), emissive: hex(cl.glassesColor), emissiveIntensity: 0.6, roughness: 0.12 });
    } else if (cl.glassesType === 'round') {
      v(headPivot, { w: 0.16, h: 0.16, d: 0.04, x: -0.12, y: 0.28, z: 0.275, color: hex(cl.glassesColor), roughness: 0.2 });
      v(headPivot, { w: 0.16, h: 0.16, d: 0.04, x: 0.12, y: 0.28, z: 0.275, color: hex(cl.glassesColor), roughness: 0.2 });
      v(headPivot, { w: 0.08, h: 0.03, d: 0.03, x: 0, y: 0.29, z: 0.275, color: hex(cl.glassesColor) });
    }

    if (cl.accessoryType === 'backpack') {
      v(torsoPivot, { w: 0.42, h: 0.46, d: 0.22, x: 0, y: 0.3, z: -0.26, color: hex(cl.accessoryColor), roughness: 0.65 });
      v(torsoPivot, { w: 0.34, h: 0.2, d: 0.08, x: 0, y: 0.22, z: -0.37, color: hex(cl.accessoryColor), roughness: 0.55 });
    } else if (cl.accessoryType === 'scarf') {
      v(torsoPivot, { w: 0.58, h: 0.13, d: 0.4, x: 0, y: 0.58, z: 0, color: hex(cl.accessoryColor), roughness: 0.72 });
      v(torsoPivot, { w: 0.15, h: 0.32, d: 0.08, x: 0.14, y: 0.4, z: 0.2, color: hex(cl.accessoryColor), roughness: 0.72 });
    } else if (cl.accessoryType === 'chain') {
      v(torsoPivot, { w: 0.34, h: 0.07, d: 0.04, x: 0, y: 0.52, z: 0.19, color: hex(cl.accessoryColor), metalness: 0.9, roughness: 0.18 });
      v(torsoPivot, { w: 0.13, h: 0.13, d: 0.05, x: 0, y: 0.42, z: 0.2, color: hex(cl.accessoryColor), metalness: 0.9, roughness: 0.18 });
    }

    // 5. Individual Arm & Hand colors (+ sleeve if wearing top)
    const sleeveLeft = cl.topType !== 'none' ? hex(cl.topColor) : hex(bc.leftArm);
    const sleeveRight = cl.topType !== 'none' ? hex(cl.topColor) : hex(bc.rightArm);
    v(leftArmPivot, { w: 0.19, h: 0.26, d: 0.19, x: 0, y: -0.1, z: 0, color: sleeveLeft, roughness: 0.65 });
    v(leftArmPivot, { w: 0.16, h: 0.2, d: 0.16, x: 0, y: -0.32, z: 0, color: hex(bc.leftArm), roughness: 0.7 });
    v(leftArmPivot, { w: 0.16, h: 0.1, d: 0.16, x: 0, y: -0.45, z: 0, color: hex(bc.hands), roughness: 0.7 });

    v(rightArmPivot, { w: 0.19, h: 0.26, d: 0.19, x: 0, y: -0.1, z: 0, color: sleeveRight, roughness: 0.65 });
    v(rightArmPivot, { w: 0.16, h: 0.2, d: 0.16, x: 0, y: -0.32, z: 0, color: hex(bc.rightArm), roughness: 0.7 });
    v(rightArmPivot, { w: 0.16, h: 0.1, d: 0.16, x: 0, y: -0.45, z: 0, color: hex(bc.hands), roughness: 0.7 });

    // 6. Individual Legs, Pants/Shorts & Feet/Shoes
    if (cl.bottomType === 'pants') {
      v(leftLegPivot, { w: 0.21, h: 0.42, d: 0.21, x: 0, y: -0.24, z: 0, color: hex(cl.bottomColor), roughness: 0.7 });
      v(rightLegPivot, { w: 0.21, h: 0.42, d: 0.21, x: 0, y: -0.24, z: 0, color: hex(cl.bottomColor), roughness: 0.7 });
    } else if (cl.bottomType === 'shorts') {
      v(leftLegPivot, { w: 0.22, h: 0.22, d: 0.22, x: 0, y: -0.15, z: 0, color: hex(cl.bottomColor), roughness: 0.7 });
      v(leftLegPivot, { w: 0.18, h: 0.22, d: 0.18, x: 0, y: -0.36, z: 0, color: hex(bc.leftLeg), roughness: 0.72 });
      v(rightLegPivot, { w: 0.22, h: 0.22, d: 0.22, x: 0, y: -0.15, z: 0, color: hex(cl.bottomColor), roughness: 0.7 });
      v(rightLegPivot, { w: 0.18, h: 0.22, d: 0.18, x: 0, y: -0.36, z: 0, color: hex(bc.rightLeg), roughness: 0.72 });
    } else {
      v(leftLegPivot, { w: 0.2, h: 0.42, d: 0.2, x: 0, y: -0.24, z: 0, color: hex(bc.leftLeg), roughness: 0.72 });
      v(rightLegPivot, { w: 0.2, h: 0.42, d: 0.2, x: 0, y: -0.24, z: 0, color: hex(bc.rightLeg), roughness: 0.72 });
    }

    if (cl.shoesType === 'sneakers') {
      v(leftLegPivot, { w: 0.23, h: 0.16, d: 0.31, x: 0, y: -0.54, z: 0.04, color: hex(cl.shoesColor), roughness: 0.45 });
      v(leftLegPivot, { w: 0.24, h: 0.05, d: 0.32, x: 0, y: -0.61, z: 0.04, color: 0xf8fafc, roughness: 0.5 });
      v(rightLegPivot, { w: 0.23, h: 0.16, d: 0.31, x: 0, y: -0.54, z: 0.04, color: hex(cl.shoesColor), roughness: 0.45 });
      v(rightLegPivot, { w: 0.24, h: 0.05, d: 0.32, x: 0, y: -0.61, z: 0.04, color: 0xf8fafc, roughness: 0.5 });
    } else if (cl.shoesType === 'boots') {
      v(leftLegPivot, { w: 0.24, h: 0.24, d: 0.32, x: 0, y: -0.5, z: 0.04, color: hex(cl.shoesColor), roughness: 0.55 });
      v(rightLegPivot, { w: 0.24, h: 0.24, d: 0.32, x: 0, y: -0.5, z: 0.04, color: hex(cl.shoesColor), roughness: 0.55 });
    } else {
      v(leftLegPivot, { w: 0.21, h: 0.13, d: 0.28, x: 0, y: -0.55, z: 0.03, color: hex(bc.feet), roughness: 0.72 });
      v(rightLegPivot, { w: 0.21, h: 0.13, d: 0.28, x: 0, y: -0.55, z: 0.03, color: hex(bc.feet), roughness: 0.72 });
    }

    // 7. Tail with custom color
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.12, -0.18);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.09, h: 0.09, d: 0.5, x: 0, y: 0, z: -0.24, color: hex(bc.tail), roughness: 0.65, rx: 0.35 });

    // 8. 5 Painted Overlay Planes (Head, Torso Front, Torso Back, Arms, Legs)
    customMeshRefs = {
      regionOverlays: { head: [], torsoFront: [], torsoBack: [], arms: [], legs: [] },
      regionTextures: {},
    };

    const addOverlayPlane = (
      region: PaintRegion,
      parent: THREE.Object3D,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number,
      ry = 0
    ) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 1,
        alphaTest: 0.05,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        roughness: 0.6,
        visible: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (ry) mesh.rotation.y = ry;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      parent.add(mesh);
      geos.push(geo);
      mats.push(mat);
      customMeshRefs!.regionOverlays[region]!.push(mesh);
    };

    addOverlayPlane('head', headPivot, 0.48, 0.46, 0, 0.25, 0.254);
    addOverlayPlane('torsoFront', torsoPivot, 0.56, 0.54, 0, 0.31, 0.192);
    addOverlayPlane('torsoBack', torsoPivot, 0.56, 0.54, 0, 0.31, -0.192, Math.PI);
    addOverlayPlane('arms', leftArmPivot, 0.18, 0.44, 0, -0.22, 0.102);
    addOverlayPlane('arms', rightArmPivot, 0.18, 0.44, 0, -0.22, 0.102);
    addOverlayPlane('legs', leftLegPivot, 0.21, 0.42, 0, -0.24, 0.114);
    addOverlayPlane('legs', rightLegPivot, 0.21, 0.42, 0, -0.24, 0.114);

    // Apply persisted paintTextures (data URLs or server PNG paths)
    const regions: PaintRegion[] = ['head', 'torsoFront', 'torsoBack', 'arms', 'legs'];
    for (const region of regions) {
      const src = cfg.paintTextures?.[region];
      if (src) {
        const tex = textureLoader.load(src);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.LinearFilter;
        customMeshRefs.regionTextures[region] = tex;
        for (const m of customMeshRefs.regionOverlays[region] || []) {
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.map = tex;
          mat.visible = true;
          mat.needsUpdate = true;
        }
      }
    }
  } else if (skin === 'enderman') {
    // Enderman: Tall obsidian-black voxel silhouette, glowing magenta eyes & void particles
    v(torsoPivot, { w: 0.44, h: 0.72, d: 0.24, x: 0, y: 0.36, z: 0, color: 0x09090b, roughness: 0.55 });
    v(torsoPivot, { w: 0.46, h: 0.14, d: 0.26, x: 0, y: 0.54, z: 0, color: 0x18181b, roughness: 0.5 });
    headPivot.position.set(0, 0.74, 0);
    v(headPivot, { w: 0.48, h: 0.48, d: 0.48, x: 0, y: 0.26, z: 0, color: 0x09090b, roughness: 0.5 });
    // Glowing purple eyes
    v(headPivot, { w: 0.14, h: 0.07, d: 0.05, x: -0.13, y: 0.27, z: 0.25, color: 0xe879f9, emissive: 0xc026d3, emissiveIntensity: 1.8 });
    v(headPivot, { w: 0.14, h: 0.07, d: 0.05, x: 0.13, y: 0.27, z: 0.25, color: 0xe879f9, emissive: 0xc026d3, emissiveIntensity: 1.8 });
    v(headPivot, { w: 0.06, h: 0.07, d: 0.06, x: -0.13, y: 0.27, z: 0.255, color: 0xfdf4ff, emissive: 0xf0abfc, emissiveIntensity: 2.0 });
    v(headPivot, { w: 0.06, h: 0.07, d: 0.06, x: 0.13, y: 0.27, z: 0.255, color: 0xfdf4ff, emissive: 0xf0abfc, emissiveIntensity: 2.0 });
    // Long slender arms & legs
    v(leftArmPivot, { w: 0.13, h: 0.68, d: 0.13, x: 0, y: -0.3, z: 0, color: 0x09090b, roughness: 0.55 });
    v(rightArmPivot, { w: 0.13, h: 0.68, d: 0.13, x: 0, y: -0.3, z: 0, color: 0x09090b, roughness: 0.55 });
    v(leftLegPivot, { w: 0.14, h: 0.68, d: 0.14, x: 0, y: -0.32, z: 0, color: 0x09090b, roughness: 0.55 });
    v(rightLegPivot, { w: 0.14, h: 0.68, d: 0.14, x: 0, y: -0.32, z: 0, color: 0x09090b, roughness: 0.55 });
    auraParticles = [];
    for (let i = 0; i < 7; i++) {
      const pMesh = v(bodyPivot, {
        w: 0.07,
        h: 0.07,
        d: 0.07,
        x: 0,
        y: 1.0,
        z: 0,
        color: 0xd946ef,
        emissive: 0xa21caf,
        emissiveIntensity: 1.6,
      });
      auraParticles.push({
        mesh: pMesh,
        radius: 0.58 + (i % 2) * 0.16,
        heightOffset: 0.55 + i * 0.18,
        speed: 1.8 + (i % 3) * 0.4,
        angle: (i / 7) * Math.PI * 2,
      });
    }
  } else if (skin === 'deadpool') {
    // Deadpool: Red/black tactical suit, white mask eyes & twin crossed katanas
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xdc2626, roughness: 0.55 });
    v(torsoPivot, { w: 0.18, h: 0.58, d: 0.33, x: -0.18, y: 0.3, z: 0, color: 0x111827, roughness: 0.6 });
    v(torsoPivot, { w: 0.18, h: 0.58, d: 0.33, x: 0.18, y: 0.3, z: 0, color: 0x111827, roughness: 0.6 });
    v(torsoPivot, { w: 0.58, h: 0.09, d: 0.35, x: 0, y: 0.07, z: 0, color: 0x7f1d1d }); // Belt
    v(torsoPivot, { w: 0.14, h: 0.12, d: 0.05, x: 0, y: 0.07, z: 0.19, color: 0xef4444 }); // Buckle
    // Twin katanas on back
    v(torsoPivot, { w: 0.06, h: 0.72, d: 0.06, x: 0.04, y: 0.38, z: -0.2, color: 0x1e293b, rz: 0.55 });
    v(torsoPivot, { w: 0.06, h: 0.72, d: 0.06, x: -0.04, y: 0.38, z: -0.21, color: 0x1e293b, rz: -0.55 });
    v(torsoPivot, { w: 0.08, h: 0.18, d: 0.08, x: -0.22, y: 0.72, z: -0.2, color: 0x991b1b, rz: 0.55 });
    v(torsoPivot, { w: 0.08, h: 0.18, d: 0.08, x: 0.22, y: 0.72, z: -0.21, color: 0x991b1b, rz: -0.55 });
    // Head
    v(headPivot, { w: 0.48, h: 0.46, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xdc2626, roughness: 0.5 });
    v(headPivot, { w: 0.16, h: 0.18, d: 0.04, x: -0.12, y: 0.27, z: 0.24, color: 0x09090b });
    v(headPivot, { w: 0.16, h: 0.18, d: 0.04, x: 0.12, y: 0.27, z: 0.24, color: 0x09090b });
    v(headPivot, { w: 0.11, h: 0.07, d: 0.05, x: -0.12, y: 0.27, z: 0.25, color: 0xffffff, emissive: 0xe2e8f0, emissiveIntensity: 0.25 });
    v(headPivot, { w: 0.11, h: 0.07, d: 0.05, x: 0.12, y: 0.27, z: 0.25, color: 0xffffff, emissive: 0xe2e8f0, emissiveIntensity: 0.25 });
    buildLimbs(0x111827, 0xdc2626, 0x111827, 0xdc2626, 0x09090b);
  } else if (skin === 'mario') {
    // Mario: Red cap, thick mustache, blue overalls & red shirt
    v(torsoPivot, { w: 0.56, h: 0.56, d: 0.34, x: 0, y: 0.29, z: 0, color: 0x2563eb, roughness: 0.7 }); // Overalls
    v(torsoPivot, { w: 0.58, h: 0.22, d: 0.33, x: 0, y: 0.48, z: -0.01, color: 0xdc2626, roughness: 0.65 }); // Red shirt
    v(torsoPivot, { w: 0.1, h: 0.24, d: 0.35, x: -0.14, y: 0.47, z: 0, color: 0x2563eb });
    v(torsoPivot, { w: 0.1, h: 0.24, d: 0.35, x: 0.14, y: 0.47, z: 0, color: 0x2563eb });
    v(torsoPivot, { w: 0.08, h: 0.08, d: 0.04, x: -0.14, y: 0.38, z: 0.18, color: 0xfacc15 }); // Gold buttons
    v(torsoPivot, { w: 0.08, h: 0.08, d: 0.04, x: 0.14, y: 0.38, z: 0.18, color: 0xfacc15 });
    // Head + Red Cap
    v(headPivot, { w: 0.48, h: 0.44, d: 0.48, x: 0, y: 0.23, z: 0, color: 0xfdba74, roughness: 0.72 });
    v(headPivot, { w: 0.52, h: 0.18, d: 0.52, x: 0, y: 0.49, z: 0, color: 0xdc2626 });
    v(headPivot, { w: 0.52, h: 0.05, d: 0.18, x: 0, y: 0.41, z: 0.28, color: 0xb91c1c });
    v(headPivot, { w: 0.16, h: 0.14, d: 0.04, x: 0, y: 0.5, z: 0.27, color: 0xffffff });
    v(headPivot, { w: 0.09, h: 0.09, d: 0.05, x: 0, y: 0.5, z: 0.28, color: 0xdc2626 });
    // Nose & Mustache
    v(headPivot, { w: 0.14, h: 0.12, d: 0.12, x: 0, y: 0.2, z: 0.26, color: 0xfb923c });
    v(headPivot, { w: 0.32, h: 0.08, d: 0.08, x: 0, y: 0.12, z: 0.26, color: 0x451a03 });
    addEyes(0.28, 0.24, 0x2563eb);
    buildLimbs(0xffffff, 0xdc2626, 0x2563eb, 0x78350f, 0x451a03);
  } else if (skin === 'luigi') {
    // Luigi: Slightly taller green cap, dark mustache, blue overalls & green shirt
    v(torsoPivot, { w: 0.52, h: 0.6, d: 0.3, x: 0, y: 0.31, z: 0, color: 0x1d4ed8, roughness: 0.7 });
    v(torsoPivot, { w: 0.54, h: 0.24, d: 0.29, x: 0, y: 0.51, z: -0.01, color: 0x16a34a, roughness: 0.65 });
    v(torsoPivot, { w: 0.09, h: 0.24, d: 0.31, x: -0.13, y: 0.49, z: 0, color: 0x1d4ed8 });
    v(torsoPivot, { w: 0.09, h: 0.24, d: 0.31, x: 0.13, y: 0.49, z: 0, color: 0x1d4ed8 });
    v(torsoPivot, { w: 0.07, h: 0.07, d: 0.04, x: -0.13, y: 0.4, z: 0.16, color: 0xfacc15 });
    v(torsoPivot, { w: 0.07, h: 0.07, d: 0.04, x: 0.13, y: 0.4, z: 0.16, color: 0xfacc15 });
    headPivot.position.set(0, 0.66, 0);
    v(headPivot, { w: 0.45, h: 0.48, d: 0.45, x: 0, y: 0.25, z: 0, color: 0xfdba74, roughness: 0.72 });
    v(headPivot, { w: 0.49, h: 0.18, d: 0.49, x: 0, y: 0.52, z: 0, color: 0x16a34a });
    v(headPivot, { w: 0.49, h: 0.05, d: 0.18, x: 0, y: 0.44, z: 0.26, color: 0x15803d });
    v(headPivot, { w: 0.15, h: 0.14, d: 0.04, x: 0, y: 0.53, z: 0.25, color: 0xffffff });
    v(headPivot, { w: 0.08, h: 0.09, d: 0.05, x: 0, y: 0.53, z: 0.26, color: 0x16a34a });
    v(headPivot, { w: 0.13, h: 0.13, d: 0.12, x: 0, y: 0.21, z: 0.25, color: 0xfb923c });
    v(headPivot, { w: 0.3, h: 0.07, d: 0.08, x: 0, y: 0.13, z: 0.25, color: 0x27272a });
    addEyes(0.3, 0.23, 0x1d4ed8);
    buildLimbs(0xffffff, 0x16a34a, 0x1d4ed8, 0x78350f, 0x451a03);
  } else if (skin === 'gigachad') {
    // Gigachad: Broad muscular shoulders, sculpted jaw & beard, dark fitted shirt
    v(torsoPivot, { w: 0.66, h: 0.36, d: 0.38, x: 0, y: 0.42, z: 0, color: 0x334155, roughness: 0.55 });
    v(torsoPivot, { w: 0.5, h: 0.28, d: 0.3, x: 0, y: 0.14, z: 0, color: 0x1e293b, roughness: 0.65 });
    v(headPivot, { w: 0.48, h: 0.46, d: 0.46, x: 0, y: 0.25, z: 0, color: 0xd6b094, roughness: 0.65 });
    v(headPivot, { w: 0.44, h: 0.18, d: 0.44, x: 0, y: 0.09, z: 0.03, color: 0x27272a, roughness: 0.8 }); // Chiseled beard
    v(headPivot, { w: 0.22, h: 0.11, d: 0.1, x: 0, y: 0.03, z: 0.22, color: 0x18181b }); // Strong chin
    v(headPivot, { w: 0.5, h: 0.16, d: 0.48, x: 0, y: 0.5, z: -0.02, color: 0x18181b }); // Hair
    v(headPivot, { w: 0.12, h: 0.04, d: 0.04, x: -0.12, y: 0.34, z: 0.25, color: 0x18181b, rz: -0.12 });
    v(headPivot, { w: 0.12, h: 0.04, d: 0.04, x: 0.12, y: 0.34, z: 0.25, color: 0x18181b, rz: 0.12 });
    addEyes(0.28, 0.24, 0x334155);
    buildLimbs(0xd6b094, 0x334155, 0x0f172a, 0x18181b, 0x475569);
  } else if (skin === 'quandale_dingle') {
    // Quandale Dingle: Expressive wide eyes, iconic giant nose & bright orange/yellow streetwear
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.34, x: 0, y: 0.3, z: 0, color: 0xf97316, roughness: 0.72 });
    v(torsoPivot, { w: 0.42, h: 0.18, d: 0.36, x: 0, y: 0.14, z: 0.01, color: 0xea580c });
    v(headPivot, { w: 0.48, h: 0.48, d: 0.48, x: 0, y: 0.25, z: 0, color: 0x8d5524, roughness: 0.72 });
    v(headPivot, { w: 0.5, h: 0.12, d: 0.48, x: 0, y: 0.5, z: 0, color: 0x111827 });
    // Iconic oversized nose
    v(headPivot, { w: 0.18, h: 0.16, d: 0.34, x: 0, y: 0.2, z: 0.34, color: 0x7c471b, roughness: 0.65 });
    // Huge goofy eyes
    v(headPivot, { w: 0.16, h: 0.16, d: 0.05, x: -0.13, y: 0.31, z: 0.25, color: 0xffffff });
    v(headPivot, { w: 0.16, h: 0.16, d: 0.05, x: 0.13, y: 0.31, z: 0.25, color: 0xffffff });
    v(headPivot, { w: 0.07, h: 0.07, d: 0.06, x: -0.15, y: 0.31, z: 0.26, color: 0x09090b });
    v(headPivot, { w: 0.07, h: 0.07, d: 0.06, x: 0.11, y: 0.31, z: 0.26, color: 0x09090b });
    v(headPivot, { w: 0.26, h: 0.05, d: 0.05, x: 0, y: 0.09, z: 0.25, color: 0xffffff });
    buildLimbs(0x8d5524, 0xf97316, 0x1d4ed8, 0xfacc15, 0xffffff);
  } else if (skin === 'doge') {
    // Doge: Golden Shiba Inu, cream belly & muzzle, sideways meme eyes, curled tail
    v(torsoPivot, { w: 0.54, h: 0.56, d: 0.34, x: 0, y: 0.29, z: 0, color: 0xeab308, roughness: 0.78 });
    v(torsoPivot, { w: 0.36, h: 0.44, d: 0.06, x: 0, y: 0.26, z: 0.16, color: 0xfef3c7 }); // Cream belly
    v(torsoPivot, { w: 0.56, h: 0.09, d: 0.36, x: 0, y: 0.55, z: 0, color: 0xdc2626 }); // Red collar
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.05, x: 0, y: 0.48, z: 0.2, color: 0xfacc15, metalness: 0.6 }); // Tag
    v(headPivot, { w: 0.5, h: 0.44, d: 0.48, x: 0, y: 0.24, z: 0, color: 0xeab308, roughness: 0.75 });
    v(headPivot, { w: 0.32, h: 0.2, d: 0.22, x: 0, y: 0.14, z: 0.28, color: 0xfef3c7 }); // Snout
    v(headPivot, { w: 0.11, h: 0.08, d: 0.06, x: 0, y: 0.2, z: 0.4, color: 0x0f172a }); // Nose
    // Pointed Shiba ears
    v(headPivot, { w: 0.14, h: 0.18, d: 0.1, x: -0.18, y: 0.52, z: 0, color: 0xca8a04, rz: 0.12 });
    v(headPivot, { w: 0.14, h: 0.18, d: 0.1, x: 0.18, y: 0.52, z: 0, color: 0xca8a04, rz: -0.12 });
    // Sideways meme eyes
    v(headPivot, { w: 0.12, h: 0.1, d: 0.04, x: -0.12, y: 0.3, z: 0.25, color: 0xffffff });
    v(headPivot, { w: 0.12, h: 0.1, d: 0.04, x: 0.12, y: 0.3, z: 0.25, color: 0xffffff });
    v(headPivot, { w: 0.06, h: 0.07, d: 0.05, x: -0.14, y: 0.3, z: 0.26, color: 0x0f172a });
    v(headPivot, { w: 0.06, h: 0.07, d: 0.05, x: 0.1, y: 0.3, z: 0.26, color: 0x0f172a });
    buildLimbs(0xeab308, 0xeab308, 0xca8a04, 0xfef3c7, 0xca8a04);
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.18, -0.18);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.14, h: 0.24, d: 0.2, x: 0, y: 0.1, z: -0.14, color: 0xfef3c7, rx: 0.5 });
  } else if (skin === 'ronaldinho_gaucho') {
    // Ronaldinho Gaúcho: Yellow/green #10 Seleção kit, headband, curly long hair & signature grin
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xfacc15, roughness: 0.5 });
    v(torsoPivot, { w: 0.58, h: 0.1, d: 0.34, x: 0, y: 0.56, z: 0, color: 0x16a34a });
    v(torsoPivot, { w: 0.18, h: 0.24, d: 0.04, x: 0, y: 0.3, z: -0.17, color: 0x15803d }); // #10 back
    v(headPivot, { w: 0.46, h: 0.46, d: 0.46, x: 0, y: 0.24, z: 0, color: 0x8d5524, roughness: 0.7 });
    // Headband + curly hair + ponytail
    v(headPivot, { w: 0.49, h: 0.08, d: 0.49, x: 0, y: 0.41, z: 0, color: 0xffffff });
    v(headPivot, { w: 0.52, h: 0.16, d: 0.5, x: 0, y: 0.5, z: -0.03, color: 0x18181b });
    v(headPivot, { w: 0.38, h: 0.32, d: 0.16, x: 0, y: 0.2, z: -0.26, color: 0x18181b });
    // Big cheerful smile
    v(headPivot, { w: 0.22, h: 0.08, d: 0.05, x: 0, y: 0.1, z: 0.24, color: 0xffffff });
    addEyes(0.28, 0.24, 0x1c1917);
    buildLimbs(0x8d5524, 0xfacc15, 0x1d4ed8, 0xfacc15, 0x16a34a);
  } else if (skin === 'vini_jr') {
    // Vini Jr.: White & gold royal football kit, high-top fade, dynamic smile & golden cleats
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.32, x: 0, y: 0.3, z: 0, color: 0xf8fafc, roughness: 0.45 });
    v(torsoPivot, { w: 0.12, h: 0.58, d: 0.33, x: -0.22, y: 0.3, z: 0, color: 0xf59e0b });
    v(torsoPivot, { w: 0.12, h: 0.58, d: 0.33, x: 0.22, y: 0.3, z: 0, color: 0xf59e0b });
    v(torsoPivot, { w: 0.16, h: 0.24, d: 0.04, x: 0, y: 0.3, z: -0.17, color: 0x1e293b }); // #7 back
    v(headPivot, { w: 0.46, h: 0.46, d: 0.46, x: 0, y: 0.24, z: 0, color: 0x6b3e26, roughness: 0.7 });
    v(headPivot, { w: 0.46, h: 0.16, d: 0.46, x: 0, y: 0.51, z: 0, color: 0x111827 });
    v(headPivot, { w: 0.2, h: 0.07, d: 0.05, x: 0, y: 0.1, z: 0.24, color: 0xffffff });
    addEyes(0.28, 0.24, 0x0f172a);
    buildLimbs(0x6b3e26, 0xf8fafc, 0xf8fafc, 0xf59e0b, 0xffffff);
  } else if (skin === 'rato_cosmico') {
    // Rato Cósmico: Deep violet cosmic suit, neon cyan eyes, starlight helmet & orbiting stars
    v(torsoPivot, { w: 0.56, h: 0.58, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x312e81, roughness: 0.3, metalness: 0.45 });
    v(torsoPivot, { w: 0.26, h: 0.26, d: 0.06, x: 0, y: 0.34, z: 0.18, color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.4 });
    v(headPivot, { w: 0.5, h: 0.44, d: 0.5, x: 0, y: 0.24, z: 0, color: 0x4c1d95, roughness: 0.35 });
    v(headPivot, { w: 0.28, h: 0.18, d: 0.24, x: 0, y: 0.16, z: 0.3, color: 0xc4b5fd });
    v(headPivot, { w: 0.12, h: 0.09, d: 0.07, x: 0, y: 0.22, z: 0.43, color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 1.5 });
    // Glowing cosmic ears
    v(headPivot, { w: 0.22, h: 0.22, d: 0.08, x: -0.25, y: 0.48, z: -0.02, color: 0x6d28d9 });
    v(headPivot, { w: 0.14, h: 0.14, d: 0.09, x: -0.25, y: 0.48, z: 0, color: 0xe879f9, emissive: 0xd946ef, emissiveIntensity: 1.1 });
    v(headPivot, { w: 0.22, h: 0.22, d: 0.08, x: 0.25, y: 0.48, z: -0.02, color: 0x6d28d9 });
    v(headPivot, { w: 0.14, h: 0.14, d: 0.09, x: 0.25, y: 0.48, z: 0, color: 0xe879f9, emissive: 0xd946ef, emissiveIntensity: 1.1 });
    // Glowing cyan visor eyes
    v(headPivot, { w: 0.13, h: 0.1, d: 0.05, x: -0.12, y: 0.3, z: 0.26, color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.8 });
    v(headPivot, { w: 0.13, h: 0.1, d: 0.05, x: 0.12, y: 0.3, z: 0.26, color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.8 });
    buildLimbs(0xc4b5fd, 0x312e81, 0x1e1b4b, 0x38bdf8, 0xe879f9);
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.12, -0.18);
    torsoPivot.add(tailPivot);
    v(tailPivot, { w: 0.08, h: 0.08, d: 0.5, x: 0, y: -0.04, z: -0.24, color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 1.1, rx: -0.25 });
    auraParticles = [];
    for (let i = 0; i < 6; i++) {
      const star = v(bodyPivot, {
        w: 0.09,
        h: 0.09,
        d: 0.09,
        x: 0,
        y: 1.1,
        z: 0,
        color: i % 2 === 0 ? 0xfef08a : 0x38bdf8,
        emissive: i % 2 === 0 ? 0xfacc15 : 0x06b6d4,
        emissiveIntensity: 1.7,
      });
      auraParticles.push({
        mesh: star,
        radius: 0.72,
        heightOffset: 0.8 + (i % 3) * 0.3,
        speed: 2.2,
        angle: (i / 6) * Math.PI * 2,
      });
    }
  } else if (skin === 'bob_esponja') {
    // Bob Esponja: Yellow square sponge body, white shirt, red tie, brown square pants & blue eyes
    v(torsoPivot, { w: 0.64, h: 0.56, d: 0.34, x: 0, y: 0.38, z: 0, color: 0xfacc15, roughness: 0.8 });
    v(torsoPivot, { w: 0.65, h: 0.14, d: 0.35, x: 0, y: 0.14, z: 0, color: 0xffffff, roughness: 0.55 }); // Shirt
    v(torsoPivot, { w: 0.65, h: 0.16, d: 0.35, x: 0, y: 0.0, z: 0, color: 0x78350f, roughness: 0.7 }); // Brown pants
    v(torsoPivot, { w: 0.1, h: 0.18, d: 0.05, x: 0, y: 0.11, z: 0.18, color: 0xdc2626 }); // Red tie
    // Sponge dimples
    v(torsoPivot, { w: 0.08, h: 0.08, d: 0.02, x: -0.22, y: 0.56, z: 0.175, color: 0xca8a04 });
    v(torsoPivot, { w: 0.07, h: 0.07, d: 0.02, x: 0.21, y: 0.34, z: 0.175, color: 0xca8a04 });
    // Face directly on upper sponge block
    headPivot.position.set(0, 0.52, 0);
    v(headPivot, { w: 0.16, h: 0.16, d: 0.04, x: -0.12, y: 0.08, z: 0.18, color: 0xffffff });
    v(headPivot, { w: 0.16, h: 0.16, d: 0.04, x: 0.12, y: 0.08, z: 0.18, color: 0xffffff });
    v(headPivot, { w: 0.08, h: 0.08, d: 0.05, x: -0.11, y: 0.08, z: 0.19, color: 0x0ea5e9 });
    v(headPivot, { w: 0.08, h: 0.08, d: 0.05, x: 0.11, y: 0.08, z: 0.19, color: 0x0ea5e9 });
    v(headPivot, { w: 0.08, h: 0.08, d: 0.14, x: 0, y: 0.01, z: 0.22, color: 0xfacc15 }); // Nose
    v(headPivot, { w: 0.08, h: 0.07, d: 0.04, x: -0.06, y: -0.12, z: 0.18, color: 0xffffff }); // Buck tooth L
    v(headPivot, { w: 0.08, h: 0.07, d: 0.04, x: 0.06, y: -0.12, z: 0.18, color: 0xffffff }); // Buck tooth R
    buildLimbs(0xfacc15, 0xffffff, 0xfacc15, 0x09090b, 0xffffff);
  } else if (skin === 'patrick') {
    // Patrick Estrela: Pink cone-head starfish with lime green shorts & purple flowers
    v(torsoPivot, { w: 0.62, h: 0.5, d: 0.42, x: 0, y: 0.24, z: 0, color: 0xfb7185, roughness: 0.78 });
    v(torsoPivot, { w: 0.64, h: 0.22, d: 0.44, x: 0, y: 0.06, z: 0, color: 0x4ade80, roughness: 0.7 }); // Green shorts
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.04, x: -0.18, y: 0.08, z: 0.23, color: 0x9333ea }); // Purple flower patch
    v(torsoPivot, { w: 0.1, h: 0.1, d: 0.04, x: 0.16, y: 0.04, z: -0.23, color: 0x9333ea });
    // Cone starfish head
    v(headPivot, { w: 0.48, h: 0.36, d: 0.4, x: 0, y: 0.14, z: 0, color: 0xfb7185, roughness: 0.78 });
    v(headPivot, { w: 0.34, h: 0.24, d: 0.3, x: 0, y: 0.4, z: 0, color: 0xfb7185, roughness: 0.78 });
    v(headPivot, { w: 0.2, h: 0.18, d: 0.2, x: 0, y: 0.56, z: 0, color: 0xfb7185, roughness: 0.78 });
    addEyes(0.24, 0.21, 0x0f172a);
    v(headPivot, { w: 0.14, h: 0.04, d: 0.05, x: -0.11, y: 0.35, z: 0.22, color: 0x18181b, rz: 0.15 });
    v(headPivot, { w: 0.14, h: 0.04, d: 0.05, x: 0.11, y: 0.35, z: 0.22, color: 0x18181b, rz: -0.15 });
    v(headPivot, { w: 0.22, h: 0.06, d: 0.04, x: 0, y: 0.08, z: 0.21, color: 0xbe123c });
    buildLimbs(0xfb7185, 0xfb7185, 0x4ade80, 0xfb7185, 0xf43f5e);
  } else if (skin === 'lula_molusco') {
    // Lula Molusco: Turquoise-teal squid, tall dome head, drooping squid nose & brown shirt
    v(torsoPivot, { w: 0.48, h: 0.56, d: 0.3, x: 0, y: 0.3, z: 0, color: 0x92400e, roughness: 0.75 }); // Brown polo
    v(torsoPivot, { w: 0.32, h: 0.1, d: 0.32, x: 0, y: 0.55, z: 0, color: 0x78350f });
    headPivot.position.set(0, 0.64, 0);
    v(headPivot, { w: 0.46, h: 0.38, d: 0.46, x: 0, y: 0.22, z: 0, color: 0x5eead4, roughness: 0.65 });
    v(headPivot, { w: 0.58, h: 0.28, d: 0.54, x: 0, y: 0.48, z: -0.02, color: 0x5eead4, roughness: 0.65 }); // Dome head
    v(headPivot, { w: 0.14, h: 0.26, d: 0.18, x: 0, y: 0.14, z: 0.28, color: 0x2dd4bf }); // Droopy squid nose
    // Half-lidded grumpy eyes
    v(headPivot, { w: 0.14, h: 0.14, d: 0.05, x: -0.11, y: 0.29, z: 0.24, color: 0xfef08a });
    v(headPivot, { w: 0.14, h: 0.14, d: 0.05, x: 0.11, y: 0.29, z: 0.24, color: 0xfef08a });
    v(headPivot, { w: 0.14, h: 0.06, d: 0.06, x: -0.11, y: 0.34, z: 0.245, color: 0x14b8a6 });
    v(headPivot, { w: 0.14, h: 0.06, d: 0.06, x: 0.11, y: 0.34, z: 0.245, color: 0x14b8a6 });
    v(headPivot, { w: 0.06, h: 0.06, d: 0.06, x: -0.11, y: 0.27, z: 0.25, color: 0x7f1d1d });
    v(headPivot, { w: 0.06, h: 0.06, d: 0.06, x: 0.11, y: 0.27, z: 0.25, color: 0x7f1d1d });
    buildLimbs(0x5eead4, 0x92400e, 0x5eead4, 0x2dd4bf, 0x0f766e);
  } else if (skin === 'plankton') {
    // Plankton (Secret Admin Exclusive): Emerald pill body, twin tall antennae & giant red cyclops eye
    v(torsoPivot, { w: 0.44, h: 0.66, d: 0.38, x: 0, y: 0.34, z: 0, color: 0x15803d, roughness: 0.55 });
    v(torsoPivot, { w: 0.38, h: 0.12, d: 0.34, x: 0, y: 0.68, z: 0, color: 0x166534 });
    headPivot.position.set(0, 0.62, 0);
    // Giant glowing cyclops eye
    v(headPivot, { w: 0.24, h: 0.24, d: 0.06, x: 0, y: -0.06, z: 0.2, color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.45 });
    v(headPivot, { w: 0.12, h: 0.12, d: 0.07, x: 0, y: -0.06, z: 0.21, color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 1.4 });
    v(headPivot, { w: 0.28, h: 0.06, d: 0.07, x: 0, y: 0.08, z: 0.21, color: 0x052e16 }); // Unibrow
    v(headPivot, { w: 0.22, h: 0.06, d: 0.05, x: 0, y: -0.26, z: 0.2, color: 0xffffff }); // Menacing grin
    // Twin tall segmented antennae
    v(headPivot, { w: 0.06, h: 0.42, d: 0.06, x: -0.14, y: 0.28, z: 0, color: 0x166534, rz: 0.24 });
    v(headPivot, { w: 0.06, h: 0.42, d: 0.06, x: 0.14, y: 0.28, z: 0, color: 0x166534, rz: -0.24 });
    v(headPivot, { w: 0.09, h: 0.09, d: 0.09, x: -0.2, y: 0.49, z: 0, color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 1.2 });
    v(headPivot, { w: 0.09, h: 0.09, d: 0.09, x: 0.2, y: 0.49, z: 0, color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 1.2 });
    buildLimbs(0x15803d, 0x15803d, 0x166534, 0x052e16, 0x4ade80);
  } else {
    // Police Pursuer
    v(torsoPivot, { w: 0.58, h: 0.6, d: 0.34, x: 0, y: 0.3, z: 0, color: 0x1e3a8a, roughness: 0.65 });
    v(torsoPivot, { w: 0.14, h: 0.14, d: 0.04, x: 0.14, y: 0.42, z: 0.18, color: 0xfacc15, metalness: 0.8, roughness: 0.2 }); // Badge
    v(torsoPivot, { w: 0.6, h: 0.08, d: 0.36, x: 0, y: 0.05, z: 0, color: 0x0f172a }); // Utility belt
    v(headPivot, { w: 0.48, h: 0.46, d: 0.46, x: 0, y: 0.24, z: 0, color: 0xf3cfb6, roughness: 0.72 });
    // Police peaked cap
    v(headPivot, { w: 0.52, h: 0.16, d: 0.52, x: 0, y: 0.5, z: 0, color: 0x1e3a8a });
    v(headPivot, { w: 0.52, h: 0.05, d: 0.18, x: 0, y: 0.43, z: 0.26, color: 0x0f172a });
    v(headPivot, { w: 0.12, h: 0.1, d: 0.04, x: 0, y: 0.51, z: 0.27, color: 0xfacc15 });
    // Shades
    v(headPivot, { w: 0.42, h: 0.1, d: 0.06, x: 0, y: 0.27, z: 0.24, color: 0x020617, roughness: 0.15 });
    // Shoulder flashing sirens
    policeBeaconRed = v(torsoPivot, {
      w: 0.1,
      h: 0.1,
      d: 0.1,
      x: -0.24,
      y: 0.64,
      z: 0,
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.5,
    });
    policeBeaconBlue = v(torsoPivot, {
      w: 0.1,
      h: 0.1,
      d: 0.1,
      x: 0.24,
      y: 0.64,
      z: 0,
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 1.5,
    });
    buildLimbs(0xf3cfb6, 0x1e3a8a, 0x0f172a, 0x020617, 0x475569);
  }

  // Hoverboard accessory (hidden by default)
  const hoverboardGroup = new THREE.Group();
  hoverboardGroup.visible = false;
  hoverboardGroup.position.set(0, 0.06, 0);
  v(hoverboardGroup, { w: 0.72, h: 0.09, d: 1.45, x: 0, y: 0, z: 0, color: 0x06b6d4, roughness: 0.25, metalness: 0.6 });
  v(hoverboardGroup, { w: 0.56, h: 0.1, d: 1.1, x: 0, y: 0.01, z: 0, color: 0xf43f5e, emissive: 0x06b6d4, emissiveIntensity: 0.6 });
  bodyPivot.add(hoverboardGroup);

  // Jetpack accessory (hidden by default)
  const jetpackGroup = new THREE.Group();
  jetpackGroup.visible = false;
  jetpackGroup.position.set(0, 0.34, -0.25);
  v(jetpackGroup, { w: 0.18, h: 0.46, d: 0.18, x: -0.13, y: 0, z: 0, color: 0xe2e8f0, metalness: 0.7, roughness: 0.25 });
  v(jetpackGroup, { w: 0.18, h: 0.46, d: 0.18, x: 0.13, y: 0, z: 0, color: 0xe2e8f0, metalness: 0.7, roughness: 0.25 });
  v(jetpackGroup, { w: 0.12, h: 0.18, d: 0.12, x: -0.13, y: -0.3, z: 0, color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 2.0 });
  v(jetpackGroup, { w: 0.12, h: 0.18, d: 0.12, x: 0.13, y: -0.3, z: 0, color: 0xfacc15, emissive: 0xf97316, emissiveIntensity: 2.0 });
  torsoPivot.add(jetpackGroup);

  // Magnet Aura Ring
  const auraGeo = new THREE.TorusGeometry(0.68, 0.035, 8, 24);
  const auraMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.3,
    transparent: true,
    opacity: 0.75,
  });
  const magnetAura = new THREE.Mesh(auraGeo, auraMat);
  magnetAura.rotation.x = Math.PI / 2;
  magnetAura.position.y = 0.85;
  magnetAura.visible = false;
  root.add(magnetAura);
  geos.push(auraGeo);
  mats.push(auraMat);

  // Shield Ring (for super jump / multiplier)
  const shieldGeo = new THREE.TorusGeometry(0.76, 0.03, 8, 24);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.75,
  });
  const shieldRing = new THREE.Mesh(shieldGeo, shieldMat);
  shieldRing.rotation.x = Math.PI / 2;
  shieldRing.position.y = 0.25;
  shieldRing.visible = false;
  root.add(shieldRing);
  geos.push(shieldGeo);
  mats.push(shieldMat);

  // Soft Ground Contact Shadow
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const contactShadow = new THREE.Mesh(_sharedShadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);
  mats.push(shadowMat);

  return {
    skinId: skin,
    root,
    bodyPivot,
    torsoPivot,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    tailPivot,
    capePivot,
    followerMice,
    auraParticles,
    blinkLids,
    speedTrailParticles,
    eyeAuraParticles,
    spawnTimer: 0,
    hoverboardGroup,
    jetpackGroup,
    magnetAura,
    shieldRing,
    contactShadow,
    policeBeaconRed,
    policeBeaconBlue,
    customMeshRefs,
    flashMaterials,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      if (customMeshRefs) {
        Object.values(customMeshRefs.regionTextures).forEach((t) => t?.dispose());
      }
    },
  };
}

function drawCapeCanvas(cfg: PlayerCapeConfig): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  const primary = cfg.primaryColor || '#e11d48';
  const secondary = cfg.secondaryColor || '#0f172a';
  const textCol = cfg.textColor || '#ffffff';

  if (cfg.backgroundStyle === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, primary);
    grad.addColorStop(1, secondary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (cfg.backgroundStyle === 'striped') {
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = secondary;
    for (let x = 0; x < w; x += 48) {
      ctx.fillRect(x, 0, 24, h);
    }
  } else if (cfg.backgroundStyle === 'checkered') {
    const cell = 32;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) % 2 === 0) ? primary : secondary;
        ctx.fillRect(x, y, cell, cell);
      }
    }
  } else if (cfg.backgroundStyle === 'stars') {
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = secondary;
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 73) % (w - 30)) + 15;
      const sy = ((i * 119) % (h - 30)) + 15;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 9 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, w, h);
  }

  // Border trim
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, w - 14, h - 14);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textCol;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;

  if (cfg.equippedCapeId === 'capa_camisa_10') {
    const label = (cfg.shirt10Name || 'CRAQUE').toUpperCase().slice(0, 12);
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(label, w / 2, 100, w - 36);
    ctx.font = '900 132px sans-serif';
    ctx.fillText('10', w / 2, 232);
  } else {
    const raw = (cfg.customText || 'RATÃO').toUpperCase().slice(0, 16);
    ctx.font = raw.length > 9 ? '900 38px sans-serif' : '900 48px sans-serif';
    ctx.fillText(raw, w / 2, 192, w - 34);
  }

  return canvas;
}

export function applyCustomCapeToRig(
  rig: CharacterRig,
  capeConfig?: PlayerCapeConfig | null
): void {
  const active = Boolean(capeConfig && capeConfig.equippedCapeId !== 'none');
  if (rig.capePivot) {
    rig.capePivot.visible = !active;
  }
  if (!active || !capeConfig) {
    if (rig.customCapePivot) {
      rig.customCapePivot.visible = false;
    }
    return;
  }

  const key = JSON.stringify({
    e: capeConfig.equippedCapeId,
    t: capeConfig.customText,
    s: capeConfig.shirt10Name,
    p: capeConfig.primaryColor,
    sec: capeConfig.secondaryColor,
    tc: capeConfig.textColor,
    bg: capeConfig.backgroundStyle,
  });

  if (!rig.customCapePivot) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.56, -0.18);
    rig.torsoPivot.add(pivot);

    const geo = new THREE.BoxGeometry(0.58, 0.86, 0.04);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.08,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -0.43, -0.03);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);

    rig.customCapePivot = pivot;
    rig.customCapeMesh = mesh;

    const prevDispose = rig.dispose;
    rig.dispose = () => {
      prevDispose();
      geo.dispose();
      mat.dispose();
      rig.customCapeTex?.dispose();
    };
  }

  rig.customCapePivot.visible = true;
  if (rig.customCapeKey !== key && rig.customCapeMesh) {
    rig.customCapeKey = key;
    rig.customCapeTex?.dispose();
    const canvas = drawCapeCanvas(capeConfig);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    rig.customCapeTex = tex;
    const mat = rig.customCapeMesh.material as THREE.MeshStandardMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
  }
}

export function createSkateMesh(skateId: SkateId): {
  group: THREE.Group;
  dispose: () => void;
} {
  const def = getSkateDefinition(skateId);
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const dummyFlash: THREE.MeshStandardMaterial[] = [];

  const primary = parseInt(def.primaryColor.replace('#', ''), 16);
  const accent = parseInt(def.accentColor.replace('#', ''), 16);
  const wheel = parseInt(def.wheelColor.replace('#', ''), 16);
  const effect = parseInt(def.effectColor.replace('#', ''), 16);

  // Main deck + upturned nose/tail
  addVoxel(
    group,
    {
      w: 0.64,
      h: 0.08,
      d: 1.24,
      x: 0,
      y: 0.11,
      z: 0,
      color: primary,
      roughness: skateId === 'skate_dourado' ? 0.2 : 0.4,
      metalness: skateId === 'skate_dourado' ? 0.85 : 0.25,
      emissive: skateId === 'skate_eletrico' || skateId === 'skate_galactico' ? effect : 0x000000,
      emissiveIntensity: skateId === 'skate_eletrico' || skateId === 'skate_galactico' ? 0.35 : 0,
    },
    geos,
    mats,
    dummyFlash
  );
  addVoxel(
    group,
    { w: 0.56, h: 0.07, d: 0.24, x: 0, y: 0.14, z: 0.68, color: accent, rx: -0.35 },
    geos,
    mats,
    dummyFlash
  );
  addVoxel(
    group,
    { w: 0.56, h: 0.07, d: 0.24, x: 0, y: 0.14, z: -0.68, color: accent, rx: 0.35 },
    geos,
    mats,
    dummyFlash
  );
  // Center grip stripe
  addVoxel(
    group,
    {
      w: 0.24,
      h: 0.09,
      d: 1.05,
      x: 0,
      y: 0.115,
      z: 0,
      color: accent,
      emissive: skateId === 'skate_fogo' || skateId === 'skate_eletrico' ? effect : 0x000000,
      emissiveIntensity: skateId === 'skate_fogo' || skateId === 'skate_eletrico' ? 0.8 : 0,
    },
    geos,
    mats,
    dummyFlash
  );

  // Trucks
  addVoxel(group, { w: 0.48, h: 0.06, d: 0.08, x: 0, y: 0.05, z: 0.4, color: 0xcbd5e1, metalness: 0.7 }, geos, mats, dummyFlash);
  addVoxel(group, { w: 0.48, h: 0.06, d: 0.08, x: 0, y: 0.05, z: -0.4, color: 0xcbd5e1, metalness: 0.7 }, geos, mats, dummyFlash);

  // 4 Wheels
  const wheelCoords = [
    [-0.28, 0.05, 0.4],
    [0.28, 0.05, 0.4],
    [-0.28, 0.05, -0.4],
    [0.28, 0.05, -0.4],
  ];
  for (const [wx, wy, wz] of wheelCoords) {
    addVoxel(
      group,
      {
        w: 0.1,
        h: 0.12,
        d: 0.12,
        x: wx,
        y: wy,
        z: wz,
        color: wheel,
        roughness: 0.35,
        emissive: skateId === 'skate_eletrico' ? effect : 0x000000,
        emissiveIntensity: skateId === 'skate_eletrico' ? 0.7 : 0,
      },
      geos,
      mats,
      dummyFlash
    );
  }

  // Theme-specific voxel flair
  if (skateId === 'skate_fogo') {
    addVoxel(group, { w: 0.18, h: 0.12, d: 0.28, x: -0.2, y: 0.14, z: -0.78, color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 1.4 }, geos, mats, dummyFlash);
    addVoxel(group, { w: 0.18, h: 0.12, d: 0.28, x: 0.2, y: 0.14, z: -0.78, color: 0xfacc15, emissive: 0xf97316, emissiveIntensity: 1.4 }, geos, mats, dummyFlash);
  } else if (skateId === 'skate_galactico') {
    addVoxel(group, { w: 0.12, h: 0.12, d: 0.12, x: -0.22, y: 0.17, z: 0.22, color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.3 }, geos, mats, dummyFlash);
    addVoxel(group, { w: 0.12, h: 0.12, d: 0.12, x: 0.22, y: 0.17, z: -0.22, color: 0xe879f9, emissive: 0xd946ef, emissiveIntensity: 1.3 }, geos, mats, dummyFlash);
  } else if (skateId === 'skate_camuflado') {
    addVoxel(group, { w: 0.22, h: 0.092, d: 0.28, x: -0.18, y: 0.112, z: 0.24, color: 0x14532d }, geos, mats, dummyFlash);
    addVoxel(group, { w: 0.22, h: 0.092, d: 0.28, x: 0.18, y: 0.112, z: -0.24, color: 0x713f12 }, geos, mats, dummyFlash);
  } else if (skateId === 'skate_dourado') {
    addVoxel(group, { w: 0.68, h: 0.04, d: 1.28, x: 0, y: 0.14, z: 0, color: 0xfef08a, emissive: 0xeab308, emissiveIntensity: 0.6 }, geos, mats, dummyFlash);
  }

  return {
    group,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

export function applyEquippedSkateToRig(
  rig: CharacterRig,
  skateId?: SkateId | null,
  active = false
): void {
  if (!skateId || !active) {
    if (rig.customSkateGroup) {
      rig.customSkateGroup.visible = false;
    }
    return;
  }

  if (rig.customSkateId !== skateId) {
    if (rig.customSkateGroup) {
      rig.bodyPivot.remove(rig.customSkateGroup);
      rig.customSkateDispose?.();
    }
    const built = createSkateMesh(skateId);
    built.group.position.set(0, 0.02, 0);
    rig.bodyPivot.add(built.group);
    rig.customSkateGroup = built.group;
    rig.customSkateId = skateId;
    rig.customSkateDispose = built.dispose;

    const prevDispose = rig.dispose;
    rig.dispose = () => {
      prevDispose();
      built.dispose();
    };
  }

  if (rig.customSkateGroup) {
    rig.customSkateGroup.visible = true;
  }
}

export function createCharacterRig(
  skin: SkinId,
  castShadow = true,
  customConfig?: CustomCharacterConfig
): CharacterRig {
  return buildCharacterBase(skin, castShadow, customConfig);
}

export function applyCustomPaintRegion(
  rig: CharacterRig,
  region: PaintRegion,
  source: string | HTMLCanvasElement | null
): void {
  if (!rig.customMeshRefs) return;
  const overlays = rig.customMeshRefs.regionOverlays[region] || [];
  const prevTex = rig.customMeshRefs.regionTextures[region];
  if (prevTex) {
    prevTex.dispose();
    delete rig.customMeshRefs.regionTextures[region];
  }

  if (!source) {
    for (const m of overlays) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map = null;
      mat.visible = false;
      mat.needsUpdate = true;
    }
    return;
  }

  let tex: THREE.Texture;
  if (typeof source === 'string') {
    tex = new THREE.TextureLoader().load(source);
  } else {
    tex = new THREE.CanvasTexture(source);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  rig.customMeshRefs.regionTextures[region] = tex;

  for (const m of overlays) {
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.map = tex;
    mat.visible = true;
    mat.needsUpdate = true;
  }
}

export function createPoliceRig(castShadow = true): CharacterRig {
  return buildCharacterBase('police', castShadow);
}

export function createFloatingNameTag(nickname: string, badgeColor = '#f59e0b'): {
  sprite: THREE.Sprite;
  dispose: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Pill plate background in WebGL sprite
  ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(14, 14, 292, 52, 18);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nickname.slice(0, 16), 160, 41);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.1, 0.52, 1);
  sprite.position.set(0, 2.35, 0);
  return {
    sprite,
    dispose: () => {
      tex.dispose();
      mat.dispose();
    },
  };
}

function animateExclusiveExtras(
  rig: CharacterRig,
  state: CharacterAnimState,
  elapsed: number,
  dt: number,
  speedFactor: number
): void {
  // Subtle royal entrance pop animation
  if (rig.spawnTimer < 0.65) {
    rig.spawnTimer = Math.min(0.65, rig.spawnTimer + dt);
    const t = rig.spawnTimer / 0.65;
    const s = t < 0.7 ? 0.85 + (t / 0.7) * 0.21 : 1.06 - ((t - 0.7) / 0.3) * 0.06;
    rig.bodyPivot.scale.setScalar(s);
  } else if (rig.bodyPivot.scale.x !== 1) {
    rig.bodyPivot.scale.setScalar(1);
  }

  // Orbiting exclusive aura particles
  if (rig.auraParticles) {
    for (const pt of rig.auraParticles) {
      const a = pt.angle + elapsed * pt.speed;
      pt.mesh.position.set(
        Math.cos(a) * pt.radius,
        pt.heightOffset + Math.sin(elapsed * 3.5 + pt.angle) * 0.16,
        Math.sin(a) * pt.radius
      );
      pt.mesh.rotation.y += dt * 3;
      pt.mesh.rotation.x += dt * 2;
    }
  }

  // Ratão Rei's 5 animated follower mice
  if (rig.followerMice) {
    const k = Math.min(1, 1 - Math.exp(-14 * dt));
    for (const m of rig.followerMice) {
      if (state === 'idle') {
        m.body.position.y = THREE.MathUtils.lerp(
          m.body.position.y,
          Math.abs(Math.sin(elapsed * 3.2 + m.phase)) * 0.05,
          k
        );
        m.body.rotation.x = THREE.MathUtils.lerp(m.body.rotation.x, 0, k);
        m.leftLeg.rotation.x = THREE.MathUtils.lerp(m.leftLeg.rotation.x, 0, k);
        m.rightLeg.rotation.x = THREE.MathUtils.lerp(m.rightLeg.rotation.x, 0, k);
        m.group.position.x = THREE.MathUtils.lerp(
          m.group.position.x,
          m.baseX + Math.sin(elapsed * 1.8 + m.phase) * 0.06,
          k
        );
      } else if (state === 'run' || state === 'stumble') {
        const stride = Math.sin(elapsed * 16 * speedFactor + m.phase);
        m.body.position.y = THREE.MathUtils.lerp(m.body.position.y, Math.abs(stride) * 0.1, k);
        m.body.rotation.x = THREE.MathUtils.lerp(m.body.rotation.x, 0.14, k);
        m.leftLeg.rotation.x = stride * 0.9;
        m.rightLeg.rotation.x = -stride * 0.9;
        m.group.position.x = THREE.MathUtils.lerp(
          m.group.position.x,
          m.baseX + Math.sin(elapsed * 5 + m.phase) * 0.08,
          k
        );
      } else if (state === 'jump' || state === 'jetpack') {
        m.body.position.y = THREE.MathUtils.lerp(
          m.body.position.y,
          0.16 + Math.sin(elapsed * 8 + m.phase) * 0.08,
          k
        );
        m.body.rotation.x = THREE.MathUtils.lerp(m.body.rotation.x, -0.18, k);
        m.leftLeg.rotation.x = 0.6;
        m.rightLeg.rotation.x = -0.5;
      } else if (state === 'slide') {
        m.body.position.y = THREE.MathUtils.lerp(m.body.position.y, -0.05, k);
        m.body.rotation.x = THREE.MathUtils.lerp(m.body.rotation.x, -0.55, k);
      } else {
        m.body.position.y = THREE.MathUtils.lerp(m.body.position.y, 0, k);
        m.body.rotation.x = THREE.MathUtils.lerp(m.body.rotation.x, -0.4, k);
      }
    }
  }

  // Herobrine eye aura particles
  if (rig.eyeAuraParticles) {
    for (const pt of rig.eyeAuraParticles) {
      const pulse = Math.sin(elapsed * 3.8 + pt.phase);
      pt.mesh.position.set(
        pt.baseX + Math.cos(elapsed * 2.4 + pt.phase) * 0.025,
        pt.baseY + Math.abs(pulse) * 0.05,
        pt.baseZ + Math.sin(elapsed * 2.1 + pt.phase) * 0.02
      );
      pt.mesh.scale.setScalar(0.75 + (pulse + 1) * 0.25);
    }
  }

  // Freddy Fazbear blinking eyelids
  if (rig.blinkLids) {
    const cycle = elapsed % 2.8;
    const isBlinking = cycle > 2.62;
    const blinkScale = isBlinking ? 1.0 : 0.16;
    for (const lid of rig.blinkLids) {
      lid.scale.y = blinkScale;
      lid.position.y = isBlinking ? 0.31 : 0.36;
    }
  }

  // Sonic blue kinetic speed trail particles
  if (rig.speedTrailParticles) {
    const runningFast = state === 'run' || state === 'jump' || state === 'jetpack';
    for (const pt of rig.speedTrailParticles) {
      const cycle = (elapsed * (runningFast ? 6.5 : 2.2) + pt.phase) % 1;
      pt.mesh.visible = runningFast || state === 'idle' || state === 'victory';
      pt.mesh.position.set(
        pt.baseX,
        pt.baseY + Math.sin(elapsed * 7 + pt.phase) * 0.05,
        runningFast ? pt.baseZ - cycle * 0.85 : pt.baseZ - cycle * 0.2
      );
      const scaleZ = runningFast ? 1.15 - cycle * 0.7 : 0.45 * (1 - cycle * 0.5);
      pt.mesh.scale.set(runningFast ? 0.9 : 0.6, runningFast ? 0.9 : 0.6, Math.max(0.15, scaleZ));
    }
  }
}

export function animateCharacterRig(
  rig: CharacterRig,
  state: CharacterAnimState,
  elapsed: number,
  dt: number,
  speedFactor = 1
): void {
  const k = Math.min(1, 1 - Math.exp(-16 * dt));
  animateExclusiveExtras(rig, state, elapsed, dt, speedFactor);

  // Reset secondary axes cleanly unless overridden below
  const resetSecondaryAxes = () => {
    rig.leftArmPivot.rotation.z = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.z, 0, k);
    rig.rightArmPivot.rotation.z = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.z, 0, k);
    rig.leftLegPivot.rotation.z = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.z, 0, k);
    rig.rightLegPivot.rotation.z = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.z, 0, k);
    rig.headPivot.rotation.x = THREE.MathUtils.lerp(rig.headPivot.rotation.x, 0, k);
    rig.headPivot.rotation.z = THREE.MathUtils.lerp(rig.headPivot.rotation.z, 0, k);
  };

  if (state === 'victory') {
    // Signature open-arms victory celebration ("Siuuu!" stance for Cristiano Ronaldo & celebratory pose)
    const pulse = Math.sin(elapsed * 4.5);
    const hop = Math.max(0, Math.sin(elapsed * 3.0)) * 0.08;
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, hop, k);
    rig.bodyPivot.rotation.set(0, 0, 0);
    rig.torsoPivot.rotation.x = THREE.MathUtils.lerp(rig.torsoPivot.rotation.x, -0.18 + pulse * 0.03, k);
    rig.torsoPivot.rotation.y = THREE.MathUtils.lerp(rig.torsoPivot.rotation.y, 0, k);
    rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(rig.torsoPivot.rotation.z, 0, k);
    rig.headPivot.rotation.x = THREE.MathUtils.lerp(rig.headPivot.rotation.x, -0.16, k);
    rig.headPivot.rotation.y = THREE.MathUtils.lerp(rig.headPivot.rotation.y, Math.sin(elapsed * 2.0) * 0.12, k);
    rig.headPivot.rotation.z = THREE.MathUtils.lerp(rig.headPivot.rotation.z, 0, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, 0.24, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, 0.24, k);
    rig.leftArmPivot.rotation.z = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.z, -1.28 - pulse * 0.08, k);
    rig.rightArmPivot.rotation.z = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.z, 1.28 + pulse * 0.08, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, -0.08, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, 0.08, k);
    rig.leftLegPivot.rotation.z = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.z, -0.22, k);
    rig.rightLegPivot.rotation.z = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.z, 0.22, k);
    if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(elapsed * 5) * 0.3;
    if (rig.capePivot) rig.capePivot.rotation.x = 0.25 + Math.sin(elapsed * 4) * 0.08;
    if (rig.customCapePivot) rig.customCapePivot.rotation.x = 0.25 + Math.sin(elapsed * 4) * 0.08;
    return;
  }

  if (state === 'idle') {
    // Cristiano Ronaldo periodically breaks into his open-arms celebration during showcase/idle!
    if (rig.skinId === 'cristiano_ronaldo' && elapsed % 5.0 > 3.35) {
      animateCharacterRig(rig, 'victory', elapsed, dt, speedFactor);
      return;
    }

    resetSecondaryAxes();
    const breath = Math.sin(elapsed * 3.0);
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, 0, k);
    rig.bodyPivot.rotation.set(0, 0, 0);
    rig.torsoPivot.rotation.x = THREE.MathUtils.lerp(rig.torsoPivot.rotation.x, breath * 0.04, k);
    rig.torsoPivot.rotation.y = THREE.MathUtils.lerp(rig.torsoPivot.rotation.y, 0, k);
    rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(rig.torsoPivot.rotation.z, 0, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, Math.sin(elapsed * 2.5) * 0.08, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -Math.sin(elapsed * 2.5) * 0.08, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, 0, k);

    if (rig.skinId === 'freddy_fazbear') {
      // Subtle eerie animatronic head twitch
      const twitchCycle = elapsed % 3.2;
      const twitchZ = twitchCycle > 2.95 ? Math.sin(elapsed * 42) * 0.16 : 0;
      rig.headPivot.rotation.y = Math.sin(elapsed * 1.1) * 0.12 + (twitchCycle > 2.95 ? 0.12 : 0);
      rig.headPivot.rotation.z = twitchZ;
    } else if (rig.skinId === 'plankton') {
      rig.headPivot.rotation.y = Math.sin(elapsed * 2.8) * 0.18;
    } else {
      rig.headPivot.rotation.y = Math.sin(elapsed * 1.4) * 0.14;
    }

    if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(elapsed * 4.5) * 0.25;
    if (rig.capePivot) rig.capePivot.rotation.x = 0.08 + Math.sin(elapsed * 3.5) * 0.06;
    if (rig.customCapePivot) rig.customCapePivot.rotation.x = 0.08 + Math.sin(elapsed * 3.5) * 0.06;
    return;
  }

  resetSecondaryAxes();
  const ridingBoard = Boolean(rig.hoverboardGroup.visible || rig.customSkateGroup?.visible);

  if (state === 'run' || state === 'stumble') {
    const isTungTung = rig.skinId === 'tung_tung_sahur';
    const isFreddy = rig.skinId === 'freddy_fazbear';
    const isSonic = rig.skinId === 'sonic';
    const isCR7 = rig.skinId === 'cristiano_ronaldo';
    const isEnderman = rig.skinId === 'enderman';
    const isPlankton = rig.skinId === 'plankton';
    const isFootballer =
      isCR7 || rig.skinId === 'ronaldinho_gaucho' || rig.skinId === 'vini_jr';

    const freqMult = isSonic
      ? 1.25
      : isPlankton
        ? 1.32
        : isTungTung
          ? 1.15
          : isFootballer
            ? 1.1
            : 1.0;
    const strideFreq = 13.5 * speedFactor * freqMult;
    const phase = elapsed * strideFreq;
    const swing = isFreddy
      ? Math.round(Math.sin(phase) * 4) / 4 // Mechanical stepped animatronic cadence
      : Math.sin(phase);
    const bob = Math.abs(Math.sin(phase)) * (isTungTung ? 0.17 : 0.1);

    rig.bodyPivot.position.y = THREE.MathUtils.lerp(
      rig.bodyPivot.position.y,
      ridingBoard ? 0.16 + Math.sin(elapsed * 6) * 0.04 : bob,
      k
    );
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(
      rig.bodyPivot.rotation.x,
      state === 'stumble' ? 0.25 : isSonic ? 0.24 : isFootballer ? 0.18 : 0.12,
      k
    );
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(
      rig.bodyPivot.rotation.z,
      state === 'stumble'
        ? Math.sin(elapsed * 28) * 0.25
        : isTungTung
          ? Math.cos(phase) * 0.11
          : ridingBoard
            ? Math.sin(elapsed * 4.5) * 0.08
            : 0,
      k
    );
    rig.torsoPivot.rotation.x = THREE.MathUtils.lerp(rig.torsoPivot.rotation.x, isSonic ? 0.18 : 0.1, k);
    rig.torsoPivot.rotation.y = Math.cos(phase) * (isTungTung ? 0.18 : 0.08);
    rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(rig.torsoPivot.rotation.z, 0, k);

    if (ridingBoard) {
      rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0.18, k);
      rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, -0.18, k);
      rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -0.35, k);
      rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.35, k);
      rig.leftArmPivot.rotation.z = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.z, -0.32, k);
      rig.rightArmPivot.rotation.z = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.z, 0.32, k);
    } else if (isTungTung) {
      // Hilarious exaggerated comedic running gait for Tung Tung Tung Sahur
      rig.leftLegPivot.rotation.x = swing * 1.25;
      rig.rightLegPivot.rotation.x = -swing * 1.25;
      rig.leftArmPivot.rotation.x = -swing * 1.32;
      rig.rightArmPivot.rotation.x = swing * 1.15;
      rig.leftArmPivot.rotation.z = -0.22 - Math.abs(swing) * 0.2;
      rig.rightArmPivot.rotation.z = 0.22 + Math.abs(swing) * 0.2;
    } else if (isSonic) {
      // Super-fast trailing arms sprint pose
      rig.leftLegPivot.rotation.x = swing * 1.15;
      rig.rightLegPivot.rotation.x = -swing * 1.15;
      rig.leftArmPivot.rotation.x = 0.72 - swing * 0.28;
      rig.rightArmPivot.rotation.x = 0.72 + swing * 0.28;
    } else if (isEnderman) {
      rig.leftLegPivot.rotation.x = swing * 1.05;
      rig.rightLegPivot.rotation.x = -swing * 1.05;
      rig.leftArmPivot.rotation.x = state === 'stumble' ? -1.4 : -swing * 0.55;
      rig.rightArmPivot.rotation.x = state === 'stumble' ? -1.4 : swing * 0.55;
    } else if (isFootballer) {
      // Athletic footballer sprint stride
      rig.leftLegPivot.rotation.x = swing * 1.05;
      rig.rightLegPivot.rotation.x = -swing * 1.05;
      rig.leftArmPivot.rotation.x = -0.22 - swing * 0.92;
      rig.rightArmPivot.rotation.x = -0.22 + swing * 0.92;
    } else {
      rig.leftLegPivot.rotation.x = swing * 0.95;
      rig.rightLegPivot.rotation.x = -swing * 0.95;
      rig.leftArmPivot.rotation.x = -swing * 0.88;
      rig.rightArmPivot.rotation.x = swing * 0.88;
    }

    if (state === 'stumble') {
      rig.headPivot.rotation.y = Math.sin(elapsed * 18) * 0.35;
    } else if (isFreddy) {
      const twitch = elapsed % 2.9 > 2.72 ? Math.sin(elapsed * 44) * 0.14 : 0;
      rig.headPivot.rotation.y = twitch;
      rig.headPivot.rotation.z = twitch * 0.8;
    } else if (isTungTung) {
      rig.headPivot.rotation.y = Math.sin(phase) * 0.14;
      rig.headPivot.rotation.z = Math.cos(phase) * 0.09;
    } else {
      rig.headPivot.rotation.y = 0;
    }

    if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(phase) * 0.35;
    if (rig.capePivot) rig.capePivot.rotation.x = 0.35 + Math.sin(phase * 1.4) * 0.18;
    if (rig.customCapePivot) rig.customCapePivot.rotation.x = 0.35 + Math.sin(phase * 1.4) * 0.18;
  } else if (state === 'jump') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, 0.05, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, -0.08, k);
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(rig.bodyPivot.rotation.z, 0, k);
    if (rig.skinId === 'mario' || rig.skinId === 'luigi') {
      rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -0.35, k);
      rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -2.75, k);
    } else {
      rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -2.2, k);
      rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -2.2, k);
    }
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0.65, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, -0.45, k);
    if (rig.capePivot) rig.capePivot.rotation.x = 0.55;
    if (rig.customCapePivot) rig.customCapePivot.rotation.x = 0.55;
  } else if (state === 'slide') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, -0.34, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, -1.05, k);
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(rig.bodyPivot.rotation.z, 0, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, 0.9, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, 0.9, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0.4, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, 0.4, k);
    if (rig.customCapePivot) rig.customCapePivot.rotation.x = 0.72;
  } else if (state === 'jetpack') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, Math.sin(elapsed * 8) * 0.08, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, 0.42, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -0.8, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.8, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, -0.2, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, -0.2, k);
    if (rig.customCapePivot) rig.customCapePivot.rotation.x = 0.65;
  } else if (state === 'crash') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, -0.2, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, -1.35, k);
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(rig.bodyPivot.rotation.z, 0.35, k);
    if (rig.customCapePivot) rig.customCapePivot.rotation.x = 0.25;
  }

  // Police flashing shoulder lights
  if (rig.policeBeaconRed && rig.policeBeaconBlue) {
    const flash = Math.sin(elapsed * 18) > 0;
    (rig.policeBeaconRed.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 2.5 : 0.2;
    (rig.policeBeaconBlue.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 0.2 : 2.5;
  }
}
