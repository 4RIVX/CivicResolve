import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeAggregateStats,
  createEmptyPublicStats,
  filterAndPaginateComplaints,
  FirestoreRestStore,
} from '../src/server/services/firestoreRestClient';
import type { ComplaintRecord } from '../src/shared/types';

function makeComplaint(overrides: Partial<ComplaintRecord> = {}): ComplaintRecord {
  return {
    id: 'cmp_1',
    referenceId: 'CR-2026-ABC123',
    citizenUid: 'uid-a',
    citizenEmail: 'a@example.com',
    citizenName: 'Citizen A',
    title: 'Broken road near bus stop',
    description: 'Deep pothole near bus stop causes skids.',
    location: 'Anna Nagar, Chennai',
    area: 'Anna Nagar',
    hasImage: false,
    userCategory: 'ROAD_INFRASTRUCTURE',
    language: 'en',
    status: 'REPORTED',
    priority: 'HIGH',
    severity: 4,
    department: 'ROADS_PUBLIC_WORKS',
    assignedDepartment: 'ROADS_PUBLIC_WORKS',
    subcategory: 'POTHOLE',
    aiSource: 'GEMINI',
    aiModel: 'gemini-4-hydrogen',
    aiExplanation: 'Road defect.',
    publicImpact: 'Commuter delay.',
    recommendedAction: 'Patch asphalt.',
    confidenceEstimate: 0.9,
    safetyEscalated: false,
    safetyReasons: [],
    requiresHumanReview: false,
    citizenVisibleUpdate: 'Received.',
    potentialDuplicateIds: [],
    duplicateScore: 0,
    isDemo: false,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('FirestoreRestStore & Pure Aggregation Helpers', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('computes aggregate stats, resolution rate, average resolution hours, and pagination', () => {
    const empty = computeAggregateStats([]);
    expect(empty.totalReported).toBe(0);

    const items = [
      makeComplaint({
        id: '1',
        status: 'RESOLVED',
        priority: 'CRITICAL',
        severity: 5,
        createdAt: '2026-11-20T00:00:00.000Z',
        resolvedAt: '2026-11-20T12:00:00.000Z',
      }),
      makeComplaint({
        id: '2',
        citizenUid: 'uid-b',
        status: 'IN_PROGRESS',
        priority: 'LOW',
        severity: 2,
        userCategory: 'STREETLIGHTS',
        assignedDepartment: 'ELECTRICAL_LIGHTING',
        area: 'Adyar',
        createdAt: '2026-11-21T00:00:00.000Z',
      }),
    ];

    const stats = computeAggregateStats(items);
    expect(stats.totalReported).toBe(2);
    expect(stats.resolvedCount).toBe(1);
    expect(stats.inProgressCount).toBe(1);
    expect(stats.criticalCount).toBe(1);
    expect(stats.resolutionRate).toBe(50);
    expect(stats.avgResolutionHours).toBe(12);
    expect(stats.byArea['Anna Nagar']).toBe(1);

    const page1 = filterAndPaginateComplaints(items, {
      sortBy: 'priority',
      page: 1,
      pageSize: 1,
    });
    expect(page1.total).toBe(2);
    expect(page1.totalPages).toBe(2);
    expect(page1.items[0].id).toBe('1');

    const searched = filterAndPaginateComplaints(items, {
      search: 'Adyar',
      sortBy: 'severity',
      page: 1,
      pageSize: 10,
    });
    expect(searched.total).toBe(1);
    expect(searched.items[0].id).toBe('2');
  });

  it('executes Firestore REST commit, query, get, update, note, audit, and stats round-trips', async () => {
    const sample = makeComplaint();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(':commit')) {
        return new Response(JSON.stringify({ writeResults: [] }), { status: 200 });
      }
      if (url.endsWith(':runQuery')) {
        return new Response(
          JSON.stringify([
            {
              document: {
                name: `projects/p/databases/d/documents/complaints/${sample.id}`,
                fields: {
                  referenceId: { stringValue: sample.referenceId },
                  citizenUid: { stringValue: sample.citizenUid },
                  citizenEmail: { stringValue: sample.citizenEmail },
                  citizenName: { stringValue: sample.citizenName },
                  title: { stringValue: sample.title },
                  description: { stringValue: sample.description },
                  location: { stringValue: sample.location },
                  area: { stringValue: sample.area },
                  hasImage: { booleanValue: false },
                  userCategory: { stringValue: sample.userCategory },
                  language: { stringValue: 'en' },
                  status: { stringValue: sample.status },
                  priority: { stringValue: sample.priority },
                  severity: { integerValue: '4' },
                  department: { stringValue: sample.department },
                  assignedDepartment: { stringValue: sample.assignedDepartment },
                  subcategory: { stringValue: sample.subcategory },
                  aiSource: { stringValue: 'GEMINI' },
                  aiModel: { stringValue: 'gemini-4-hydrogen' },
                  aiExplanation: { stringValue: sample.aiExplanation },
                  publicImpact: { stringValue: sample.publicImpact },
                  recommendedAction: { stringValue: sample.recommendedAction },
                  confidenceEstimate: { doubleValue: 0.9 },
                  safetyEscalated: { booleanValue: false },
                  safetyReasons: { arrayValue: { values: [] } },
                  requiresHumanReview: { booleanValue: false },
                  citizenVisibleUpdate: { stringValue: sample.citizenVisibleUpdate },
                  potentialDuplicateIds: { arrayValue: { values: [] } },
                  duplicateScore: { doubleValue: 0 },
                  isDemo: { booleanValue: false },
                  createdAt: { timestampValue: sample.createdAt },
                  updatedAt: { timestampValue: sample.updatedAt },
                },
              },
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes('/complaints/missing')) {
        return new Response('Not found', { status: 404 });
      }
      if (url.includes('/complaints/cmp_1/statusHistory')) {
        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/p/databases/d/documents/complaints/cmp_1/statusHistory/h1',
                fields: {
                  complaintId: { stringValue: 'cmp_1' },
                  previousStatus: { stringValue: 'NONE' },
                  newStatus: { stringValue: 'REPORTED' },
                  changedByUid: { stringValue: 'uid-a' },
                  changedByRole: { stringValue: 'CITIZEN' },
                  note: { stringValue: 'Created' },
                  citizenVisible: { booleanValue: true },
                  createdAt: { timestampValue: '2026-11-20T10:00:00.000Z' },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/complaints/cmp_1/adminNotes')) {
        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/p/databases/d/documents/complaints/cmp_1/adminNotes/n1',
                fields: {
                  complaintId: { stringValue: 'cmp_1' },
                  authorUid: { stringValue: 'uid-admin' },
                  authorEmail: { stringValue: 'admin@city.gov' },
                  note: { stringValue: 'Checked site.' },
                  internalOnly: { booleanValue: true },
                  createdAt: { timestampValue: '2026-11-20T11:00:00.000Z' },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/complaints/cmp_1')) {
        return new Response(
          JSON.stringify({
            name: 'projects/p/databases/d/documents/complaints/cmp_1',
            fields: {
              referenceId: { stringValue: sample.referenceId },
              citizenUid: { stringValue: sample.citizenUid },
              status: { stringValue: 'RESOLVED' },
              createdAt: { timestampValue: sample.createdAt },
              updatedAt: { timestampValue: sample.updatedAt },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/auditLogs')) {
        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/p/databases/d/documents/auditLogs/a1',
                fields: {
                  action: { stringValue: 'COMPLAINT_SUBMITTED' },
                  actorUid: { stringValue: 'uid-a' },
                  actorEmail: { stringValue: 'a@example.com' },
                  actorRole: { stringValue: 'CITIZEN' },
                  targetType: { stringValue: 'COMPLAINT' },
                  targetId: { stringValue: 'cmp_1' },
                  details: { stringValue: 'Submitted.' },
                  createdAt: { timestampValue: '2026-11-20T10:00:00.000Z' },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/publicStats/aggregate')) {
        return new Response(
          JSON.stringify({
            name: 'projects/p/databases/d/documents/publicStats/aggregate',
            fields: {
              totalReported: { integerValue: '1' },
              reportedCount: { integerValue: '1' },
              inProgressCount: { integerValue: '0' },
              resolvedCount: { integerValue: '0' },
              criticalCount: { integerValue: '0' },
              resolutionRate: { doubleValue: 0 },
              avgResolutionHours: { doubleValue: 0 },
              byCategory: { mapValue: { fields: { ROAD_INFRASTRUCTURE: { integerValue: '1' } } } },
              byPriority: { mapValue: { fields: { HIGH: { integerValue: '1' } } } },
              byDepartment: { mapValue: { fields: { ROADS_PUBLIC_WORKS: { integerValue: '1' } } } },
              byArea: { mapValue: { fields: { 'Anna Nagar': { integerValue: '1' } } } },
              monthlyTrends: { arrayValue: { values: [] } },
              updatedAt: { timestampValue: '2026-11-20T10:00:00.000Z' },
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: init?.method ?? 'GET' }), { status: 200 });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const store = new FirestoreRestStore('test-proj', 'test-db');
    const created = await store.createComplaintWithRecords({
      idToken: 'tok-1234567890',
      complaint: {
        ...sample,
        latitude: 13.08,
        longitude: 80.27,
      },
      initialHistory: {
        previousStatus: 'NONE',
        newStatus: 'REPORTED',
        changedByUid: 'uid-a',
        changedByRole: 'CITIZEN',
        note: 'Initial',
        citizenVisible: true,
      },
      auditLog: {
        action: 'COMPLAINT_SUBMITTED',
        actorUid: 'uid-a',
        actorEmail: 'a@example.com',
        actorRole: 'CITIZEN',
        targetType: 'COMPLAINT',
        targetId: 'CR-2026-ABC123',
        details: 'Submitted.',
      },
    });
    expect(created.id).toMatch(/^doc_/);

    const list = await store.listComplaints('tok-1234567890', {
      citizenUid: 'uid-a',
      page: 1,
      pageSize: 10,
    });
    expect(list.total).toBe(1);

    const dupCandidates = await store.listRecentComplaintsForDuplicateCheck('tok-1234567890', 'uid-a', false);
    expect(dupCandidates.length).toBe(1);

    expect(await store.getComplaintById('tok-1234567890', 'missing')).toBeNull();
    expect((await store.getComplaintById('tok-1234567890', 'cmp_1'))?.status).toBe('RESOLVED');
    expect((await store.getStatusHistory('tok-1234567890', 'cmp_1')).length).toBe(1);
    expect((await store.getAdminNotes('tok-1234567890', 'cmp_1')).length).toBe(1);

    const updated = await store.updateComplaintByAdmin({
      idToken: 'tok-1234567890',
      complaintId: 'cmp_1',
      existing: sample,
      updates: { status: 'RESOLVED' },
      markResolved: true,
      historyEntry: {
        previousStatus: 'REPORTED',
        newStatus: 'RESOLVED',
        changedByUid: 'uid-admin',
        changedByRole: 'ADMIN',
        note: 'Fixed',
        citizenVisible: true,
      },
      auditLog: {
        action: 'ADMIN_COMPLAINT_UPDATED',
        actorUid: 'uid-admin',
        actorEmail: 'admin@city.gov',
        actorRole: 'ADMIN',
        targetType: 'COMPLAINT',
        targetId: 'cmp_1',
        details: 'Resolved.',
      },
    });
    expect(updated.status).toBe('RESOLVED');

    const addedNote = await store.addAdminNote({
      idToken: 'tok-1234567890',
      complaintId: 'cmp_1',
      note: {
        complaintId: 'cmp_1',
        authorUid: 'uid-admin',
        authorEmail: 'admin@city.gov',
        note: 'Verified crew.',
        internalOnly: true,
      },
      auditLog: {
        action: 'ADMIN_INTERNAL_NOTE_ADDED',
        actorUid: 'uid-admin',
        actorEmail: 'admin@city.gov',
        actorRole: 'ADMIN',
        targetType: 'NOTE',
        targetId: 'cmp_1',
        details: 'Note added.',
      },
    });
    expect(addedNote.note).toBe('Verified crew.');

    expect((await store.listAuditLogs('tok-1234567890')).length).toBe(1);
    expect((await store.getPublicAggregateStats()).totalReported).toBe(1);
    await store.reconcilePublicStats('tok-1234567890', createEmptyPublicStats());

    // Error fallback on public stats
    globalThis.fetch = vi.fn(async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch;
    const fallbackStats = await store.getPublicAggregateStats();
    expect(fallbackStats.totalReported).toBe(0);
    expect(await store.listRecentComplaintsForDuplicateCheck('tok-1234567890', 'uid-a', true)).toEqual([]);
  });

  it('handles absent Firestore results, missing aggregates, and query failures safely', async () => {
    let queriesFail = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(':commit')) {
        return new Response(JSON.stringify({ writeResults: [] }), { status: 200 });
      }
      if (url.endsWith(':runQuery')) {
        if (queriesFail) return new Response('Forbidden', { status: 403 });
        return new Response(
          JSON.stringify([
            {},
            {
              document: {
                name: 'projects/p/databases/d/documents/complaints/cmp_1',
                fields: { createdAt: { timestampValue: '2026-11-20T10:00:00.000Z' } },
              },
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes('/complaints/missing')) return new Response('Not found', { status: 404 });
      if (url.includes('/complaints/error')) return new Response('Unavailable', { status: 503 });
      if (url.endsWith('/publicStats/aggregate')) return new Response('Not found', { status: 404 });
      if (url.includes('/statusHistory') || url.includes('/adminNotes') || url.includes('/auditLogs')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const store = new FirestoreRestStore('test-proj', '(default)');
    const sample = makeComplaint();
    const created = await store.createComplaintWithRecords({
      idToken: 'token-with-enough-length',
      complaint: sample,
      initialHistory: {
        previousStatus: 'NONE',
        newStatus: 'REPORTED',
        changedByUid: 'uid-a',
        changedByRole: 'CITIZEN',
        note: 'Created.',
        citizenVisible: true,
      },
      auditLog: {
        action: 'COMPLAINT_SUBMITTED',
        actorUid: 'uid-a',
        actorEmail: 'a@example.com',
        actorRole: 'CITIZEN',
        targetType: 'COMPLAINT',
        targetId: sample.referenceId,
        details: 'Created.',
      },
    });
    expect(created.id).toMatch(/^doc_/);
    expect((await store.getPublicAggregateStats()).totalReported).toBe(0);

    const listed = await store.listComplaints('token-with-enough-length', { page: 1, pageSize: 10 });
    expect(listed.total).toBe(1);
    expect(await store.getComplaintById('token-with-enough-length', 'missing')).toBeNull();
    await expect(store.getComplaintById('token-with-enough-length', 'error')).rejects.toThrow(
      'Firestore request failed (503)'
    );
    expect(await store.getStatusHistory('token-with-enough-length', 'cmp_1')).toEqual([]);
    expect(await store.getAdminNotes('token-with-enough-length', 'cmp_1')).toEqual([]);
    expect(await store.listAuditLogs('token-with-enough-length')).toEqual([]);

    queriesFail = true;
    expect(
      await store.listRecentComplaintsForDuplicateCheck('token-with-enough-length', 'uid-a', false)
    ).toEqual([]);
  });
});
