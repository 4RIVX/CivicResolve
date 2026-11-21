import type {
  AdminNoteRecord,
  AuditLogRecord,
  ComplaintRecord,
  PublicAggregateStats,
  StatusHistoryRecord,
} from '../../shared/types';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
} from '../../shared/types';

export interface ComplaintQueryOptions {
  citizenUid?: string;
  search?: string;
  category?: string;
  priority?: string;
  status?: string;
  sortBy?: 'newest' | 'priority' | 'severity';
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CivicDataStore {
  createComplaintWithRecords(params: {
    idToken: string;
    complaint: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'>;
    initialHistory: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord>;

  listComplaints(
    idToken: string,
    options: ComplaintQueryOptions
  ): Promise<PaginatedResult<ComplaintRecord>>;

  listRecentComplaintsForDuplicateCheck(
    idToken: string,
    citizenUid: string,
    isAdmin: boolean
  ): Promise<ComplaintRecord[]>;

  getComplaintById(idToken: string, complaintId: string): Promise<ComplaintRecord | null>;

  getStatusHistory(idToken: string, complaintId: string): Promise<StatusHistoryRecord[]>;

  getAdminNotes(idToken: string, complaintId: string): Promise<AdminNoteRecord[]>;

  updateComplaintByAdmin(params: {
    idToken: string;
    complaintId: string;
    existing: ComplaintRecord;
    updates: Partial<
      Pick<
        ComplaintRecord,
        | 'status'
        | 'priority'
        | 'assignedDepartment'
        | 'citizenVisibleUpdate'
        | 'requiresHumanReview'
        | 'potentialDuplicateIds'
        | 'duplicateScore'
      >
    >;
    markResolved: boolean;
    historyEntry: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord>;

  addAdminNote(params: {
    idToken: string;
    complaintId: string;
    note: Omit<AdminNoteRecord, 'id' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<AdminNoteRecord>;

  listAuditLogs(idToken: string, limitCount?: number): Promise<AuditLogRecord[]>;

  getPublicAggregateStats(): Promise<PublicAggregateStats>;

  reconcilePublicStats(idToken: string, stats: PublicAggregateStats): Promise<void>;
}

// --- Firestore REST Value Encoding / Decoding ---

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

function encodeValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => encodeValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function decodeValue(val: FirestoreValue | undefined): unknown {
  if (!val) return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values ?? []).map((item) => decodeValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = decodeValue(v);
    }
    return out;
  }
  return undefined;
}

function encodeFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = encodeValue(v);
    }
  }
  return fields;
}

function decodeDoc<T>(doc: FirestoreDocument): T & { id: string } {
  const parts = doc.name.split('/');
  const id = parts[parts.length - 1];
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    out[k] = decodeValue(v);
  }
  return out as T & { id: string };
}

export function createEmptyPublicStats(): PublicAggregateStats {
  const byCategory: Record<string, number> = {};
  for (const cat of COMPLAINT_CATEGORIES) byCategory[cat] = 0;
  const byPriority: Record<string, number> = {};
  for (const prio of COMPLAINT_PRIORITIES) byPriority[prio] = 0;

  return {
    totalReported: 0,
    reportedCount: 0,
    inProgressCount: 0,
    resolvedCount: 0,
    criticalCount: 0,
    resolutionRate: 0,
    avgResolutionHours: 0,
    byCategory,
    byPriority,
    byDepartment: {},
    byArea: {},
    monthlyTrends: [],
    updatedAt: new Date().toISOString(),
  };
}

export function computeAggregateStats(complaints: ComplaintRecord[]): PublicAggregateStats {
  const stats = createEmptyPublicStats();
  if (complaints.length === 0) {
    return stats;
  }

  let resolutionHoursSum = 0;
  let resolvedWithDuration = 0;
  const monthlyMap = new Map<string, { reported: number; resolved: number }>();

  for (const c of complaints) {
    stats.totalReported += 1;
    if (c.status === 'REPORTED') stats.reportedCount += 1;
    if (c.status === 'IN_PROGRESS') stats.inProgressCount += 1;
    if (c.status === 'RESOLVED') stats.resolvedCount += 1;
    if (c.priority === 'CRITICAL') stats.criticalCount += 1;

    stats.byCategory[c.userCategory] = (stats.byCategory[c.userCategory] || 0) + 1;
    stats.byPriority[c.priority] = (stats.byPriority[c.priority] || 0) + 1;
    stats.byDepartment[c.assignedDepartment] = (stats.byDepartment[c.assignedDepartment] || 0) + 1;
    stats.byArea[c.area] = (stats.byArea[c.area] || 0) + 1;

    const monthKey = c.createdAt ? c.createdAt.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const existingMonth = monthlyMap.get(monthKey) ?? { reported: 0, resolved: 0 };
    existingMonth.reported += 1;
    if (c.status === 'RESOLVED') {
      existingMonth.resolved += 1;
      if (c.resolvedAt && c.createdAt) {
        const diffHours =
          (Date.parse(c.resolvedAt) - Date.parse(c.createdAt)) / (1000 * 60 * 60);
        if (Number.isFinite(diffHours) && diffHours >= 0) {
          resolutionHoursSum += diffHours;
          resolvedWithDuration += 1;
        }
      }
    }
    monthlyMap.set(monthKey, existingMonth);
  }

  stats.resolutionRate = Number(
    ((stats.resolvedCount / stats.totalReported) * 100).toFixed(1)
  );
  stats.avgResolutionHours =
    resolvedWithDuration > 0
      ? Number((resolutionHoursSum / resolvedWithDuration).toFixed(1))
      : 0;
  stats.monthlyTrends = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, counts]) => ({ month, ...counts }));
  stats.updatedAt = new Date().toISOString();

  return stats;
}

