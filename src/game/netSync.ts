import { CharacterAnimState } from './characters.ts';

export type NetworkHealthStatus = 'ok' | 'unstable' | 'reconnecting';

export interface RemoteSnapshot {
  seq: number;
  serverTimeMs: number;
  receivedAtMs: number;
  clientTs: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  yaw: number;
  lane: number;
  animState: CharacterAnimState;
  hoverboard: boolean;
  jetpack: boolean;
  alive: boolean;
  connected: boolean;
  pingMs: number;
}

export interface SampledRemoteState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  animState: CharacterAnimState;
  hoverboard: boolean;
  jetpack: boolean;
  alive: boolean;
  connected: boolean;
  healthStatus: NetworkHealthStatus;
  pingMs: number;
  jitterMs: number;
  packetAgeMs: number;
}

const MAX_BUFFER_SIZE = 24;
const MAX_EXTRAPOLATION_MS = 280;

export class RemoteSnapshotInterpolator {
  private buffer: RemoteSnapshot[] = [];
  private highestSeq = 0;

  private rttEmaMs = 80;
  private jitterEmaMs = 15;
  private clockOffsetMs: number | null = null;
  private lastRttSampleMs = 80;

  // Exponentially smoothed visual state & error offset to prevent snapping/teleports
  private visualX = 0;
  private visualY = 0;
  private visualZ = 0;
  private visualYaw = 0;
  private errorX = 0;
  private errorY = 0;
  private errorZ = 0;
  private initialized = false;

  private lastReceivedLocalMs = 0;

  public reset(): void {
    this.buffer = [];
    this.highestSeq = 0;
    this.clockOffsetMs = null;
    this.initialized = false;
    this.errorX = 0;
    this.errorY = 0;
    this.errorZ = 0;
    this.lastReceivedLocalMs = 0;
  }

  public recordRttSample(clientSentTs: number, serverNowMs: number, localReceiveMs: number): number {
    if (!Number.isFinite(clientSentTs) || clientSentTs <= 0) return this.rttEmaMs;
    const rawRtt = Math.max(8, Math.min(4000, localReceiveMs - clientSentTs));
    const diff = Math.abs(rawRtt - this.lastRttSampleMs);
    this.lastRttSampleMs = rawRtt;
    this.rttEmaMs = this.rttEmaMs * 0.8 + rawRtt * 0.2;
    this.jitterEmaMs = this.jitterEmaMs * 0.85 + diff * 0.15;

    // Estimated serverTime = localTime + clockOffset => clockOffset = serverNow + rtt/2 - localReceive
    const estOffset = serverNowMs + rawRtt * 0.5 - localReceiveMs;
    if (this.clockOffsetMs === null) {
      this.clockOffsetMs = estOffset;
    } else {
      // Gently steer offset unless huge clock jump
      const delta = estOffset - this.clockOffsetMs;
      this.clockOffsetMs =
        Math.abs(delta) > 2500 ? estOffset : this.clockOffsetMs + delta * 0.12;
    }
    return Math.round(this.rttEmaMs);
  }

  public getEstimatedPingMs(): number {
    return Math.round(this.rttEmaMs);
  }

  public getEstimatedJitterMs(): number {
    return Math.round(this.jitterEmaMs);
  }

