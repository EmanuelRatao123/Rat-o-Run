import assert from 'node:assert/strict';
import { CollisionStateController } from './collisionState.ts';

function runCollisionTests(): void {
  // 1) Jogador rápido bate: fica lento (sem morrer)
  {
    const ctrl = new CollisionStateController();
    assert.equal(ctrl.getSpeedState(), 'normal');
    assert.equal(ctrl.getSpeedMultiplier(false), 1.0);

    const hit1 = ctrl.resolveObstacleCollision({
      obstacleId: 1,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });

    assert.equal(hit1.outcome, 'slowed');
    assert.equal(ctrl.getSpeedState(), 'slow');
    assert.equal(ctrl.isSlow(), true);
    assert.equal(ctrl.getSlowRemainingSec(), 2.0);
    assert.equal(ctrl.getStumbleRemainingSec(), 0.75);
    assert.equal(ctrl.getSpeedMultiplier(false), 0.62);
  }

  // 2) Jogador lento bate novamente (após janela de colisão simultânea): morre
  {
    const ctrl = new CollisionStateController();
    const hit1 = ctrl.resolveObstacleCollision({
      obstacleId: 10,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit1.outcome, 'slowed');

    // Avança 0.6s (ainda dentro dos 2.0s de perseguição policial e estado lento)
    const stepRes = ctrl.step(0.6);
    assert.equal(stepRes.recoveredToNormal, false);
    assert.equal(ctrl.getSpeedState(), 'slow');
    assert.equal(ctrl.isLocked(), false);

    const hit2 = ctrl.resolveObstacleCollision({
      obstacleId: 11,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit2.outcome, 'died');
  }

  // 3, 4, 5, 6) Bate -> fica lento -> recupera -> volta ao normal -> bate de novo -> fica lento sem morrer -> recupera de novo
  {
    const ctrl = new CollisionStateController();

    // 3) Jogador rápido bate: fica lento
    const hit1 = ctrl.resolveObstacleCollision({
      obstacleId: 101,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit1.outcome, 'slowed');
    assert.equal(ctrl.getSpeedState(), 'slow');

    // 4) Jogador se recupera (2.0s sem bater): volta ao normal
    const stepMid = ctrl.step(1.0);
    assert.equal(stepMid.recoveredToNormal, false);
    assert.equal(ctrl.getSpeedState(), 'slow');

    const stepRecover = ctrl.step(1.05);
    assert.equal(stepRecover.recoveredToNormal, true);
    assert.equal(ctrl.getSpeedState(), 'normal');
    assert.equal(ctrl.getSlowRemainingSec(), 0);
    assert.equal(ctrl.getSpeedMultiplier(false), 1.0);

    // 5) Jogador rápido bate novamente: fica lento, SEM morrer
    const hit2 = ctrl.resolveObstacleCollision({
      obstacleId: 102,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit2.outcome, 'slowed');
    assert.equal(ctrl.getSpeedState(), 'slow');

    // 6) Jogador se recupera novamente e pode continuar jogando (inclusive sofrendo novas 1ªs colisões)
    const stepRecover2 = ctrl.step(2.0);
    assert.equal(stepRecover2.recoveredToNormal, true);
    assert.equal(ctrl.getSpeedState(), 'normal');

    const hit3 = ctrl.resolveObstacleCollision({
      obstacleId: 103,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit3.outcome, 'slowed');
    assert.equal(ctrl.getSpeedState(), 'slow');
    assert.equal(ctrl.getTelemetryHitCount(), 3);
  }

  // Edge case: colisões simultâneas ou duplicadas não causam morte dupla instantânea
  {
    const ctrl = new CollisionStateController();
    const first = ctrl.resolveObstacleCollision({
      obstacleId: 201,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(first.outcome, 'slowed');

    // Mesmo obstáculo imediatamente
    const dupSame = ctrl.resolveObstacleCollision({
      obstacleId: 201,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(dupSame.outcome, 'ignored');

    // Outro obstáculo sobreposto no mesmo frame (dt = 0)
    const simultaneousOther = ctrl.resolveObstacleCollision({
      obstacleId: 202,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(simultaneousOther.outcome, 'ignored');
    assert.equal(ctrl.getSpeedState(), 'slow');
  }

  // Edge case: Hoverboard absorve colisão sem deixar lento nem matar
  {
    const ctrl = new CollisionStateController();
    const absorbed = ctrl.resolveObstacleCollision({
      obstacleId: 301,
      hoverboardActive: true,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(absorbed.outcome, 'hoverboard_absorbed');
    assert.equal(ctrl.getSpeedState(), 'normal');
  }

  console.log('ALL COLLISION STATE TESTS PASSED (6/6 sequences + duplicate/simultaneous + hoverboard)');
}

runCollisionTests();
