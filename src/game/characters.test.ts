import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ALL_SKIN_IDS, SkinId } from '../shared/constants.ts';
import {
  CharacterAnimState,
  animateCharacterRig,
  createCharacterRig,
} from './characters.ts';

// Minimal DOM stub for radial shadow canvas texture in Node environment
if (typeof globalThis.document === 'undefined') {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 64,
          height: 64,
          getContext: () => ({
            createRadialGradient: () => ({
              addColorStop: () => {},
            }),
            fillRect: () => {},
            clearRect: () => {},
            fillStyle: '',
          }),
        };
      }
      return {};
    },
  };
}

function countMeshes(obj: THREE.Object3D): number {
  let count = 0;
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count += 1;
  });
  return count;
}

const ALL_STATES: CharacterAnimState[] = [
  'idle',
  'run',
  'jump',
  'slide',
  'stumble',
  'crash',
  'jetpack',
  'victory',
];

function runTests() {
  for (const skinId of ALL_SKIN_IDS) {
    const rig = createCharacterRig(skinId, false);
    assert.equal(rig.skinId, skinId);
    const meshes = countMeshes(rig.root);
    assert.ok(meshes >= 10, `Skin ${skinId} deve ter geometria 3D detalhada (encontrado ${meshes} meshes)`);

    // Verify all animation states execute without NaN
    for (const state of ALL_STATES) {
      for (let t = 0; t < 5; t++) {
        animateCharacterRig(rig, state, t * 0.9 + 0.1, 0.016, 1.2);
      }
      assert.ok(Number.isFinite(rig.bodyPivot.position.y), `${skinId} ${state} bodyPivot.y finite`);
      assert.ok(Number.isFinite(rig.leftArmPivot.rotation.x), `${skinId} ${state} leftArm.x finite`);
      assert.ok(Number.isFinite(rig.leftArmPivot.rotation.z), `${skinId} ${state} leftArm.z finite`);
      assert.ok(Number.isFinite(rig.rightLegPivot.rotation.x), `${skinId} ${state} rightLeg.x finite`);
    }

    // Specific checks for the 6 new famous skins
    if (skinId === 'herobrine') {
      assert.ok((rig.eyeAuraParticles?.length ?? 0) >= 4, 'Herobrine deve ter partículas sutis nos olhos');
    } else if (skinId === 'freddy_fazbear') {
      assert.equal(rig.blinkLids?.length, 2, 'Freddy deve ter 2 pálpebras animadas');
      animateCharacterRig(rig, 'idle', 2.7, 0.016, 1); // Blink window
      assert.equal(rig.blinkLids![0].scale.y, 1.0);
      animateCharacterRig(rig, 'idle', 0.5, 0.016, 1); // Open window
      assert.equal(rig.blinkLids![0].scale.y, 0.16);
    } else if (skinId === 'sonic') {
      assert.ok((rig.speedTrailParticles?.length ?? 0) >= 4, 'Sonic deve ter partículas azuis de velocidade');
      animateCharacterRig(rig, 'run', 1.0, 0.016, 1.5);
      assert.ok(rig.speedTrailParticles!.every((p) => p.mesh.visible));
    } else if (skinId === 'cristiano_ronaldo') {
      for (let i = 0; i < 40; i++) {
        animateCharacterRig(rig, 'victory', i * 0.05, 0.05, 1);
      }
      assert.ok(rig.leftArmPivot.rotation.z < -0.9, 'CR7 deve abrir o braço esquerdo na vitória');
      assert.ok(rig.rightArmPivot.rotation.z > 0.9, 'CR7 deve abrir o braço direito na vitória');
    }

    rig.dispose();
  }

  console.log(`ALL_${ALL_SKIN_IDS.length}_CHARACTER_RIGS_VERIFIED`);
}

runTests();
