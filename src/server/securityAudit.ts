import { desc, eq } from 'drizzle-orm';
import { ensureNeonSchema, getNeonDb, isNeonConfigured } from '../db/neon.ts';
import { adminLogs, securityAuditLogs } from '../db/schema.ts';
import {
  AdminSecuritySummary,
  SecurityAuditLogItem,
  SecurityEventCategory,
  SecuritySeverity,
} from '../shared/constants.ts';
import { generateToken } from './crypto.ts';
import { getDb, saveDb } from './store.ts';

const SUSPICIOUS_WINDOW_MS = 10 * 60 * 1000;
const SUSPICIOUS_ESCALATION_THRESHOLD = 5;

declare global {
  var _rataoSecurityAnomalyTracker:
    | Map<string, { timestamps: number[]; lastAlertAt: number }>
    | undefined;
}

function getAnomalyTracker(): Map<string, { timestamps: number[]; lastAlertAt: number }> {
  if (!global._rataoSecurityAnomalyTracker) {
    global._rataoSecurityAnomalyTracker = new Map();
  }
  return global._rataoSecurityAnomalyTracker;
}

export function sanitizeAuditText(raw: string, maxLen = 320): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(password|senha|secret|token|cookie|recoveryCode)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

async function persistAuditEntry(entry: SecurityAuditLogItem): Promise<void> {
  if (!isNeonConfigured()) {
    const db = getDb();
    db.securityAuditLogs.unshift(entry);
    db.securityAuditLogs = db.securityAuditLogs.slice(0, 1000);
    saveDb();
    return;
  }

  await ensureNeonSchema();
  const db = getNeonDb();
  await db.insert(securityAuditLogs).values({
    id: entry.id,
    eventType: entry.eventType,
    category: entry.category,
    severity: entry.severity,
    ip: entry.ip,
    userId: entry.userId ?? null,
    nickname: entry.nickname ?? null,
    route: entry.route ?? null,
    details: entry.details,
    createdAt: entry.createdAt,
  });
}

async function persistSecurityEscalationAdminLog(details: string): Promise<void> {
  const item = {
    id: `log_${generateToken(8)}`,
    adminNickname: 'SEGURANÇA',
    action: 'ALERTA_SEGURANCA',
    details: sanitizeAuditText(details, 300),
    createdAt: new Date().toISOString(),
  };

  if (!isNeonConfigured()) {
    const db = getDb();
    db.adminLogs.unshift(item);
    db.adminLogs = db.adminLogs.slice(0, 200);
    saveDb();
    return;
  }

  await ensureNeonSchema();
  await getNeonDb().insert(adminLogs).values(item);
}

export async function recordSecurityEvent(params: {
  eventType: string;
  category: SecurityEventCategory;
  severity: SecuritySeverity;
  ip?: string;
  userId?: string | null;
  nickname?: string | null;
  route?: string | null;
  details: string;
}): Promise<void> {
  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const safeIp = sanitizeAuditText(params.ip || 'unknown', 64) || 'unknown';
    const safeEventType = sanitizeAuditText(params.eventType, 64).toUpperCase();
    const safeRoute = params.route ? sanitizeAuditText(params.route, 120) : null;
    const safeDetails = sanitizeAuditText(params.details, 320);

    const entry: SecurityAuditLogItem = {
      id: `sec_${generateToken(8)}`,
      eventType: safeEventType,
      category: params.category,
      severity: params.severity,
      ip: safeIp,
      userId: params.userId ? sanitizeAuditText(params.userId, 64) : null,
      nickname: params.nickname ? sanitizeAuditText(params.nickname, 32) : null,
      route: safeRoute,
      details: safeDetails,
      createdAt: nowIso,
    };

    await persistAuditEntry(entry);

    // Escalate repeated medium/high/critical anomalies into an explicit alert
    if (params.severity !== 'low') {
      const trackerKey = `${params.userId || safeIp}:${params.category}`;
      const tracker = getAnomalyTracker();
      if (tracker.size > 5000) {
        for (const [k, v] of tracker.entries()) {
          if (v.timestamps.length === 0 || nowMs - v.timestamps[v.timestamps.length - 1] > SUSPICIOUS_WINDOW_MS) {
            tracker.delete(k);
          }
        }
      }
      const cur = tracker.get(trackerKey) || { timestamps: [], lastAlertAt: 0 };
      cur.timestamps = cur.timestamps.filter((t) => nowMs - t < SUSPICIOUS_WINDOW_MS);
      cur.timestamps.push(nowMs);
      tracker.set(trackerKey, cur);

      if (
        cur.timestamps.length >= SUSPICIOUS_ESCALATION_THRESHOLD &&
        nowMs - cur.lastAlertAt > SUSPICIOUS_WINDOW_MS
      ) {
        cur.lastAlertAt = nowMs;
        const alertEntry: SecurityAuditLogItem = {
          id: `sec_${generateToken(8)}`,
          eventType: 'REPEATED_ANOMALY_ALERT',
          category: params.category,
          severity: 'critical',
          ip: safeIp,
          userId: entry.userId,
          nickname: entry.nickname,
          route: safeRoute,
          details: `Padrão suspeito repetido (${cur.timestamps.length}x em 10min) categoria=${params.category} origem=${entry.nickname || safeIp}: ${safeDetails}`,
          createdAt: nowIso,
        };
        await persistAuditEntry(alertEntry);
        await persistSecurityEscalationAdminLog(alertEntry.details);
      }
    }
  } catch (err) {
    console.error('Security audit logging failed:', err);
  }
}

export async function listSecurityAuditLogs(params?: {
  limit?: number;
  severity?: SecuritySeverity | 'all';
}): Promise<{ logs: SecurityAuditLogItem[]; summary: AdminSecuritySummary }> {
  const limit = Math.min(250, Math.max(1, Math.floor(params?.limit ?? 80)));
  const sevFilter = params?.severity && params.severity !== 'all' ? params.severity : null;
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

  let allRecent: SecurityAuditLogItem[] = [];

  if (!isNeonConfigured()) {
    allRecent = getDb().securityAuditLogs.slice(0, 500);
  } else {
    await ensureNeonSchema();
    const db = getNeonDb();
    const rows = sevFilter
      ? await db
          .select()
          .from(securityAuditLogs)
          .where(eq(securityAuditLogs.severity, sevFilter))
          .orderBy(desc(securityAuditLogs.createdAt))
          .limit(limit)
      : await db
          .select()
          .from(securityAuditLogs)
          .orderBy(desc(securityAuditLogs.createdAt))
          .limit(250);

    allRecent = rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      category: r.category as SecurityEventCategory,
      severity: r.severity as SecuritySeverity,
      ip: r.ip,
      userId: r.userId,
      nickname: r.nickname,
      route: r.route,
      details: r.details,
      createdAt: r.createdAt,
    }));
  }

  const filtered = sevFilter
    ? allRecent.filter((item) => item.severity === sevFilter).slice(0, limit)
    : allRecent.slice(0, limit);

  const summary: AdminSecuritySummary = {
    totalEvents: allRecent.length,
    criticalCount: allRecent.filter((e) => e.severity === 'critical').length,
    highCount: allRecent.filter((e) => e.severity === 'high').length,
    last24hCount: allRecent.filter((e) => new Date(e.createdAt).getTime() >= cutoff24h).length,
    blockedAttemptsCount: allRecent.filter(
      (e) =>
        e.category === 'rate_limit' ||
        e.category === 'csrf' ||
        e.category === 'admin_access' ||
        e.category === 'match_integrity' ||
        e.category === 'multiplayer_integrity'
    ).length,
  };

  return { logs: filtered, summary };
}
