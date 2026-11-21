import type { ComplaintRecord, PublicAggregateStats } from '../../shared/types';
import { createEmptyPublicStats } from './firestoreRestClient';

const ALLOWED_PUBLIC_STATS_KEYS = new Set<keyof PublicAggregateStats>([
  'totalReported',
  'reportedCount',
  'inProgressCount',
  'resolvedCount',
  'criticalCount',
  'resolutionRate',
  'avgResolutionHours',
  'byCategory',
  'byPriority',
  'byDepartment',
  'byArea',
  'monthlyTrends',
  'updatedAt',
]);

export function sanitizePublicStats(raw: Partial<PublicAggregateStats> | null | undefined): PublicAggregateStats {
  const base = createEmptyPublicStats();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const sanitized: PublicAggregateStats = {
    totalReported: typeof raw.totalReported === 'number' && Number.isFinite(raw.totalReported) ? Math.max(0, raw.totalReported) : 0,
    reportedCount: typeof raw.reportedCount === 'number' && Number.isFinite(raw.reportedCount) ? Math.max(0, raw.reportedCount) : 0,
    inProgressCount: typeof raw.inProgressCount === 'number' && Number.isFinite(raw.inProgressCount) ? Math.max(0, raw.inProgressCount) : 0,
    resolvedCount: typeof raw.resolvedCount === 'number' && Number.isFinite(raw.resolvedCount) ? Math.max(0, raw.resolvedCount) : 0,
    criticalCount: typeof raw.criticalCount === 'number' && Number.isFinite(raw.criticalCount) ? Math.max(0, raw.criticalCount) : 0,
    resolutionRate: typeof raw.resolutionRate === 'number' && Number.isFinite(raw.resolutionRate) ? Math.min(100, Math.max(0, raw.resolutionRate)) : 0,
    avgResolutionHours: typeof raw.avgResolutionHours === 'number' && Number.isFinite(raw.avgResolutionHours) ? Math.max(0, raw.avgResolutionHours) : 0,
    byCategory: { ...base.byCategory, ...(isNumericRecord(raw.byCategory) ? raw.byCategory : {}) },
    byPriority: { ...base.byPriority, ...(isNumericRecord(raw.byPriority) ? raw.byPriority : {}) },
    byDepartment: isNumericRecord(raw.byDepartment) ? { ...raw.byDepartment } : {},
    byArea: isNumericRecord(raw.byArea) ? { ...raw.byArea } : {},
    monthlyTrends: Array.isArray(raw.monthlyTrends)
      ? raw.monthlyTrends
          .filter(
            (m) =>
              m &&
              typeof m.month === 'string' &&
              typeof m.reported === 'number' &&
              typeof m.resolved === 'number'
          )
          .slice(-12)
          .map((m) => ({
            month: m.month,
            reported: Math.max(0, m.reported),
            resolved: Math.max(0, m.resolved),
          }))
      : [],
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : base.updatedAt,
  };

  // Defense-in-depth: guarantee no stray or PII keys can ever pass through
  for (const key of Object.keys(sanitized) as Array<keyof PublicAggregateStats>) {
    if (!ALLOWED_PUBLIC_STATS_KEYS.has(key)) {
      delete (sanitized as unknown as Record<string, unknown>)[key];
    }
  }

  return sanitized;
}