  public pushSnapshot(snap: RemoteSnapshot): boolean {
    if (snap.seq > 0 && this.highestSeq > 0 && snap.seq < this.highestSeq) {
      // Out-of-order stale frame: discard
      return false;
    }
    if (snap.seq > 0) {
      this.highestSeq = Math.max(this.highestSeq, snap.seq);
    }

    this.lastReceivedLocalMs = snap.receivedAtMs;

    // Avoid exact duplicate seq entries
    if (snap.seq > 0 && this.buffer.length > 0 && this.buffer[this.buffer.length - 1].seq === snap.seq) {
      this.buffer[this.buffer.length - 1] = snap;
      return true;
    }

    // Keep timeline ordered by serverTimeMs (or receivedAtMs fallback)
    this.buffer.push(snap);
    this.buffer.sort((a, b) => a.serverTimeMs - b.serverTimeMs || a.seq - b.seq);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER_SIZE);
    }

    if (!this.initialized) {
      this.visualX = snap.x;
      this.visualY = snap.y;
      this.visualZ = snap.z;
      this.visualYaw = snap.yaw;
      this.initialized = true;
    }

    return true;
  }

  private getAdaptiveDelayMs(): number {
    // 100ms - 220ms buffer window adapting to current network jitter
    return Math.max(100, Math.min(220, 105 + this.jitterEmaMs * 1.4));
  }

  public sample(localNowMs: number, dt: number): SampledRemoteState {
    if (this.buffer.length === 0) {
      return {
        x: this.visualX,
        y: this.visualY,
        z: this.visualZ,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: this.visualYaw,
        animState: 'idle',
        hoverboard: false,
        jetpack: false,
        alive: true,
        connected: false,
        healthStatus: 'reconnecting',
        pingMs: Math.round(this.rttEmaMs),
        jitterMs: Math.round(this.jitterEmaMs),
        packetAgeMs: 9999,
      };
    }

    const latest = this.buffer[this.buffer.length - 1];
    const packetAgeMs = Math.max(0, localNowMs - this.lastReceivedLocalMs);

    const estServerNow =
      this.clockOffsetMs !== null
        ? localNowMs + this.clockOffsetMs
        : latest.serverTimeMs + packetAgeMs;

    const renderTimeMs = estServerNow - this.getAdaptiveDelayMs();

    let targetX = latest.x;
    let targetY = latest.y;
    let targetZ = latest.z;
    let targetVx = latest.vx;
    let targetVy = latest.vy;
    let targetVz = latest.vz;
    let targetYaw = latest.yaw;
    let animState: CharacterAnimState = latest.animState;
    let hoverboard = latest.hoverboard;
    let jetpack = latest.jetpack;
    let alive = latest.alive;

    if (this.buffer.length === 1) {
      const extrapSec = Math.max(0, Math.min(MAX_EXTRAPOLATION_MS, renderTimeMs - latest.serverTimeMs)) / 1000;
      targetX = latest.x + latest.vx * extrapSec;
      targetY = Math.max(0, latest.y + latest.vy * extrapSec);
      targetZ = latest.z + latest.vz * extrapSec;
    } else if (renderTimeMs <= this.buffer[0].serverTimeMs) {
      const first = this.buffer[0];
      targetX = first.x;
      targetY = first.y;
      targetZ = first.z;
      targetYaw = first.yaw;
      animState = first.animState;
      hoverboard = first.hoverboard;
      jetpack = first.jetpack;
      alive = first.alive;
    } else if (renderTimeMs >= latest.serverTimeMs) {
      // Extrapolate smoothly up to MAX_EXTRAPOLATION_MS along velocity vector
      const extrapMs = Math.min(MAX_EXTRAPOLATION_MS, renderTimeMs - latest.serverTimeMs);
      const extrapSec = Math.max(0, extrapMs) / 1000;
      targetX = latest.x + latest.vx * extrapSec;
      targetY = Math.max(0, latest.y + latest.vy * extrapSec);
      targetZ = latest.z + latest.vz * extrapSec;
      targetYaw = latest.yaw;
    } else {
      // Find bracketing frames A <= renderTime <= B
      let a = this.buffer[0];
      let b = latest;
      for (let i = 0; i < this.buffer.length - 1; i++) {
        if (
          this.buffer[i].serverTimeMs <= renderTimeMs &&
          renderTimeMs <= this.buffer[i + 1].serverTimeMs
        ) {
          a = this.buffer[i];
          b = this.buffer[i + 1];
          break;
        }
      }

      const spanMs = Math.max(1, b.serverTimeMs - a.serverTimeMs);
      const spanSec = spanMs / 1000;
      const t = Math.max(0, Math.min(1, (renderTimeMs - a.serverTimeMs) / spanMs));

      // Cubic Hermite interpolation on Z/X/Y using endpoint velocities for buttery-smooth runner arcs
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      targetX = h00 * a.x + h10 * (a.vx * spanSec) + h01 * b.x + h11 * (b.vx * spanSec);
      targetY = Math.max(
        0,
        h00 * a.y + h10 * (a.vy * spanSec) + h01 * b.y + h11 * (b.vy * spanSec)
      );
      targetZ = h00 * a.z + h10 * (a.vz * spanSec) + h01 * b.z + h11 * (b.vz * spanSec);

      // Guard against excessive overshoot on sudden lane/jump transitions
      const minX = Math.min(a.x, b.x) - 0.35;
      const maxX = Math.max(a.x, b.x) + 0.35;
      targetX = Math.max(minX, Math.min(maxX, targetX));

      targetVx = a.vx + (b.vx - a.vx) * t;
      targetVy = a.vy + (b.vy - a.vy) * t;
      targetVz = a.vz + (b.vz - a.vz) * t;
      targetYaw = a.yaw + (b.yaw - a.yaw) * t;

      animState = t < 0.55 ? a.animState : b.animState;
      hoverboard = t < 0.5 ? a.hoverboard : b.hoverboard;
      jetpack = t < 0.5 ? a.jetpack : b.jetpack;
      alive = b.alive;
    }

    // Smooth divergence damping (eliminates micro-teleports when packets recover)
    const safeDt = Math.max(0.001, Math.min(0.1, dt));
    const jumpDistSq =
      (targetX - this.visualX) ** 2 +
      (targetY - this.visualY) ** 2 +
      (targetZ - this.visualZ) ** 2;

    if (!this.initialized || jumpDistSq > 400) {
      // Very large reset (>20m) snaps immediately; small corrections smooth out
      this.visualX = targetX;
      this.visualY = targetY;
      this.visualZ = targetZ;
      this.errorX = 0;
      this.errorY = 0;
      this.errorZ = 0;
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-16 * safeDt);
      this.visualX += (targetX - this.visualX) * k;
      this.visualY += (targetY - this.visualY) * k;
      this.visualZ += (targetZ - this.visualZ) * k;
      this.visualYaw += (targetYaw - this.visualYaw) * k;
    }

    let healthStatus: NetworkHealthStatus = 'ok';
    if (!latest.connected || packetAgeMs > 2800) {
      healthStatus = 'reconnecting';
    } else if (packetAgeMs > 900 || this.rttEmaMs > 320 || this.jitterEmaMs > 110) {
      healthStatus = 'unstable';
    }

    return {
      x: this.visualX,
      y: this.visualY,
      z: this.visualZ,
      vx: targetVx,
      vy: targetVy,
      vz: targetVz,
      yaw: this.visualYaw,
      animState,
      hoverboard,
      jetpack,
      alive,
      connected: latest.connected && packetAgeMs < 5000,
      healthStatus,
      pingMs: latest.pingMs > 0 ? Math.round((this.rttEmaMs + latest.pingMs) * 0.5) : Math.round(this.rttEmaMs),
      jitterMs: Math.round(this.jitterEmaMs),
      packetAgeMs,
    };
  }
}