const PRIORITY_SORT_WEIGHT: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function filterAndPaginateComplaints(
  items: ComplaintRecord[],
  options: ComplaintQueryOptions
): PaginatedResult<ComplaintRecord> {
  const searchLower = (options.search || '').trim().toLowerCase();

  const filtered = items.filter((c) => {
    if (options.citizenUid && c.citizenUid !== options.citizenUid) return false;
    if (options.category && options.category !== 'ALL' && c.userCategory !== options.category) return false;
    if (options.priority && options.priority !== 'ALL' && c.priority !== options.priority) return false;
    if (options.status && options.status !== 'ALL' && c.status !== options.status) return false;
    if (searchLower) {
      const haystack = `${c.referenceId} ${c.title} ${c.location} ${c.area} ${c.assignedDepartment}`.toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (options.sortBy === 'priority') {
      const diff = (PRIORITY_SORT_WEIGHT[b.priority] ?? 0) - (PRIORITY_SORT_WEIGHT[a.priority] ?? 0);
      if (diff !== 0) return diff;
    } else if (options.sortBy === 'severity') {
      if (b.severity !== a.severity) return b.severity - a.severity;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  const total = filtered.length;
  const pageSize = Math.max(1, Math.min(50, options.pageSize));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(totalPages, options.page));
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

function randomFirestoreId(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class FirestoreRestStore implements CivicDataStore {
  private readonly baseDocPath: string;
  private readonly apiBase: string;

  constructor(projectId: string, databaseId: string = '(default)') {
    this.baseDocPath = `projects/${projectId}/databases/${databaseId}/documents`;
    this.apiBase = `https://firestore.googleapis.com/v1/${this.baseDocPath}`;
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    idToken?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
    if (!res.ok) {
      const errBody = await res.text();
      const err = new Error(`Firestore request failed (${res.status}): ${errBody}`);
      (err as Error & { statusCode?: number }).statusCode = res.status;
      throw err;
    }
    return (await res.json()) as T;
  }

  public async createComplaintWithRecords(params: {
    idToken: string;
    complaint: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'>;
    initialHistory: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord> {
    const complaintId = randomFirestoreId();
    const historyId = randomFirestoreId();
    const auditId = randomFirestoreId();

    const complaintDocName = `${this.baseDocPath}/complaints/${complaintId}`;
    const historyDocName = `${complaintDocName}/statusHistory/${historyId}`;
    const auditDocName = `${this.baseDocPath}/auditLogs/${auditId}`;

    const writes = [
      {
        update: {
          name: complaintDocName,
          fields: encodeFields(params.complaint as unknown as Record<string, unknown>),
        },
        updateTransforms: [
          { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
        currentDocument: { exists: false },
      },
      {
        update: {
          name: historyDocName,
          fields: encodeFields({
            ...params.initialHistory,
            complaintId,
          }),
        },
        updateTransforms: [
          { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        ],
        currentDocument: { exists: false },
      },
      {
        update: {
          name: auditDocName,
          fields: encodeFields({
            ...params.auditLog,
            targetId: complaintId,
          }),
        },
        updateTransforms: [
          { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        ],
        currentDocument: { exists: false },
      },
    ];

    await this.request(
      `${this.apiBase}:commit`,
      {
        method: 'POST',
        body: JSON.stringify({ writes }),
      },
      params.idToken
    );

    // Increment public aggregate statistics cleanly
    await this.incrementPublicStatsOnCreate(params.idToken, params.complaint);

    const nowIso = new Date().toISOString();
    return {
      ...params.complaint,
      id: complaintId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  private async incrementPublicStatsOnCreate(
    idToken: string,
    complaint: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    let current = await this.getPublicAggregateStats();
    const exists = current.totalReported > 0 || Object.values(current.byArea).length > 0;
    if (!exists) {
      current = createEmptyPublicStats();
    }

    const next: PublicAggregateStats = {
      ...current,
      totalReported: current.totalReported + 1,
      reportedCount: current.reportedCount + 1,
      criticalCount: current.criticalCount + (complaint.priority === 'CRITICAL' ? 1 : 0),
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
      updatedAt: new Date().toISOString(),
    };

    next.resolutionRate =
      next.totalReported > 0
        ? Number(((next.resolvedCount / next.totalReported) * 100).toFixed(1))
        : 0;

    const monthKey = new Date().toISOString().slice(0, 7);
    const trends = [...current.monthlyTrends];
    const idx = trends.findIndex((t) => t.month === monthKey);
    if (idx >= 0) {
      trends[idx] = { ...trends[idx], reported: trends[idx].reported + 1 };
    } else {
      trends.push({ month: monthKey, reported: 1, resolved: 0 });
    }
    next.monthlyTrends = trends.slice(-12);

    await this.reconcilePublicStats(idToken, next);
  }

  public async listComplaints(
    idToken: string,
    options: ComplaintQueryOptions
  ): Promise<PaginatedResult<ComplaintRecord>> {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: 'complaints' }],
      limit: 200,
    };

    if (options.citizenUid) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: 'citizenUid' },
          op: 'EQUAL',
          value: { stringValue: options.citizenUid },
        },
      };
    }

    const rows = await this.request<Array<{ document?: FirestoreDocument }>>(
      `${this.apiBase}:runQuery`,
      {
        method: 'POST',
        body: JSON.stringify({ structuredQuery }),
      },
      idToken
    );

    const docs = rows
      .filter((r) => Boolean(r.document))
      .map((r) => decodeDoc<ComplaintRecord>(r.document!));

    return filterAndPaginateComplaints(docs, options);
  }

  public async listRecentComplaintsForDuplicateCheck(
    idToken: string,
    citizenUid: string,
    isAdmin: boolean
  ): Promise<ComplaintRecord[]> {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: 'complaints' }],
      limit: 100,
    };
    if (!isAdmin) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: 'citizenUid' },
          op: 'EQUAL',
          value: { stringValue: citizenUid },
        },
      };
    }
    try {
      const rows = await this.request<Array<{ document?: FirestoreDocument }>>(
        `${this.apiBase}:runQuery`,
        {
          method: 'POST',
          body: JSON.stringify({ structuredQuery }),
        },
        idToken
      );
      return rows
        .filter((r) => Boolean(r.document))
        .map((r) => decodeDoc<ComplaintRecord>(r.document!));
    } catch {
      return [];
    }
  }

  public async getComplaintById(
    idToken: string,
    complaintId: string
  ): Promise<ComplaintRecord | null> {
    try {
      const doc = await this.request<FirestoreDocument>(
        `${this.apiBase}/complaints/${encodeURIComponent(complaintId)}`,
        { method: 'GET' },
        idToken
      );
      return decodeDoc<ComplaintRecord>(doc);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  public async getStatusHistory(
    idToken: string,
    complaintId: string
  ): Promise<StatusHistoryRecord[]> {
    const res = await this.request<{ documents?: FirestoreDocument[] }>(
      `${this.apiBase}/complaints/${encodeURIComponent(complaintId)}/statusHistory?pageSize=50`,
      { method: 'GET' },
      idToken
    );
    return (res.documents ?? [])
      .map((d) => decodeDoc<StatusHistoryRecord>(d))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  public async getAdminNotes(
    idToken: string,
    complaintId: string
  ): Promise<AdminNoteRecord[]> {
    const res = await this.request<{ documents?: FirestoreDocument[] }>(
      `${this.apiBase}/complaints/${encodeURIComponent(complaintId)}/adminNotes?pageSize=50`,
      { method: 'GET' },
      idToken
    );
    return (res.documents ?? [])
      .map((d) => decodeDoc<AdminNoteRecord>(d))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  public async updateComplaintByAdmin(params: {
    idToken: string;
    complaintId: string;
    existing: ComplaintRecord;
    updates: Partial<
      Pick<
        ComplaintRecord,
        | 'status'
        | 'priority'
        | 'assignedDepartment'
        | 'citizenVisibleUpdate'
        | 'requiresHumanReview'
        | 'potentialDuplicateIds'
        | 'duplicateScore'
      >
    >;
    markResolved: boolean;
    historyEntry: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord> {
    const complaintDocName = `${this.baseDocPath}/complaints/${params.complaintId}`;
    const historyId = randomFirestoreId();
    const auditId = randomFirestoreId();

    const merged: Record<string, unknown> = {
      ...params.existing,
      ...params.updates,
    };
    delete merged.id;
    delete merged.createdAt;
    delete merged.updatedAt;

    const fieldPaths = new Set<string>(Object.keys(params.updates));
    fieldPaths.add('updatedAt');
    const transforms: Array<{ fieldPath: string; setToServerValue: string }> = [
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ];
    if (params.markResolved) {
      fieldPaths.add('resolvedAt');
      transforms.push({ fieldPath: 'resolvedAt', setToServerValue: 'REQUEST_TIME' });
    }

    const writes = [
      {
        update: {
          name: complaintDocName,
          fields: encodeFields(merged),
        },
        updateMask: { fieldPaths: Array.from(fieldPaths) },
        updateTransforms: transforms,
        currentDocument: { exists: true },
      },
      {
        update: {
          name: `${complaintDocName}/statusHistory/${historyId}`,
          fields: encodeFields({
            ...params.historyEntry,
            complaintId: params.complaintId,
          }),
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      },
      {
        update: {
          name: `${this.baseDocPath}/auditLogs/${auditId}`,
          fields: encodeFields({
            ...params.auditLog,
            targetId: params.complaintId,
          }),
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      },
    ];

    await this.request(
      `${this.apiBase}:commit`,
      {
        method: 'POST',
        body: JSON.stringify({ writes }),
      },
      params.idToken
    );

    const all = await this.listComplaints(params.idToken, { page: 1, pageSize: 200 });
    await this.reconcilePublicStats(params.idToken, computeAggregateStats(all.items));

    const updated = await this.getComplaintById(params.idToken, params.complaintId);
    return updated ?? { ...params.existing, ...params.updates, updatedAt: new Date().toISOString() };
  }

  public async addAdminNote(params: {
    idToken: string;
    complaintId: string;
    note: Omit<AdminNoteRecord, 'id' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<AdminNoteRecord> {
    const noteId = randomFirestoreId();
    const auditId = randomFirestoreId();

    const writes = [
      {
        update: {
          name: `${this.baseDocPath}/complaints/${params.complaintId}/adminNotes/${noteId}`,
          fields: encodeFields(params.note as unknown as Record<string, unknown>),
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      },
      {
        update: {
          name: `${this.baseDocPath}/auditLogs/${auditId}`,
          fields: encodeFields(params.auditLog as unknown as Record<string, unknown>),
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      },
    ];

    await this.request(
      `${this.apiBase}:commit`,
      {
        method: 'POST',
        body: JSON.stringify({ writes }),
      },
      params.idToken
    );

    return {
      ...params.note,
      id: noteId,
      createdAt: new Date().toISOString(),
    };
  }

  public async listAuditLogs(idToken: string, limitCount = 50): Promise<AuditLogRecord[]> {
    const res = await this.request<{ documents?: FirestoreDocument[] }>(
      `${this.apiBase}/auditLogs?pageSize=${limitCount}`,
      { method: 'GET' },
      idToken
    );
    return (res.documents ?? [])
      .map((d) => decodeDoc<AuditLogRecord>(d))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  public async getPublicAggregateStats(): Promise<PublicAggregateStats> {
    try {
      const doc = await this.request<FirestoreDocument>(
        `${this.apiBase}/publicStats/aggregate`,
        { method: 'GET' }
      );
      return decodeDoc<PublicAggregateStats>(doc);
    } catch {
      return createEmptyPublicStats();
    }
  }

  public async reconcilePublicStats(
    idToken: string,
    stats: PublicAggregateStats
  ): Promise<void> {
    const payload: Record<string, unknown> = { ...stats };
    delete payload.id;
    delete payload.updatedAt;

    const writes = [
      {
        update: {
          name: `${this.baseDocPath}/publicStats/aggregate`,
          fields: encodeFields(payload),
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ];

    await this.request(
      `${this.apiBase}:commit`,
      {
        method: 'POST',
        body: JSON.stringify({ writes }),
      },
      idToken
    );
  }
}