function isNumericRecord(val: unknown): val is Record<string, number> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  for (const v of Object.values(val as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  return true;
}

export function applyComplaintCreateToStats(
  currentRaw: Partial<PublicAggregateStats> | null | undefined,
  complaint: Pick<
    ComplaintRecord,
    'userCategory' | 'priority' | 'assignedDepartment' | 'area'
  >,
  nowIso: string = new Date().toISOString()
): PublicAggregateStats {
  const current = sanitizePublicStats(currentRaw);

  const totalReported = current.totalReported + 1;
  const reportedCount = current.reportedCount + 1;
  const criticalCount = current.criticalCount + (complaint.priority === 'CRITICAL' ? 1 : 0);
  const resolutionRate =
    totalReported > 0
      ? Number(((current.resolvedCount / totalReported) * 100).toFixed(1))
      : 0;

  const monthKey = nowIso.slice(0, 7);
  const trends = [...current.monthlyTrends];
  const idx = trends.findIndex((t) => t.month === monthKey);
  if (idx >= 0) {
    trends[idx] = { ...trends[idx], reported: trends[idx].reported + 1 };
  } else {
    trends.push({ month: monthKey, reported: 1, resolved: 0 });
  }

  return {
    ...current,
    totalReported,
    reportedCount,
    criticalCount,
    resolutionRate,
    byCategory: {
      ...current.byCategory,
      [complaint.userCategory]: (current.byCategory[complaint.userCategory] || 0) + 1,
    },
    byPriority: {
      ...current.byPriority,
      [complaint.priority]: (current.byPriority[complaint.priority] || 0) + 1,
    },
    byDepartment: {
      ...current.byDepartment,
      [complaint.assignedDepartment]: (current.byDepartment[complaint.assignedDepartment] || 0) + 1,
    },
    byArea: {
      ...current.byArea,
      [complaint.area]: (current.byArea[complaint.area] || 0) + 1,
    },
    monthlyTrends: trends.slice(-12),
    updatedAt: nowIso,
  };
}

export function applyComplaintUpdateToStats(
  currentRaw: Partial<PublicAggregateStats> | null | undefined,
  existing: Pick<
    ComplaintRecord,
    'status' | 'priority' | 'assignedDepartment' | 'createdAt'
  >,
  next: Pick<ComplaintRecord, 'status' | 'priority' | 'assignedDepartment'>,
  nowIso: string = new Date().toISOString()
): PublicAggregateStats {
  const current = sanitizePublicStats(currentRaw);

  let reportedCount = current.reportedCount;
  let inProgressCount = current.inProgressCount;
  let resolvedCount = current.resolvedCount;
  let criticalCount = current.criticalCount;

  if (existing.status !== next.status) {
    if (existing.status === 'REPORTED') reportedCount = Math.max(0, reportedCount - 1);
    if (existing.status === 'IN_PROGRESS') inProgressCount = Math.max(0, inProgressCount - 1);
    if (existing.status === 'RESOLVED') resolvedCount = Math.max(0, resolvedCount - 1);

    if (next.status === 'REPORTED') reportedCount += 1;
    if (next.status === 'IN_PROGRESS') inProgressCount += 1;
    if (next.status === 'RESOLVED') resolvedCount += 1;
  }

  const byPriority = { ...current.byPriority };
  if (existing.priority !== next.priority) {
    byPriority[existing.priority] = Math.max(0, (byPriority[existing.priority] || 0) - 1);
    byPriority[next.priority] = (byPriority[next.priority] || 0) + 1;

    if (existing.priority === 'CRITICAL' && next.priority !== 'CRITICAL') {
      criticalCount = Math.max(0, criticalCount - 1);
    } else if (existing.priority !== 'CRITICAL' && next.priority === 'CRITICAL') {
      criticalCount += 1;
    }
  }

  const byDepartment = { ...current.byDepartment };
  if (existing.assignedDepartment !== next.assignedDepartment) {
    const prevCount = Math.max(0, (byDepartment[existing.assignedDepartment] || 0) - 1);
    if (prevCount === 0) {
      delete byDepartment[existing.assignedDepartment];
    } else {
      byDepartment[existing.assignedDepartment] = prevCount;
    }
    byDepartment[next.assignedDepartment] = (byDepartment[next.assignedDepartment] || 0) + 1;
  }

  const totalReported = Math.max(
    current.totalReported,
    reportedCount + inProgressCount + resolvedCount
  );
  const resolutionRate =
    totalReported > 0 ? Number(((resolvedCount / totalReported) * 100).toFixed(1)) : 0;

  const trends = [...current.monthlyTrends];
  if (existing.status !== 'RESOLVED' && next.status === 'RESOLVED') {
    const createdMonth =
      typeof existing.createdAt === 'string' && existing.createdAt.length >= 7
        ? existing.createdAt.slice(0, 7)
        : nowIso.slice(0, 7);
    const idx = trends.findIndex((t) => t.month === createdMonth);
    if (idx >= 0) {
      trends[idx] = { ...trends[idx], resolved: trends[idx].resolved + 1 };
    } else {
      trends.push({ month: createdMonth, reported: 1, resolved: 1 });
    }
  }

  return {
    ...current,
    totalReported,
    reportedCount,
    inProgressCount,
    resolvedCount,
    criticalCount,
    resolutionRate,
    byPriority,
    byDepartment,
    monthlyTrends: trends.slice(-12),
    updatedAt: nowIso,
  };
}
