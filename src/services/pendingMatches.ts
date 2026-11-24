import { MatchSummary } from '../shared/constants.ts';
import { api } from './api.ts';

export interface PendingMatchFinishPayload {
  matchId: string;
  signature: string;
  noCoinTimeMs: number;
  collectedCoin: boolean;
  coins: number;
  distance: number;
  score: number;
  durationMs: number;
  endReason?: 'police' | 'coin';
  queuedAt?: string;
}

const STORAGE_KEY = 'ratao_pending_match_finishes_v1';

function readQueue(): PendingMatchFinishPayload[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingMatchFinishPayload[]): void {
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-10)));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function enqueuePendingMatchFinish(payload: PendingMatchFinishPayload): void {
  const existing = readQueue().filter((item) => item.matchId !== payload.matchId);
  existing.push({
    ...payload,
    queuedAt: payload.queuedAt || new Date().toISOString(),
  });
  writeQueue(existing);
}

export function removePendingMatchFinish(matchId: string): void {
  const next = readQueue().filter((item) => item.matchId !== matchId);
  writeQueue(next);
}

function isRetriableError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();
  if (
    msg.includes('assinatura') ||
    msg.includes('não autenticado') ||
    msg.includes('sessão expirada') ||
    msg.includes('partida não encontrada')
  ) {
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function submitMatchFinishWithRetry(
  payload: PendingMatchFinishPayload,
  maxAttempts = 3
): Promise<{ summary: MatchSummary; idempotent?: boolean }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await api.finishMatch(payload);
      removePendingMatchFinish(payload.matchId);
      return res;
    } catch (err) {
      lastError = err;
      if (!isRetriableError(err)) {
        removePendingMatchFinish(payload.matchId);
        throw err;
      }
      if (attempt < maxAttempts) {
        await sleep(280 * attempt);
      }
    }
  }
  enqueuePendingMatchFinish(payload);
  throw lastError instanceof Error ? lastError : new Error('Falha temporária ao registrar partida.');
}

export async function flushPendingMatchFinishes(): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: PendingMatchFinishPayload[] = [];
  for (const item of queue) {
    try {
      await api.finishMatch(item);
      flushed += 1;
    } catch (err) {
      if (isRetriableError(err)) {
        remaining.push(item);
      }
    }
  }
  writeQueue(remaining);
  return flushed;
}
