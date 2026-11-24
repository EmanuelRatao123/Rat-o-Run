import assert from 'node:assert/strict';
import {
  generateTrackSequence,
  SeededObstacleKind,
  TRACK_PHYSICS,
  verifySeededCoinSpawn,
} from './trackGenerator.ts';

function getExtent(kind: SeededObstacleKind, z: number): { minZ: number; maxZ: number; blocksGround: boolean; passableByAction: boolean } {
  switch (kind) {
    case 'low_barrier':
      return { minZ: z - 0.45, maxZ: z + 0.45, blocksGround: false, passableByAction: true };
    case 'high_arch':
      return { minZ: z - 0.4, maxZ: z + 0.4, blocksGround: false, passableByAction: true };
    case 'tall_block':
      return { minZ: z - 0.75, maxZ: z + 0.75, blocksGround: true, passableByAction: false };
    case 'tunnel':
      return { minZ: z - 3.5, maxZ: z + 3.5, blocksGround: false, passableByAction: true };
    case 'ramp':
      return { minZ: z - 2.4, maxZ: z + 2.4, blocksGround: false, passableByAction: true };
    case 'train_static':
    case 'train_moving':
      return { minZ: z - 5.25, maxZ: z + 5.25, blocksGround: true, passableByAction: false };
  }
}

function runTrackSafetyTests(): void {
  const seeds = [101, 2024, 99991, 424242, 7777777];
  let totalWaves = 0;

  for (const seed of seeds) {
    const waves = generateTrackSequence(seed, 2500);
    assert.equal(waves.length, 2500);

    for (let i = 0; i < waves.length; i++) {
      const wave = waves[i];
      totalWaves++;

      // 1. Open lane must be valid and never contain a hard blocking obstacle
      assert.ok([-1, 0, 1].includes(wave.openLane), `Invalid openLane at wave ${i}`);
      const openLaneBlocking = wave.obstacles.filter(
        (o) => o.lane === wave.openLane && getExtent(o.kind, o.z).blocksGround
      );
      assert.equal(
        openLaneBlocking.length,
        0,
        `Seed ${seed} wave ${i}: openLane ${wave.openLane} had blocking obstacle`
      );

      // 2. Never block all 3 lanes with non-passable obstacles
      const blockedLanes = new Set(
        wave.obstacles.filter((o) => getExtent(o.kind, o.z).blocksGround).map((o) => o.lane)
      );
      assert.ok(blockedLanes.size < 3, `Seed ${seed} wave ${i}: all 3 lanes blocked!`);

      // 3. No two obstacles in the same lane inside a wave may overlap
      for (const lane of [-1, 0, 1]) {
        const laneObs = wave.obstacles.filter((o) => o.lane === lane);
        for (let a = 0; a < laneObs.length; a++) {
          for (let b = a + 1; b < laneObs.length; b++) {
            const ea = getExtent(laneObs[a].kind, laneObs[a].z);
            const eb = getExtent(laneObs[b].kind, laneObs[b].z);
            // Allow ramp touching train_static edge cleanly
            const isRampTrainPair =
              (laneObs[a].kind === 'ramp' && laneObs[b].kind === 'train_static') ||
              (laneObs[b].kind === 'ramp' && laneObs[a].kind === 'train_static');
            if (isRampTrainPair) {
              assert.ok(ea.minZ >= eb.maxZ - 0.1 || eb.minZ >= ea.maxZ - 0.1);
            } else {
              const overlap = Math.min(ea.maxZ, eb.maxZ) - Math.max(ea.minZ, eb.minZ);
              assert.ok(
                overlap <= 0,
                `Seed ${seed} wave ${i} lane ${lane}: overlapping obstacles ${laneObs[a].kind} & ${laneObs[b].kind}`
              );
            }
          }
        }
      }

      // 4. First 3 waves must never spawn moving trains
      if (i < 3) {
        assert.ok(
          !wave.obstacles.some((o) => o.kind === 'train_moving'),
          `Seed ${seed} wave ${i}: train_moving spawned too early`
        );
      }

      // 5. Minimum wave-to-wave clearance for reaction + lane switch at MAX_SPEED = 35 u/s
      if (i + 1 < waves.length) {
        const nextWave = waves[i + 1];
        const minCurZ = wave.obstacles.reduce(
          (acc, o) => Math.min(acc, getExtent(o.kind, o.z).minZ),
          wave.startZ
        );
        const maxNextZ = nextWave.obstacles.reduce(
          (acc, o) => Math.max(acc, getExtent(o.kind, o.z).maxZ),
          nextWave.startZ
        );
        const gap = minCurZ - maxNextZ;
        // Minimum >= 10u even behind train_moving / ramp-to-next-wave worst case
        assert.ok(
          gap >= 9.5,
          `Seed ${seed} wave ${i}->${i + 1}: tight Z gap ${gap.toFixed(2)}u`
        );

        // Verify startZ -> nextZ step matches >= 21.5u
        const stepDistance = wave.startZ - wave.nextZ;
        const minReactionSec = stepDistance / TRACK_PHYSICS.maxSpeed;
        assert.ok(
          minReactionSec >= 0.6,
          `Seed ${seed} wave ${i}: reaction window ${minReactionSec.toFixed(2)}s too short`
        );
      }
    }

    // 6. Verify verifySeededCoinSpawn finds generated coins
    const sampleCoins = waves.slice(0, 30).flatMap((w) => w.coins);
    assert.ok(sampleCoins.length > 0, 'Expected generated coins');
    for (const c of sampleCoins.slice(0, 20)) {
      assert.equal(verifySeededCoinSpawn(seed, c.z, c.lane), true);
    }
  }

  console.log(`PASS trackGenerator.test.ts: validated ${totalWaves} waves across ${seeds.length} seeds.`);
}

runTrackSafetyTests();
