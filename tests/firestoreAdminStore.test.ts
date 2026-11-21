import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreAdminStore } from '../src/server/services/firestoreAdminStore';
import {
  applyComplaintCreateToStats,
  applyComplaintUpdateToStats,
  sanitizePublicStats,
} from '../src/server/services/publicStatsMath';
import type { ComplaintRecord } from '../src/shared/types';

function createMockAdminFirestore() {
  const store = new Map<string, Record<string, unknown>>();
  let idSeq = 1;

  function makeDocRef(path: string): any {
    return {
      id: path.split('/').pop()!,
      path,
      collection(sub: string) {
        return makeCollectionRef(`${path}/${sub}`);
      },
      async get() {
        const data = store.get(path);
        return {
          id: path.split('/').pop()!,
          exists: Boolean(data),
          data: () => (data ? { ...data } : undefined),
        };
      },
      async set(data: Record<string, unknown>) {
        store.set(path, { ...data });
      },
    };
  }

  function makeCollectionRef(
    colPath: string,
    filters: Array<{ field: string; value: unknown }> = [],
    limit = 500
  ): any {
    const queryObj: any = {
      _filters: filters,
      _limit: limit,
      where(field: string, _op: string, value: unknown) {
        return makeCollectionRef(colPath, [...queryObj._filters, { field, value }], queryObj._limit);
      },
      orderBy() {
        return makeCollectionRef(colPath, queryObj._filters, queryObj._limit);
      },
      limit(n: number) {
        return makeCollectionRef(colPath, queryObj._filters, n);
      },
      async get() {
        const prefix = `${colPath}/`;
        const docs: any[] = [];
        for (const [k, v] of store.entries()) {
          if (!k.startsWith(prefix)) continue;
          const rest = k.slice(prefix.length);
          if (rest.includes('/')) continue;
          const matches = queryObj._filters.every(
            (f: { field: string; value: unknown }) => v[f.field] === f.value
          );
          if (matches) {
            docs.push({
              id: rest,
              exists: true,
              data: () => ({ ...v }),
            });
          }
        }
        return { docs: docs.slice(0, queryObj._limit) };
      },
      doc(id?: string) {
        const docId = id ?? `adm_${idSeq++}`;
        return makeDocRef(`${colPath}/${docId}`);
      },
    };
    return queryObj;
  }

  function materializeFields(data: Record<string, unknown>, now: string): Record<string, unknown> {
    const out: Record<string, unknown> = { ...data };
    for (const [k, v] of Object.entries(out)) {
      if (
        v &&
        typeof v === 'object' &&
        ('isEqual' in v || v.constructor?.name?.includes('Transform') || v.constructor?.name?.includes('FieldValue'))
      ) {
        out[k] = now;
      }
    }
    return out;
  }

  const db: any = {
    collection: (name: string) => makeCollectionRef(name),
    async runTransaction(fn: (tx: any) => Promise<void>) {
      const tx = {
        async get(ref: any) {
          return ref.get();
        },
        create(ref: any, data: Record<string, unknown>) {
          store.set(ref.path, materializeFields(data, new Date().toISOString()));
        },
        set(ref: any, data: Record<string, unknown>) {
          store.set(ref.path, materializeFields(data, new Date().toISOString()));
        },
        update(ref: any, data: Record<string, unknown>) {
          const prev = store.get(ref.path) ?? {};
          store.set(ref.path, { ...prev, ...materializeFields(data, new Date().toISOString()) });
        },
      };
      await fn(tx);
    },
  };

  return { db: db as Firestore, store };
}

