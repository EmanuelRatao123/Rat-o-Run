import assert from 'node:assert/strict';
import { CollisionStateController } from './collisionState.ts';

function runCollisionTests(): void {
  // 1) Jogador rápido bate: fica lento (sem morrer) por exatamente 1.0 segundo
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
    assert.equal(ctrl.getSlowRemainingSec(), 1.0);
    assert.equal(ctrl.getStumbleRemainingSec(), 0.55);
    assert.equal(ctrl.getSpeedMultiplier(false), 0.62);
  }

  // 2) Jogador lento bate novamente (após janela de colisão simultânea, ainda dentro de 1.0s): morre
  {
    const ctrl = new CollisionStateController();
    const hit1 = ctrl.resolveObstacleCollision({
      obstacleId: 10,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit1.outcome, 'slowed');

    // Avança 0.5s (passou o lock de 0.35s, ainda dentro de 1.0s)
    const stepRes = ctrl.step(0.5);
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

  // 3, 4, 5, 6) Bate -> fica lento 1.0s -> recupera -> volta ao normal -> bate de novo -> fica lento sem morrer -> recupera de novo
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

    // 4) Jogador ainda lento em 0.9s, recupera exatamente em 1.0s sem bater
    const stepMid = ctrl.step(0.9);
    assert.equal(stepMid.recoveredToNormal, false);
    assert.equal(ctrl.getSpeedState(), 'slow');

    const stepRecover = ctrl.step(0.1);
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

    // 6) Jogador se recupera novamente após 1.0s e pode continuar jogando (inclusive sofrendo novas 1ªs colisões)
    const stepRecover2 = ctrl.step(1.0);
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

  // Edge case: Consistência do tempo de 1s mesmo com queda de FPS (dt físico limitado a 0.05s, tempo real 0.1s/frame)
  {
    const ctrl = new CollisionStateController();
    const hit = ctrl.resolveObstacleCollision({
      obstacleId: 250,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit.outcome, 'slowed');
    for (let i = 0; i < 9; i++) {
      const s = ctrl.step(0.05, 0.1);
      assert.equal(s.recoveredToNormal, false);
      assert.equal(ctrl.getSpeedState(), 'slow');
    }
    const finalStep = ctrl.step(0.05, 0.1);
    assert.equal(finalStep.recoveredToNormal, true);
    assert.equal(ctrl.getSpeedState(), 'normal');
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

  console.log('ALL COLLISION STATE TESTS PASSED (1.0s exact + FPS consistency + duplicate/simultaneous + hoverboard)');
}

runCollisionTests();
