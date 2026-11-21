import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PublicStatsCache } from '../src/server/services/publicStatsCache';
import {
  computeAggregateStats,
  createEmptyPublicStats,
  filterAndPaginateComplaints,
  type CivicDataStore,
  type ComplaintQueryOptions,
} from '../src/server/services/firestoreRestClient';
import { createApp } from '../src/server/app';
import type { AppConfig } from '../src/server/config';
import type { TokenVerifier } from '../src/server/auth';
import type {
  AdminNoteRecord,
  AuditLogRecord,
  ComplaintRecord,
  PublicAggregateStats,
  StatusHistoryRecord,
} from '../src/shared/types';

class TrackedStore implements CivicDataStore {
  public complaints: ComplaintRecord[] = [];
  public publicStats: PublicAggregateStats = createEmptyPublicStats();
  public publicReads = 0;

  async createComplaintWithRecords(params: {
    idToken: string;
    complaint: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'>;
    initialHistory: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord> {
    const now = new Date().toISOString();
    const record: ComplaintRecord = {
      ...params.complaint,
      id: `cmp_${this.complaints.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    this.complaints.push(record);
    this.publicStats = computeAggregateStats(this.complaints);
    return record;
  }

  async listComplaints(_idToken: string, options: ComplaintQueryOptions) {
    return filterAndPaginateComplaints(this.complaints, options);
  }
  async listRecentComplaintsForDuplicateCheck() {
    return this.complaints;
  }
  async getComplaintById(_idToken: string, id: string) {
    return this.complaints.find((c) => c.id === id) ?? null;
  }
  async getStatusHistory() {
    return [];
  }
  async getAdminNotes() {
    return [];
  }
  async updateComplaintByAdmin(params: {
    idToken: string;
    complaintId: string;
    existing: ComplaintRecord;
    updates: Partial<ComplaintRecord>;
    markResolved: boolean;
    historyEntry: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord> {
    const now = new Date().toISOString();
    const updated: ComplaintRecord = {
      ...params.existing,
      ...params.updates,
      updatedAt: now,
    };
    const idx = this.complaints.findIndex((c) => c.id === params.complaintId);
    if (idx >= 0) this.complaints[idx] = updated;
    this.publicStats = computeAggregateStats(this.complaints);
    return updated;
  }
  async addAdminNote(): Promise<AdminNoteRecord> {
    throw new Error('Unused');
  }
  async listAuditLogs() {
    return [];
  }
  async getPublicAggregateStats() {
    this.publicReads += 1;
    return this.publicStats;
  }
  async reconcilePublicStats(_idToken: string, stats: PublicAggregateStats) {
    this.publicStats = stats;
  }
}

describe('Phase 6 Efficiency & Security: Public Stats 30s TTL Cache', () => {
  it('caches for 30 seconds, expires at >=30s, deduplicates concurrent reads, and strips PII', async () => {
    let clock = 1_700_000_000_000;
    const cache = new PublicStatsCache({
      ttlMs: 30_000,
      now: () => clock,
    });

    const fetcher = vi.fn(async () => {
      const base = createEmptyPublicStats();
      return {
        ...base,
        totalReported: 7,
        citizenEmail: 'leak@example.com',
        citizenUid: 'secret-uid',
      } as unknown as PublicAggregateStats;
    });

    // Initial fetch hits store once and strips stray PII keys
    const first = await cache.getStats(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.totalReported).toBe(7);
    expect(JSON.stringify(first)).not.toContain('leak@example.com');
    expect(JSON.stringify(first)).not.toContain('secret-uid');

    // Within 30s (< 30,000ms) -> serves from cache
    clock += 29_999;
    const second = await cache.getStats(fetcher);
    expect(second.totalReported).toBe(7);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // At 30s boundary (>= 30,000ms) -> cache expires and triggers fresh read
    clock += 1;
    await cache.getStats(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Concurrent calls after invalidate() share one in-flight fetch
    cache.invalidate();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowFetcher = vi.fn(async () => {
      await gate;
      return { ...createEmptyPublicStats(), totalReported: 9 };
    });

    const p1 = cache.getStats(slowFetcher);
    const p2 = cache.getStats(slowFetcher);
    const p3 = cache.getStats(slowFetcher);
    release();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(slowFetcher).toHaveBeenCalledTimes(1);
    expect(r1.totalReported).toBe(9);
    expect(r2.totalReported).toBe(9);
    expect(r3.totalReported).toBe(9);
  });

  it('serves cached public statistics/trends across endpoints and invalidates immediately on mutations', async () => {
    let clock = 1_700_000_000_000;
    const store = new TrackedStore();
    const config: AppConfig = {
      port: 3000,
      nodeEnv: 'test',
      geminiApiKey: '',
      geminiModel: 'gemini-4-hydrogen',
      adminEmails: new Set(['admin@civic.gov']),
      firebaseProjectId: 'test-project',
      firestoreDatabaseId: '(default)',
    };
    const verifyToken: TokenVerifier = async (token) => {
      if (token === 'token-citizen-1') {
        return { uid: 'uid-1', email: 'c1@example.com', email_verified: true, name: 'Citizen 1' };
      }
      return { uid: 'uid-admin', email: 'admin@civic.gov', email_verified: true, name: 'Admin' };
    };

    const app = createApp({
      config,
      verifyToken,
      dataStore: store,
      statsCache: new PublicStatsCache({ ttlMs: 30_000, now: () => clock }),
      disableRateLimit: true,
    });

    // Hit /statistics then /trends -> 1 Firestore read total
    const s1 = await request(app).get('/api/public/statistics');
    const t1 = await request(app).get('/api/public/trends');
    expect(s1.status).toBe(200);
    expect(t1.status).toBe(200);
    expect(s1.body.statistics.totalReported).toBe(0);
    expect(store.publicReads).toBe(1);

    // Citizen submits complaint -> cache invalidated -> next read sees totalReported === 1
    const sub = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-1')
      .send({
        title: 'Overflowing bin at bus bay',
        description: 'Garbage bin overflowing onto sidewalk near market gate.',
        location: 'Market Road, Adyar',
        userCategory: 'GARBAGE_WASTE',
        language: 'en',
      });
    expect(sub.status).toBe(201);

    const s2 = await request(app).get('/api/public/statistics');
    expect(s2.body.statistics.totalReported).toBe(1);
    expect(store.publicReads).toBe(2);

    // Within 30s -> still 2 reads
    clock += 15_000;
    await request(app).get('/api/public/statistics');
    expect(store.publicReads).toBe(2);

    // Admin resolves complaint -> cache invalidated -> next read reflects resolvedCount === 1
    const patch = await request(app)
      .patch(`/api/admin/complaints/${sub.body.complaint.id}`)
      .set('Authorization', 'Bearer token-admin-1')
      .send({ status: 'RESOLVED' });
    expect(patch.status).toBe(200);

    const s3 = await request(app).get('/api/public/statistics');
    expect(s3.body.statistics.resolvedCount).toBe(1);
    expect(store.publicReads).toBe(3);

    // Advance >= 30s -> expires and fetches again
    clock += 30_000;
    await request(app).get('/api/public/statistics');
    expect(store.publicReads).toBe(4);
  });
});