export interface CompactTelemetrySnapshot {
  posX: number;
  posY: number;
  posZ: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  yaw: number;
  lane: number;
  animState: CharacterAnimState;
  hoverboard: boolean;
  jetpack: boolean;
  alive: boolean;
}

export class TelemetryFilter {
  private lastSent: CompactTelemetrySnapshot | null = null;
  private lastSentAtMs = 0;

  public reset(): void {
    this.lastSent = null;
    this.lastSentAtMs = 0;
  }

  public shouldTransmit(
    current: CompactTelemetrySnapshot,
    nowMs: number,
    forceImmediate: boolean,
    maxKeepAliveMs = 450
  ): boolean {
    if (forceImmediate || !this.lastSent) {
      return true;
    }
    if (nowMs - this.lastSentAtMs >= maxKeepAliveMs) {
      return true;
    }
    const p = this.lastSent;
    if (
      p.animState !== current.animState ||
      p.lane !== current.lane ||
      p.alive !== current.alive ||
      p.hoverboard !== current.hoverboard ||
      p.jetpack !== current.jetpack
    ) {
      return true;
    }
    const moved =
      Math.abs(p.posX - current.posX) > 0.05 ||
      Math.abs(p.posY - current.posY) > 0.05 ||
      Math.abs(p.posZ - current.posZ) > 0.25 ||
      Math.abs(p.speed - current.speed) > 0.4;
    return moved;
  }

  public markTransmitted(current: CompactTelemetrySnapshot, nowMs: number): void {
    this.lastSent = { ...current };
    this.lastSentAtMs = nowMs;
  }
}
