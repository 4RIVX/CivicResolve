import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type {
  AdminNoteRecord,
  AuditLogRecord,
  ComplaintRecord,
  PublicAggregateStats,
  StatusHistoryRecord,
} from '../../shared/types';
import {
  computeAggregateStats,
  createEmptyPublicStats,
  filterAndPaginateComplaints,
  type CivicDataStore,
  type ComplaintQueryOptions,
  type PaginatedResult,
} from './firestoreRestClient';
import {
  applyComplaintCreateToStats,
  applyComplaintUpdateToStats,
  sanitizePublicStats,
} from './publicStatsMath';

function normalizeDocData<T>(id: string, data: Record<string, unknown> | undefined): T & { id: string } {
  const out: Record<string, unknown> = { id };
  for (const [key, val] of Object.entries(data ?? {})) {
    if (val instanceof Timestamp) {
      out[key] = val.toDate().toISOString();
    } else if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
      out[key] = (val as { toDate: () => Date }).toDate().toISOString();
    } else {
      out[key] = val;
    }
  }
  return out as T & { id: string };
}

export function getAdminFirestoreInstance(projectId: string, databaseId = '(default)'): Firestore {
  const app = getApps().length
    ? getApp()
    : initializeApp(projectId ? { projectId } : undefined);

  return databaseId && databaseId !== '(default)'
    ? getFirestore(app, databaseId)
    : getFirestore(app);
}

export class FirestoreAdminStore implements CivicDataStore {
  private readonly db: Firestore;

  constructor(
    projectId: string,
    databaseId = '(default)',
    firestoreInstance?: Firestore
  ) {
    this.db = firestoreInstance ?? getAdminFirestoreInstance(projectId, databaseId);
  }

