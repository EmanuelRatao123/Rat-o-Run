import * as THREE from 'three';
import { SkinId } from '../shared/constants.ts';
import { createRadialShadowTexture } from './materials.ts';

export type CharacterAnimState = 'idle' | 'run' | 'jump' | 'slide' | 'stumble' | 'crash' | 'jetpack';

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

export interface CharacterRig {
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
  followerMice?: FollowerMouseRig[];
  auraParticles?: AuraParticleRig[];
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
  castShadow = true
): CharacterRig {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const flashMaterials: THREE.MeshStandardMaterial[] = [];

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

  const v = (p: THREE.Object3D, s: BoxSpec) => {
    const m = addVoxel(p, s, geos, mats, flashMaterials);
    m.castShadow = castShadow;
    return m;
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
    spawnTimer: 0,
    hoverboardGroup,
    jetpackGroup,
    magnetAura,
    shieldRing,
    contactShadow,
    policeBeaconRed,
    policeBeaconBlue,
    flashMaterials,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

export function createCharacterRig(skin: SkinId, castShadow = true): CharacterRig {
  return buildCharacterBase(skin, castShadow);
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

  if (state === 'idle') {
    const breath = Math.sin(elapsed * 3.0);
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, 0, k);
    rig.bodyPivot.rotation.set(0, 0, 0);
    rig.torsoPivot.rotation.x = THREE.MathUtils.lerp(rig.torsoPivot.rotation.x, breath * 0.04, k);
    rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(rig.torsoPivot.rotation.z, 0, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, Math.sin(elapsed * 2.5) * 0.08, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -Math.sin(elapsed * 2.5) * 0.08, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, 0, k);
    rig.headPivot.rotation.y = Math.sin(elapsed * 1.4) * 0.14;
    if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(elapsed * 4.5) * 0.25;
    if (rig.capePivot) rig.capePivot.rotation.x = 0.08 + Math.sin(elapsed * 3.5) * 0.06;
    return;
  }

  if (state === 'run' || state === 'stumble') {
    const strideFreq = 13.5 * speedFactor;
    const phase = elapsed * strideFreq;
    const swing = Math.sin(phase);
    const bob = Math.abs(Math.sin(phase)) * 0.1;

    rig.bodyPivot.position.y = THREE.MathUtils.lerp(
      rig.bodyPivot.position.y,
      rig.hoverboardGroup.visible ? 0.14 + Math.sin(elapsed * 6) * 0.04 : bob,
      k
    );
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(
      rig.bodyPivot.rotation.x,
      state === 'stumble' ? 0.25 : 0.12,
      k
    );
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(
      rig.bodyPivot.rotation.z,
      state === 'stumble' ? Math.sin(elapsed * 28) * 0.25 : 0,
      k
    );
    rig.torsoPivot.rotation.x = THREE.MathUtils.lerp(rig.torsoPivot.rotation.x, 0.1, k);
    rig.torsoPivot.rotation.y = Math.cos(phase) * 0.08;

    if (rig.hoverboardGroup.visible) {
      rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0.15, k);
      rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, -0.15, k);
      rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -0.35, k);
      rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.35, k);
    } else {
      rig.leftLegPivot.rotation.x = swing * 0.95;
      rig.rightLegPivot.rotation.x = -swing * 0.95;
      rig.leftArmPivot.rotation.x = -swing * 0.88;
      rig.rightArmPivot.rotation.x = swing * 0.88;
    }

    rig.headPivot.rotation.y = state === 'stumble' ? Math.sin(elapsed * 18) * 0.35 : 0;
    if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(phase) * 0.35;
    if (rig.capePivot) rig.capePivot.rotation.x = 0.35 + Math.sin(phase * 1.4) * 0.18;
  } else if (state === 'jump') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, 0.05, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, -0.08, k);
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(rig.bodyPivot.rotation.z, 0, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -2.2, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -2.2, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0.65, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, -0.45, k);
    if (rig.capePivot) rig.capePivot.rotation.x = 0.55;
  } else if (state === 'slide') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, -0.34, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, -1.05, k);
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(rig.bodyPivot.rotation.z, 0, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, 0.9, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, 0.9, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0.4, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, 0.4, k);
  } else if (state === 'jetpack') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, Math.sin(elapsed * 8) * 0.08, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, 0.42, k);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -0.8, k);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.8, k);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, -0.2, k);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, -0.2, k);
  } else if (state === 'crash') {
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, -0.2, k);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, -1.35, k);
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(rig.bodyPivot.rotation.z, 0.35, k);
  }

  // Police flashing shoulder lights
  if (rig.policeBeaconRed && rig.policeBeaconBlue) {
    const flash = Math.sin(elapsed * 18) > 0;
    (rig.policeBeaconRed.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 2.5 : 0.2;
    (rig.policeBeaconBlue.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 0.2 : 2.5;
  }
}
