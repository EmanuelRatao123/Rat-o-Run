import assert from 'node:assert/strict';
import { CollisionStateController } from './collisionState.ts';
import { MatchLifecycleController } from './matchLifecycle.ts';
import { createSeededRng, generateTrackWave } from '../shared/trackGenerator.ts';

function runLifecycleStateMachineTests(): void {
  const lc = new MatchLifecycleController();
  assert.equal(lc.getPhase(), 'MENU');

  // Start run 1
  const r1 = lc.beginRun({
    mode: 'no_coin',
    mapId: 'brasil',
    skinId: 'ratao',
    caller: 'test_initial',
  });
  assert.equal(r1.started, true);
  assert.equal(lc.getPhase(), 'PREPARANDO');

  // Duplicate start while PREPARANDO must be blocked
  const dup1 = lc.beginRun({
    mode: 'no_coin',
    mapId: 'brasil',
    skinId: 'ratao',
    caller: 'test_duplicate',
  });
  assert.equal(dup1.started, false);
  assert.equal(dup1.runInstanceId, r1.runInstanceId);

  // Transition to JOGANDO
  assert.equal(lc.transition('JOGANDO', 'engine_started', r1.runInstanceId), true);
  assert.equal(lc.getPhase(), 'JOGANDO');

  // Duplicate start while JOGANDO must be blocked
  const dup2 = lc.beginRun({
    mode: 'no_coin',
    mapId: 'brasil',
    skinId: 'ratao',
    caller: 'test_duplicate_jogando',
  });
  assert.equal(dup2.started, false);

  // Restart while JOGANDO must be blocked
  const badRestart = lc.requestRestart('user_pause_restart', 10000);
  assert.equal(badRestart.allowed, false);
  assert.equal(lc.getPhase(), 'JOGANDO');

  // Pause & resume preserves exact runInstanceId
  assert.equal(lc.transition('PAUSADO', 'window_blur', r1.runInstanceId), true);
  assert.equal(lc.getPhase(), 'PAUSADO');
  assert.equal(lc.transition('JOGANDO', 'resume', r1.runInstanceId), true);
  assert.equal(lc.getPhase(), 'JOGANDO');

  // Bind delayed server token for active run
  assert.equal(lc.bindServerMatchId(r1.runInstanceId, 'm_server_1'), true);
  assert.equal(lc.getServerMatchId(), 'm_server_1');

  // Stale runId calls must be ignored & logged
  assert.equal(lc.bindServerMatchId('run_stale_999', 'm_stale'), false);
  assert.equal(lc.getServerMatchId(), 'm_server_1');
  assert.equal(lc.beginFinishing('run_stale_999', 'coin'), false);
  assert.equal(lc.getPhase(), 'JOGANDO');

  // Legitimate finish once
  assert.equal(lc.beginFinishing(r1.runInstanceId, 'coin'), true);
  assert.equal(lc.getPhase(), 'FINALIZANDO');
  // Duplicate finish must be blocked
  assert.equal(lc.beginFinishing(r1.runInstanceId, 'police'), false);
  assert.equal(lc.completeResult(r1.runInstanceId, 'recorded:coin'), true);
  assert.equal(lc.getPhase(), 'RESULTADO');

  // Approved restart from RESULTADO
  const okRestart = lc.requestRestart('user_gameover_retry', 20000);
  assert.equal(okRestart.allowed, true);
  // Rapid duplicate restart within 350ms blocked
  const rapidRestart = lc.requestRestart('user_gameover_retry', 20100);
  assert.equal(rapidRestart.allowed, false);

  const r2 = lc.beginRun({
    mode: 'no_coin',
    mapId: 'tokyo',
    skinId: 'ratao',
    caller: 'test_second_run',
  });
  assert.equal(r2.started, true);
  assert.notEqual(r2.runInstanceId, r1.runInstanceId);

  const diags = lc.getDiagnostics();
  assert.ok(diags.some((d) => d.event === 'duplicate_start_blocked'));
  assert.ok(diags.some((d) => d.event === 'stale_response_ignored'));
  assert.ok(diags.some((d) => d.event === 'restart_blocked'));
  assert.ok(diags.some((d) => d.event === 'restart_requested'));
}