  public async createComplaintWithRecords(params: {
    idToken: string;
    complaint: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'>;
    initialHistory: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord> {
    const complaintRef = this.db.collection('complaints').doc();
    const complaintId = complaintRef.id;
    const historyRef = complaintRef.collection('statusHistory').doc();
    const auditRef = this.db.collection('auditLogs').doc();
    const statsRef = this.db.collection('publicStats').doc('aggregate');
    const nowIso = new Date().toISOString();

    await this.db.runTransaction(async (tx) => {
      const statsSnap = await tx.get(statsRef);
      const currentStats = statsSnap.exists
        ? (normalizeDocData<PublicAggregateStats>(statsSnap.id, statsSnap.data()) as PublicAggregateStats)
        : createEmptyPublicStats();

      const nextStats = applyComplaintCreateToStats(currentStats, params.complaint, nowIso);
      const { updatedAt: _u, ...statsFields } = nextStats;

      tx.create(complaintRef, {
        ...params.complaint,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.create(historyRef, {
        ...params.initialHistory,
        complaintId,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.create(auditRef, {
        ...params.auditLog,
        targetId: complaintId,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(statsRef, {
        ...statsFields,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return {
      ...params.complaint,
      id: complaintId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  public async listComplaints(
    _idToken: string,
    options: ComplaintQueryOptions
  ): Promise<PaginatedResult<ComplaintRecord>> {
    let queryRef: FirebaseFirestore.Query = this.db.collection('complaints');
    if (options.citizenUid) {
      queryRef = queryRef.where('citizenUid', '==', options.citizenUid);
    }

    const snap = await queryRef.limit(200).get();
    const docs = snap.docs.map((d) => normalizeDocData<ComplaintRecord>(d.id, d.data()));
    return filterAndPaginateComplaints(docs, options);
  }

  public async listRecentComplaintsForDuplicateCheck(
    _idToken: string,
    citizenUid: string,
    isAdmin: boolean
  ): Promise<ComplaintRecord[]> {
    let queryRef: FirebaseFirestore.Query = this.db.collection('complaints');
    if (!isAdmin) {
      queryRef = queryRef.where('citizenUid', '==', citizenUid);
    }
    const snap = await queryRef.limit(100).get();
    return snap.docs.map((d) => normalizeDocData<ComplaintRecord>(d.id, d.data()));
  }

  public async getComplaintById(
    _idToken: string,
    complaintId: string
  ): Promise<ComplaintRecord | null> {
    const snap = await this.db.collection('complaints').doc(complaintId).get();
    if (!snap.exists) {
      return null;
    }
    return normalizeDocData<ComplaintRecord>(snap.id, snap.data());
  }

  public async getStatusHistory(
    _idToken: string,
    complaintId: string
  ): Promise<StatusHistoryRecord[]> {
    const snap = await this.db
      .collection('complaints')
      .doc(complaintId)
      .collection('statusHistory')
      .limit(50)
      .get();

    return snap.docs
      .map((d) => normalizeDocData<StatusHistoryRecord>(d.id, d.data()))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  public async getAdminNotes(
    _idToken: string,
    complaintId: string
  ): Promise<AdminNoteRecord[]> {
    const snap = await this.db
      .collection('complaints')
      .doc(complaintId)
      .collection('adminNotes')
      .limit(50)
      .get();

    return snap.docs
      .map((d) => normalizeDocData<AdminNoteRecord>(d.id, d.data()))
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
    const complaintRef = this.db.collection('complaints').doc(params.complaintId);
    const historyRef = complaintRef.collection('statusHistory').doc();
    const auditRef = this.db.collection('auditLogs').doc();
    const statsRef = this.db.collection('publicStats').doc('aggregate');
    const nowIso = new Date().toISOString();

    let resultRecord: ComplaintRecord = {
      ...params.existing,
      ...params.updates,
      updatedAt: nowIso,
      ...(params.markResolved ? { resolvedAt: nowIso } : {}),
    };

    await this.db.runTransaction(async (tx) => {
      const [complaintSnap, statsSnap] = await Promise.all([
        tx.get(complaintRef),
        tx.get(statsRef),
      ]);

      const currentExisting = complaintSnap.exists
        ? normalizeDocData<ComplaintRecord>(complaintSnap.id, complaintSnap.data())
        : params.existing;

      const nextState = {
        status: params.updates.status ?? currentExisting.status,
        priority: params.updates.priority ?? currentExisting.priority,
        assignedDepartment:
          params.updates.assignedDepartment ?? currentExisting.assignedDepartment,
      };

      const currentStats = statsSnap.exists
        ? (normalizeDocData<PublicAggregateStats>(statsSnap.id, statsSnap.data()) as PublicAggregateStats)
        : createEmptyPublicStats();

      const nextStats = applyComplaintUpdateToStats(
        currentStats,
        currentExisting,
        nextState,
        nowIso
      );
      const { updatedAt: _u, ...statsFields } = nextStats;

      tx.update(complaintRef, {
        ...params.updates,
        updatedAt: FieldValue.serverTimestamp(),
        ...(params.markResolved ? { resolvedAt: FieldValue.serverTimestamp() } : {}),
      });

      tx.create(historyRef, {
        ...params.historyEntry,
        complaintId: params.complaintId,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.create(auditRef, {
        ...params.auditLog,
        targetId: params.complaintId,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(statsRef, {
        ...statsFields,
        updatedAt: FieldValue.serverTimestamp(),
      });

      resultRecord = {
        ...currentExisting,
        ...params.updates,
        updatedAt: nowIso,
        ...(params.markResolved ? { resolvedAt: nowIso } : {}),
      };
    });

    return resultRecord;
  }

  public async addAdminNote(params: {
    idToken: string;
    complaintId: string;
    note: Omit<AdminNoteRecord, 'id' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<AdminNoteRecord> {
    const noteRef = this.db
      .collection('complaints')
      .doc(params.complaintId)
      .collection('adminNotes')
      .doc();
    const auditRef = this.db.collection('auditLogs').doc();
    const nowIso = new Date().toISOString();

    await this.db.runTransaction(async (tx) => {
      tx.create(noteRef, {
        ...params.note,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(auditRef, {
        ...params.auditLog,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return {
      ...params.note,
      id: noteRef.id,
      createdAt: nowIso,
    };
  }

  public async listAuditLogs(_idToken: string, limitCount = 50): Promise<AuditLogRecord[]> {
    const snap = await this.db
      .collection('auditLogs')
      .orderBy('createdAt', 'desc')
      .limit(Math.max(1, Math.min(100, limitCount)))
      .get();

    return snap.docs.map((d) => normalizeDocData<AuditLogRecord>(d.id, d.data()));
  }

  public async getPublicAggregateStats(): Promise<PublicAggregateStats> {
    const statsSnap = await this.db.collection('publicStats').doc('aggregate').get();
    if (statsSnap.exists) {
      const normalized = normalizeDocData<PublicAggregateStats>(statsSnap.id, statsSnap.data());
      return sanitizePublicStats(normalized);
    }

    // Fallback derivation from legitimate complaint records if aggregate doc does not yet exist
    const snap = await this.db.collection('complaints').limit(500).get();
    const complaints = snap.docs.map((d) => normalizeDocData<ComplaintRecord>(d.id, d.data()));
    return sanitizePublicStats(computeAggregateStats(complaints));
  }

  public async reconcilePublicStats(
    _idToken: string,
    stats: PublicAggregateStats
  ): Promise<void> {
    const clean = sanitizePublicStats(stats);
    const { updatedAt: _u, ...statsFields } = clean;
    await this.db
      .collection('publicStats')
      .doc('aggregate')
      .set({
        ...statsFields,
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
}