describe('Phase 2: Server-Side Transactional Public Statistics & FirestoreAdminStore', () => {
  it('computes transactional create and update publicStats transitions and strips stray PII keys', () => {
    const dirty = {
      totalReported: 1,
      reportedCount: 1,
      citizenEmail: 'leak@example.com',
      citizenName: 'PII Leak',
      byArea: { 'Anna Nagar': 1 },
    } as unknown as Record<string, unknown>;

    const clean = sanitizePublicStats(dirty as Partial<ReturnType<typeof sanitizePublicStats>>);
    expect((clean as unknown as Record<string, unknown>).citizenEmail).toBeUndefined();
    expect((clean as unknown as Record<string, unknown>).citizenName).toBeUndefined();

    const afterCreate = applyComplaintCreateToStats(
      clean,
      {
        userCategory: 'PUBLIC_SAFETY',
        priority: 'CRITICAL',
        assignedDepartment: 'PUBLIC_SAFETY_ENFORCEMENT',
        area: 'Adyar',
      },
      '2026-11-21T08:00:00.000Z'
    );
    expect(afterCreate.totalReported).toBe(2);
    expect(afterCreate.reportedCount).toBe(2);
    expect(afterCreate.criticalCount).toBe(1);
    expect(afterCreate.byArea['Adyar']).toBe(1);

    const afterResolve = applyComplaintUpdateToStats(
      afterCreate,
      {
        status: 'REPORTED',
        priority: 'CRITICAL',
        assignedDepartment: 'PUBLIC_SAFETY_ENFORCEMENT',
        createdAt: '2026-11-21T08:00:00.000Z',
      },
      {
        status: 'RESOLVED',
        priority: 'HIGH',
        assignedDepartment: 'ELECTRICAL_LIGHTING',
      },
      '2026-11-21T09:00:00.000Z'
    );
    expect(afterResolve.reportedCount).toBe(1);
    expect(afterResolve.resolvedCount).toBe(1);
    expect(afterResolve.criticalCount).toBe(0);
    expect(afterResolve.resolutionRate).toBe(50);
    expect(afterResolve.byDepartment['ELECTRICAL_LIGHTING']).toBe(1);
    expect(afterResolve.byDepartment['PUBLIC_SAFETY_ENFORCEMENT']).toBeUndefined();
  });

  it('persists complaints, history, auditLogs, adminNotes, and publicStats transactionally via Admin SDK store', async () => {
    const { db } = createMockAdminFirestore();
    const adminStore = new FirestoreAdminStore('test-proj', '(default)', db);

    const baseComplaint: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'> = {
      referenceId: 'CR-2026-ADM001',
      citizenUid: 'uid-c1',
      citizenEmail: 'citizen1@example.com',
      citizenName: 'Citizen One',
      title: 'Gas leak odor near junction',
      description: 'Strong gas leak smell near transformer crossing.',
      location: 'Market Street, Adyar',
      area: 'Market Street',
      hasImage: false,
      userCategory: 'PUBLIC_SAFETY',
      language: 'en',
      status: 'REPORTED',
      priority: 'CRITICAL',
      severity: 5,
      department: 'PUBLIC_SAFETY_ENFORCEMENT',
      assignedDepartment: 'PUBLIC_SAFETY_ENFORCEMENT',
      subcategory: 'GAS_LEAK',
      aiSource: 'GEMINI',
      aiModel: 'gemini-4-hydrogen',
      aiExplanation: 'Gas leak hazard.',
      publicImpact: 'Immediate risk.',
      recommendedAction: 'Dispatch emergency crew.',
      confidenceEstimate: 0.92,
      safetyEscalated: true,
      safetyReasons: ['Gas leak safety rule triggered.'],
      requiresHumanReview: true,
      citizenVisibleUpdate: 'Received.',
      potentialDuplicateIds: [],
      duplicateScore: 0,
      isDemo: false,
    };

    const created = await adminStore.createComplaintWithRecords({
      idToken: 'unused-by-admin-sdk',
      complaint: baseComplaint,
      initialHistory: {
        previousStatus: 'NONE',
        newStatus: 'REPORTED',
        changedByUid: 'uid-c1',
        changedByRole: 'CITIZEN',
        note: 'Submitted.',
        citizenVisible: true,
      },
      auditLog: {
        action: 'COMPLAINT_SUBMITTED',
        actorUid: 'uid-c1',
        actorEmail: 'citizen1@example.com',
        actorRole: 'CITIZEN',
        targetType: 'COMPLAINT',
        targetId: 'CR-2026-ADM001',
        details: 'Submitted.',
      },
    });

    const statsAfterCreate = await adminStore.getPublicAggregateStats();
    expect(statsAfterCreate.totalReported).toBe(1);
    expect(statsAfterCreate.criticalCount).toBe(1);
    expect(JSON.stringify(statsAfterCreate)).not.toContain('citizen1@example.com');

    await adminStore.updateComplaintByAdmin({
      idToken: 'unused',
      complaintId: created.id,
      existing: created,
      updates: { status: 'RESOLVED', citizenVisibleUpdate: 'Fixed.' },
      markResolved: true,
      historyEntry: {
        previousStatus: 'REPORTED',
        newStatus: 'RESOLVED',
        changedByUid: 'uid-admin',
        changedByRole: 'ADMIN',
        note: 'Resolved.',
        citizenVisible: true,
      },
      auditLog: {
        action: 'ADMIN_COMPLAINT_UPDATED',
        actorUid: 'uid-admin',
        actorEmail: 'admin@city.gov',
        actorRole: 'ADMIN',
        targetType: 'COMPLAINT',
        targetId: created.id,
        details: 'Resolved.',
      },
    });

    const statsAfterResolve = await adminStore.getPublicAggregateStats();
    expect(statsAfterResolve.resolvedCount).toBe(1);
    expect(statsAfterResolve.reportedCount).toBe(0);
    expect(statsAfterResolve.resolutionRate).toBe(100);

    await adminStore.addAdminNote({
      idToken: 'unused',
      complaintId: created.id,
      note: {
        complaintId: created.id,
        authorUid: 'uid-admin',
        authorEmail: 'admin@city.gov',
        note: 'Internal verification passed.',
        internalOnly: true,
      },
      auditLog: {
        action: 'ADMIN_INTERNAL_NOTE_ADDED',
        actorUid: 'uid-admin',
        actorEmail: 'admin@city.gov',
        actorRole: 'ADMIN',
        targetType: 'NOTE',
        targetId: created.id,
        details: 'Added note.',
      },
    });

    const notes = await adminStore.getAdminNotes('unused', created.id);
    const logs = await adminStore.listAuditLogs('unused', 10);
    const listCitizen = await adminStore.listComplaints('unused', {
      citizenUid: 'uid-c1',
      page: 1,
      pageSize: 10,
    });
    expect(notes.length).toBe(1);
    expect(logs.length).toBe(3);
    expect(listCitizen.total).toBe(1);
  });

  it('handles missing documents, admin query variants, Firestore timestamps, and derived public stats', async () => {
    const { db, store } = createMockAdminFirestore();
    const createdAt = '2026-11-20T10:00:00.000Z';
    store.set('complaints/cmp_timestamp', {
      citizenUid: 'uid-c1',
      status: 'RESOLVED',
      priority: 'HIGH',
      userCategory: 'ROAD_INFRASTRUCTURE',
      assignedDepartment: 'ROADS_PUBLIC_WORKS',
      area: 'Adyar',
      createdAt: Timestamp.fromDate(new Date(createdAt)),
      resolvedAt: { toDate: () => new Date('2026-11-20T12:00:00.000Z') },
    });

    const adminStore = new FirestoreAdminStore('test-proj', '(default)', db);
    expect(await adminStore.getComplaintById('unused', 'missing')).toBeNull();

    const complaint = await adminStore.getComplaintById('unused', 'cmp_timestamp');
    expect(complaint?.createdAt).toBe(createdAt);
    expect(complaint?.resolvedAt).toBe('2026-11-20T12:00:00.000Z');

    const allComplaints = await adminStore.listComplaints('unused', { page: 1, pageSize: 10 });
    expect(allComplaints.total).toBe(1);
    expect(
      (await adminStore.listComplaints('unused', {
        citizenUid: 'uid-other',
        page: 1,
        pageSize: 10,
      })).total
    ).toBe(0);

    expect((await adminStore.listRecentComplaintsForDuplicateCheck('unused', 'uid-c1', false))).toHaveLength(1);
    expect((await adminStore.listRecentComplaintsForDuplicateCheck('unused', 'uid-other', false))).toHaveLength(0);
    expect((await adminStore.listRecentComplaintsForDuplicateCheck('unused', 'uid-other', true))).toHaveLength(1);
    expect(await adminStore.getStatusHistory('unused', 'cmp_timestamp')).toEqual([]);
    expect(await adminStore.getAdminNotes('unused', 'cmp_timestamp')).toEqual([]);
    expect(await adminStore.listAuditLogs('unused')).toEqual([]);

    const derivedStats = await adminStore.getPublicAggregateStats();
    expect(derivedStats.totalReported).toBe(1);
    expect(derivedStats.resolvedCount).toBe(1);
    expect(derivedStats.avgResolutionHours).toBe(2);
  });
});
