import { MapId, SkinId, SoloGameMode } from '../shared/constants.ts';

export type MatchPhase =
  | 'MENU'
  | 'PREPARANDO'
  | 'JOGANDO'
  | 'PAUSADO'
  | 'FINALIZANDO'
  | 'RESULTADO';

export type MatchRestartReason =
  | 'user_pause_restart'
  | 'user_gameover_retry'
  | 'user_new_match';

export type MatchDiagnosticEvent =
  | 'run_begin'
  | 'phase_change'
  | 'token_bound'
  | 'stale_response_ignored'
  | 'duplicate_start_blocked'
  | 'restart_requested'
  | 'restart_blocked'
  | 'unexpected_reset_blocked'
  | 'finish_begin'
  | 'finish_result'
  | 'engine_error'
  | 'reconnect_event';

export interface MatchDiagnosticEntry {
  seq: number;
  atIso: string;
  runInstanceId: string;
  serverMatchId: string | null;
  phase: MatchPhase;
  event: MatchDiagnosticEvent;
  detail: string;
}

const VALID_TRANSITIONS: Record<MatchPhase, ReadonlySet<MatchPhase>> = {
  MENU: new Set<MatchPhase>(['PREPARANDO']),
  PREPARANDO: new Set<MatchPhase>(['JOGANDO', 'PAUSADO', 'MENU']),
  JOGANDO: new Set<MatchPhase>(['PAUSADO', 'FINALIZANDO', 'MENU']),
  PAUSADO: new Set<MatchPhase>(['JOGANDO', 'FINALIZANDO', 'MENU']),
  FINALIZANDO: new Set<MatchPhase>(['RESULTADO', 'MENU']),
  RESULTADO: new Set<MatchPhase>(['MENU', 'PREPARANDO']),
};

const STORAGE_KEY = 'ratao_match_diag_v1';
const MAX_ENTRIES = 150;
let globalRunCounter = 0;

export function createRunInstanceId(): string {
  globalRunCounter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `run_${Date.now()}_${globalRunCounter}_${rand}`;
}

export class MatchLifecycleController {
  private phase: MatchPhase = 'MENU';
  private runInstanceId = '';
  private serverMatchId: string | null = null;
  private startedAtIso: string | null = null;
  private mode: SoloGameMode | 'coop' | 'x1' = 'no_coin';
  private mapId: MapId = 'brasil';
  private skinId: SkinId = 'ratao';
  private endReason: string | null = null;
  private lastRestartAtMs = 0;
  private diagSeq = 0;
  private diagnostics: MatchDiagnosticEntry[] = [];
  private onDiagnostic?: (entry: MatchDiagnosticEntry) => void;

  constructor(opts?: { onDiagnostic?: (entry: MatchDiagnosticEntry) => void }) {
    this.onDiagnostic = opts?.onDiagnostic;
  }

  public getPhase(): MatchPhase {
    return this.phase;
  }

  public getRunInstanceId(): string {
    return this.runInstanceId;
  }

  public getServerMatchId(): string | null {
    return this.serverMatchId;
  }

  public getStartedAtIso(): string | null {
    return this.startedAtIso;
  }

  public getEndReason(): string | null {
    return this.endReason;
  }

  public isActiveMatchPhase(): boolean {
    return (
      this.phase === 'PREPARANDO' ||
      this.phase === 'JOGANDO' ||
      this.phase === 'PAUSADO'
    );
  }

  public getDiagnostics(): MatchDiagnosticEntry[] {
    return [...this.diagnostics];
  }

  private pushDiag(event: MatchDiagnosticEvent, detail: string): MatchDiagnosticEntry {
    this.diagSeq += 1;
    const entry: MatchDiagnosticEntry = {
      seq: this.diagSeq,
      atIso: new Date().toISOString(),
      runInstanceId: this.runInstanceId || 'none',
      serverMatchId: this.serverMatchId,
      phase: this.phase,
      event,
      detail,
    };
    this.diagnostics.push(entry);
    if (this.diagnostics.length > MAX_ENTRIES) {
      this.diagnostics.splice(0, this.diagnostics.length - MAX_ENTRIES);
    }

    try {
      if (typeof window !== 'undefined') {
        (
          window as unknown as {
            __RATAO_MATCH_DIAGNOSTICS__?: MatchDiagnosticEntry[];
          }
        ).__RATAO_MATCH_DIAGNOSTICS__ = this.diagnostics;
        window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(this.diagnostics.slice(-60)));
      }
    } catch {
      // Ignore storage availability issues
    }

