import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreAdminStore } from '../src/server/services/firestoreAdminStore';
import {
  applyComplaintCreateToStats,
  applyComplaintUpdateToStats,
  sanitizePublicStats,
} from '../src/server/services/publicStatsMath';
import { createEmptyPublicStats } from '../src/server/services/firestoreRestClient';
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

  function makeCollectionRef(colPath: string): any {
    const queryObj: any = {
      _filters: [] as Array<{ field: string; value: unknown }>,
      _limit: 500,
      where(field: string, _op: string, value: unknown) {
        return {
          ...queryObj,
          _filters: [...queryObj._filters, { field, value }],
        };
      },
      orderBy() {
        return queryObj;
      },
      limit(n: number) {
        return {
          ...queryObj,
          _limit: n,
        };
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
  it('sanitizes malformed public stats and handles every status, priority, department transition', () => {
    const base = sanitizePublicStats({
      totalReported: -10,
      reportedCount: Number.NaN,
      inProgressCount: 'bad',
      resolvedCount: Infinity,
      criticalCount: 2,
      resolutionRate: 150,
      avgResolutionHours: -5,
      byCategory: { STREETLIGHTS: -1 },
      byPriority: { HIGH: 2 },
      byDepartment: { ELECTRICAL_LIGHTING: -3 },
      byArea: { Adyar: 'bad' },
      monthlyTrends: [
        { month: '2026-11', reported: 3, resolved: 1 },
        { month: '', reported: 1, resolved: 0 },
      ],
      updatedAt: '',
    } as unknown as Partial<ReturnType<typeof sanitizePublicStats>>);
    expect(base.totalReported).toBe(0);
    expect(base.reportedCount).toBe(0);
    expect(base.resolutionRate).toBe(100);
    expect(base.avgResolutionHours).toBe(0);
    expect(base.byCategory.STREETLIGHTS).toBe(0);
    expect(base.monthlyTrends).toHaveLength(1);
    expect(sanitizePublicStats(null).totalReported).toBe(0);

    const existing = {
      status: 'IN_PROGRESS' as const,
      priority: 'CRITICAL' as const,
      assignedDepartment: 'PUBLIC_SAFETY_ENFORCEMENT' as const,
      createdAt: '2026-10-10T10:00:00.000Z',
    };
    const updated = applyComplaintUpdateToStats(
      {
        totalReported: 1,
        reportedCount: 0,
        inProgressCount: 1,
        resolvedCount: 0,
        criticalCount: 1,
        byPriority: { CRITICAL: 1, HIGH: 0 },
        byDepartment: { PUBLIC_SAFETY_ENFORCEMENT: 1 },
        monthlyTrends: [],
      },
      existing,
      {
        status: 'RESOLVED',
        priority: 'HIGH',
        assignedDepartment: 'ELECTRICAL_LIGHTING',
      },
      '2026-11-21T12:00:00.000Z'
    );
    expect(updated.resolvedCount).toBe(1);
    expect(updated.inProgressCount).toBe(0);
    expect(updated.criticalCount).toBe(0);
    expect(updated.byDepartment.PUBLIC_SAFETY_ENFORCEMENT).toBeUndefined();
    expect(updated.byDepartment.ELECTRICAL_LIGHTING).toBe(1);
    expect(updated.monthlyTrends[0]).toEqual({
      month: '2026-10',
      reported: 1,
      resolved: 1,
    });

    const sameState = applyComplaintUpdateToStats(
      updated,
      {
        status: 'RESOLVED',
        priority: 'HIGH',
        assignedDepartment: 'ELECTRICAL_LIGHTING',
        createdAt: '2026-10-10T10:00:00.000Z',
      },
      {
        status: 'RESOLVED',
        priority: 'HIGH',
        assignedDepartment: 'ELECTRICAL_LIGHTING',
      }
    );
    expect(sameState.resolvedCount).toBe(1);

    const existingMonth = applyComplaintCreateToStats(
      {
        ...sanitizePublicStats(null),
        monthlyTrends: [{ month: '2026-11', reported: 2, resolved: 1 }],
      },
      {
        userCategory: 'WATER_SUPPLY',
        priority: 'CRITICAL',
        assignedDepartment: 'WATER_RESOURCES',
        area: 'Adyar',
      },
      '2026-11-21T12:00:00.000Z'
    );
    expect(existingMonth.monthlyTrends[0].reported).toBe(3);
    expect(existingMonth.byArea.Adyar).toBe(1);
  });

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

  it('covers missing documents, fallback aggregation, reconciliation, and transaction failures', async () => {
    const { db, store } = createMockAdminFirestore();
    const adminStore = new FirestoreAdminStore('test-proj', '(default)', db);

    await expect(adminStore.getComplaintById('unused', 'missing')).resolves.toBeNull();
    await expect(adminStore.getStatusHistory('unused', 'missing')).resolves.toEqual([]);
    await expect(adminStore.getAdminNotes('unused', 'missing')).resolves.toEqual([]);
    await expect(adminStore.listRecentComplaintsForDuplicateCheck('unused', 'uid-a', false)).resolves.toEqual([]);
    await expect(adminStore.listRecentComplaintsForDuplicateCheck('unused', 'uid-a', true)).resolves.toEqual([]);

    const fallback = await adminStore.getPublicAggregateStats();
    expect(fallback.totalReported).toBe(0);

    await adminStore.reconcilePublicStats('unused', {
      ...createEmptyPublicStats(),
      totalReported: 2,
      reportedCount: 2,
      byArea: { Adyar: 2 },
    });
    expect(store.has('publicStats/aggregate')).toBe(true);
    const reconciled = await adminStore.getPublicAggregateStats();
    expect(reconciled.totalReported).toBe(2);
    expect(reconciled.byArea.Adyar).toBe(2);

    const failingDb: any = {
      collection: () => ({
        doc: () => ({
          id: 'cmp_failed',
          collection: () => ({ doc: () => ({ id: 'history_failed' }) }),
        }),
      }),
      runTransaction: async () => {
        throw new Error('transaction aborted');
      },
    };
    const failingStore = new FirestoreAdminStore('test-proj', '(default)', failingDb);
    await expect(
      failingStore.createComplaintWithRecords({
        idToken: 'unused',
        complaint: {
          referenceId: 'CR-2026-FAIL01',
          citizenUid: 'uid-a',
          citizenEmail: 'a@example.com',
          citizenName: 'A',
          title: 'Database failure test',
          description: 'This description verifies transaction rollback behavior.',
          location: 'Adyar',
          area: 'Adyar',
          hasImage: false,
          userCategory: 'OTHER',
          language: 'en',
          status: 'REPORTED',
          priority: 'MEDIUM',
          severity: 3,
          department: 'GENERAL_MUNICIPAL_DESK',
          assignedDepartment: 'GENERAL_MUNICIPAL_DESK',
          subcategory: 'GENERAL_ISSUE',
          aiSource: 'FALLBACK',
          aiModel: 'fallback',
          aiExplanation: 'Fallback',
          publicImpact: 'Impact',
          recommendedAction: 'Inspect',
          confidenceEstimate: 0.45,
          safetyEscalated: false,
          safetyReasons: [],
          requiresHumanReview: true,
          citizenVisibleUpdate: 'Received',
          potentialDuplicateIds: [],
          duplicateScore: 0,
          isDemo: false,
        },
        initialHistory: {
          previousStatus: 'NONE',
          newStatus: 'REPORTED',
          changedByUid: 'uid-a',
          changedByRole: 'CITIZEN',
          note: 'Submitted',
          citizenVisible: true,
        },
        auditLog: {
          action: 'COMPLAINT_SUBMITTED',
          actorUid: 'uid-a',
          actorEmail: 'a@example.com',
          actorRole: 'CITIZEN',
          targetType: 'COMPLAINT',
          targetId: 'CR-2026-FAIL01',
          details: 'Submitted',
        },
      })
    ).rejects.toThrow('transaction aborted');
  });
});