function runLongNoCoinSimulationTest(): void {
  // Simulate a 4-minute (240s) active NO COIN run at 60Hz (14,400 steps)
  // including focus pauses/resumes, lane switches, jumps, slides, skate shields, and single collisions + recovery.
  const collisionCtrl = new CollisionStateController();
  const rng = createSeededRng(424242);
  let waveIdx = 0;
  let nextZ = -26;
  let prevOpen: number | undefined;
  let noCoinTimeMs = 0;
  let distance = 0;
  let paused = false;
  let skateActive = false;

  const totalSteps = 240 * 60;
  const dt = 1 / 60;
  let prevTimeMs = -1;
  let prevDist = -1;

  for (let step = 0; step < totalSteps; step++) {
    // Simulate periodic focus loss/pause at 60s and 150s, resuming 5 steps later
    if (step === 3600 || step === 9000) paused = true;
    if (step === 3605 || step === 9005) paused = false;
    if (paused) continue;

    // Simulate skate activation at 30s and obstacle absorption at 32s
    if (step === 1800) skateActive = true;
    if (step === 1920) {
      const res = collisionCtrl.resolveObstacleCollision({
        obstacleId: 1001,
        hoverboardActive: skateActive,
        jetpackActive: false,
        alreadyEnded: false,
      });
      assert.equal(res.outcome, 'hoverboard_absorbed');
      skateActive = false;
      collisionCtrl.forceRecoverWithLock(1.15);
    }

    // Simulate first obstacle collision at 90s (while fast) -> slows for 2s then recovers
    if (step === 5400) {
      const res = collisionCtrl.resolveObstacleCollision({
        obstacleId: 1002,
        hoverboardActive: false,
        jetpackActive: false,
        alreadyEnded: false,
      });
      assert.equal(res.outcome, 'slowed');
      assert.equal(collisionCtrl.isSlow(), true);
    }

    // Simulate another single collision at 180s (after recovery back to normal) -> still survives!
    if (step === 10800) {
      assert.equal(collisionCtrl.getSpeedState(), 'normal');
      const res = collisionCtrl.resolveObstacleCollision({
        obstacleId: 1003,
        hoverboardActive: false,
        jetpackActive: false,
        alreadyEnded: false,
      });
      assert.equal(res.outcome, 'slowed');
    }

    collisionCtrl.step(dt);
    const speed =
      Math.min(35, 16.5 + (noCoinTimeMs / 1000) * 0.22) * collisionCtrl.getSpeedMultiplier(false);
    noCoinTimeMs += dt * 1000;
    distance += speed * dt * 0.85;

    while (nextZ > -distance - 140) {
      const w = generateTrackWave(rng, waveIdx++, nextZ, prevOpen);
      prevOpen = w.openLane;
      nextZ = w.nextZ;
    }

    // Invariant: timer and distance MUST strictly advance and never reset to 0 mid-run
    assert.ok(noCoinTimeMs > prevTimeMs, `Timer decreased or stalled at step ${step}`);
    assert.ok(distance > prevDist, `Distance decreased or stalled at step ${step}`);
    prevTimeMs = noCoinTimeMs;
    prevDist = distance;
  }

  assert.ok(noCoinTimeMs > 239000, `Expected ~240s survived, got ${noCoinTimeMs}ms`);
  assert.equal(collisionCtrl.getSpeedState(), 'normal');

  // Verify second hit while STILL slow ends the run legitimately
  const hit1 = collisionCtrl.resolveObstacleCollision({
    obstacleId: 2001,
    hoverboardActive: false,
    jetpackActive: false,
    alreadyEnded: false,
  });
  assert.equal(hit1.outcome, 'slowed');
  collisionCtrl.step(0.6); // Past simultaneousLockSec (0.45s), still slow (< 2.0s)
  const hit2 = collisionCtrl.resolveObstacleCollision({
    obstacleId: 2002,
    hoverboardActive: false,
    jetpackActive: false,
    alreadyEnded: false,
  });
  assert.equal(hit2.outcome, 'died');
}

runLifecycleStateMachineTests();
runLongNoCoinSimulationTest();
console.log('ALL_NO_COIN_LIFECYCLE_TESTS_PASSED');