    this.onDiagnostic?.(entry);
    return entry;
  }

  /**
   * Starts a brand-new run instance from MENU or after an approved restart.
   * Rejects duplicate start calls while a match is already PREPARANDO / JOGANDO / PAUSADO.
   */
  public beginRun(params: {
    mode: SoloGameMode | 'coop' | 'x1';
    mapId: MapId;
    skinId: SkinId;
    caller: string;
  }): { started: boolean; runInstanceId: string } {
    if (this.isActiveMatchPhase() || this.phase === 'FINALIZANDO') {
      this.pushDiag(
        'duplicate_start_blocked',
        `Blocked duplicate beginRun from caller=${params.caller} while phase=${this.phase}`
      );
      return { started: false, runInstanceId: this.runInstanceId };
    }

    this.runInstanceId = createRunInstanceId();
    this.serverMatchId = null;
    this.startedAtIso = new Date().toISOString();
    this.mode = params.mode;
    this.mapId = params.mapId;
    this.skinId = params.skinId;
    this.endReason = null;
    this.phase = 'PREPARANDO';

    this.pushDiag(
      'run_begin',
      `caller=${params.caller} mode=${this.mode} map=${this.mapId} skin=${this.skinId} startedAt=${this.startedAtIso}`
    );
    return { started: true, runInstanceId: this.runInstanceId };
  }

  public transition(nextPhase: MatchPhase, reason: string, expectedRunId?: string): boolean {
    if (expectedRunId && expectedRunId !== this.runInstanceId) {
      this.pushDiag(
        'stale_response_ignored',
        `Ignored transition ${this.phase}->${nextPhase} (${reason}) for stale run=${expectedRunId} active=${this.runInstanceId}`
      );
      return false;
    }

    if (this.phase === nextPhase) {
      return true;
    }

    if (!VALID_TRANSITIONS[this.phase].has(nextPhase)) {
      this.pushDiag(
        'unexpected_reset_blocked',
        `Blocked invalid transition ${this.phase}->${nextPhase} reason=${reason}`
      );
      return false;
    }

    const prev = this.phase;
    this.phase = nextPhase;
    this.pushDiag('phase_change', `${prev}->${nextPhase} reason=${reason}`);
    return true;
  }

  public bindServerMatchId(expectedRunId: string, matchId: string): boolean {
    if (expectedRunId !== this.runInstanceId) {
      this.pushDiag(
        'stale_response_ignored',
        `Ignored server matchId=${matchId} for stale run=${expectedRunId} active=${this.runInstanceId}`
      );
      return false;
    }
    this.serverMatchId = matchId;
    this.pushDiag('token_bound', `Bound server matchId=${matchId}`);
    return true;
  }

  public beginFinishing(expectedRunId: string, endReason: string): boolean {
    if (expectedRunId !== this.runInstanceId) {
      this.pushDiag(
        'stale_response_ignored',
        `Ignored finish (${endReason}) for stale run=${expectedRunId} active=${this.runInstanceId}`
      );
      return false;
    }
    if (this.phase === 'FINALIZANDO' || this.phase === 'RESULTADO') {
      this.pushDiag(
        'duplicate_start_blocked',
        `Blocked duplicate finish (${endReason}) while phase=${this.phase}`
      );
      return false;
    }
    this.endReason = endReason;
    const ok = this.transition('FINALIZANDO', `end_reason:${endReason}`, expectedRunId);
    if (ok) {
      this.pushDiag('finish_begin', `endReason=${endReason}`);
    }
    return ok;
  }

  public completeResult(expectedRunId: string, detail = 'summary_ready'): boolean {
    if (expectedRunId !== this.runInstanceId) {
      this.pushDiag(
        'stale_response_ignored',
        `Ignored result (${detail}) for stale run=${expectedRunId} active=${this.runInstanceId}`
      );
      return false;
    }
    const ok = this.transition('RESULTADO', detail, expectedRunId);
    if (ok) {
      this.pushDiag('finish_result', detail);
    }
    return ok;
  }

  /**
   * Only allows restarting from PAUSADO, RESULTADO, or MENU (or explicit new match exit).
   * Blocks accidental restarts during PREPARANDO / JOGANDO / FINALIZANDO or rapid double-clicks.
   */
  public requestRestart(
    reason: MatchRestartReason,
    nowMs: number = Date.now()
  ): { allowed: boolean; blockedReason?: string } {
    const canRestartFromPhase =
      this.phase === 'PAUSADO' || this.phase === 'RESULTADO' || this.phase === 'MENU';

    if (!canRestartFromPhase) {
      const msg = `Blocked restart (${reason}) while phase=${this.phase}`;
      this.pushDiag('restart_blocked', msg);
      return { allowed: false, blockedReason: msg };
    }

    if (nowMs - this.lastRestartAtMs < 350) {
      const msg = `Blocked rapid duplicate restart (${reason}) within 350ms`;
      this.pushDiag('restart_blocked', msg);
      return { allowed: false, blockedReason: msg };
    }

    this.lastRestartAtMs = nowMs;
    this.pushDiag('restart_requested', `Approved restart reason=${reason} from phase=${this.phase}`);
    this.phase = 'MENU';
    return { allowed: true };
  }

  public exitToMenu(reason = 'user_exit_to_menu'): void {
    const prev = this.phase;
    this.phase = 'MENU';
    this.pushDiag('phase_change', `${prev}->MENU reason=${reason}`);
  }

  public recordUnexpectedResetAttempt(caller: string, detail: string): void {
    this.pushDiag('unexpected_reset_blocked', `caller=${caller} ${detail}`);
  }

  public recordError(source: string, error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    this.pushDiag('engine_error', `source=${source} error=${message}`);
  }

  public recordReconnect(detail: string): void {
    this.pushDiag('reconnect_event', detail);
  }
}
