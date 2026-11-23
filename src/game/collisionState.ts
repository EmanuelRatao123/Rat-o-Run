export type SpeedState = 'normal' | 'slow';

export type CollisionOutcome =
  | 'ignored'
  | 'hoverboard_absorbed'
  | 'slowed'
  | 'died';

export interface CollisionResolution {
  outcome: CollisionOutcome;
  previousSpeedState: SpeedState;
  nextSpeedState: SpeedState;
}

export interface CollisionConfig {
  slowDurationSec: number;
  stumbleDurationSec: number;
  simultaneousLockSec: number;
  hoverboardLockSec: number;
  slowSpeedMultiplier: number;
  jetpackSpeedMultiplier: number;
}

export const DEFAULT_COLLISION_CONFIG: CollisionConfig = {
  slowDurationSec: 2.0,
  stumbleDurationSec: 0.75,
  simultaneousLockSec: 0.45,
  hoverboardLockSec: 0.85,
  slowSpeedMultiplier: 0.62,
  jetpackSpeedMultiplier: 1.35,
};

/**
 * Pure state machine controlling speed recovery and obstacle death rules.
 *
 * Core rule:
 * - Death NEVER depends on cumulative collision count over the match.
 * - Normal/fast speed + obstacle hit => transitions to 'slow' (stumble + 2s police chase).
 * - Already 'slow' + obstacle hit (after simultaneous-hit lock) => 'died'.
 * - Surviving the 2s chase restores 'normal', allowing future single collisions to slow again.
 */
export class CollisionStateController {
  private config: CollisionConfig;
  private speedState: SpeedState = 'normal';
  private slowRemainingSec = 0;
  private stumbleRemainingSec = 0;
  private collisionLockSec = 0;
  private lastObstacleId: number | null = null;
  private totalHitsForTelemetry = 0;

  constructor(config: Partial<CollisionConfig> = {}) {
    this.config = { ...DEFAULT_COLLISION_CONFIG, ...config };
  }

  public reset(): void {
    this.speedState = 'normal';
    this.slowRemainingSec = 0;
    this.stumbleRemainingSec = 0;
    this.collisionLockSec = 0;
    this.lastObstacleId = null;
    this.totalHitsForTelemetry = 0;
  }

  public getSpeedState(): SpeedState {
    return this.speedState;
  }

  public isSlow(): boolean {
    return this.speedState === 'slow';
  }

  public getSlowRemainingSec(): number {
    return this.slowRemainingSec;
  }

  public getStumbleRemainingSec(): number {
    return this.stumbleRemainingSec;
  }

  public getCollisionLockSec(): number {
    return this.collisionLockSec;
  }

  public isLocked(): boolean {
    return this.collisionLockSec > 0;
  }

  public getTelemetryHitCount(): number {
    return this.totalHitsForTelemetry;
  }

  public getSpeedMultiplier(jetpackActive: boolean): number {
    if (jetpackActive) return this.config.jetpackSpeedMultiplier;
    if (this.speedState === 'slow') return this.config.slowSpeedMultiplier;
    return 1.0;
  }

  public step(dtSec: number): { recoveredToNormal: boolean } {
    const safeDt = Math.max(0, dtSec);
    if (this.collisionLockSec > 0) {
      this.collisionLockSec = Math.max(0, this.collisionLockSec - safeDt);
    }
    if (this.stumbleRemainingSec > 0) {
      this.stumbleRemainingSec = Math.max(0, this.stumbleRemainingSec - safeDt);
    }

    let recoveredToNormal = false;
    if (this.slowRemainingSec > 0) {
      this.slowRemainingSec = Math.max(0, this.slowRemainingSec - safeDt);
      if (this.slowRemainingSec === 0 && this.speedState === 'slow') {
        this.speedState = 'normal';
        recoveredToNormal = true;
      }
    }

    return { recoveredToNormal };
  }

  public resolveObstacleCollision(input: {
    obstacleId: number;
    hoverboardActive: boolean;
    jetpackActive: boolean;
    alreadyEnded: boolean;
  }): CollisionResolution {
    const previousSpeedState = this.speedState;

    if (
      input.alreadyEnded ||
      input.jetpackActive ||
      this.collisionLockSec > 0 ||
      this.lastObstacleId === input.obstacleId
    ) {
      return {
        outcome: 'ignored',
        previousSpeedState,
        nextSpeedState: this.speedState,
      };
    }

    this.lastObstacleId = input.obstacleId;

    if (input.hoverboardActive) {
      this.collisionLockSec = this.config.hoverboardLockSec;
      return {
        outcome: 'hoverboard_absorbed',
        previousSpeedState,
        nextSpeedState: this.speedState,
      };
    }

    this.totalHitsForTelemetry += 1;

    if (this.speedState === 'normal') {
      this.speedState = 'slow';
      this.slowRemainingSec = this.config.slowDurationSec;
      this.stumbleRemainingSec = this.config.stumbleDurationSec;
      this.collisionLockSec = this.config.simultaneousLockSec;
      return {
        outcome: 'slowed',
        previousSpeedState,
        nextSpeedState: this.speedState,
      };
    }

    // Already 'slow' -> second collision before recovering to normal ends the run
    return {
      outcome: 'died',
      previousSpeedState,
      nextSpeedState: this.speedState,
    };
  }
}
