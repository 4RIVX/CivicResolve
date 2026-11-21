import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import type { AppConfig } from '../src/server/config';
import type { TokenVerifier } from '../src/server/auth';
import {
  computeAggregateStats,
  createEmptyPublicStats,
  filterAndPaginateComplaints,
  type CivicDataStore,
  type ComplaintQueryOptions,
} from '../src/server/services/firestoreRestClient';
import type {
  AdminNoteRecord,
  AuditLogRecord,
  ComplaintRecord,
  PublicAggregateStats,
  StatusHistoryRecord,
} from '../src/shared/types';
import type { GeminiClientLike } from '../src/server/services/geminiService';

class InMemoryCivicStore implements CivicDataStore {
  public complaints: ComplaintRecord[] = [];
  public history = new Map<string, StatusHistoryRecord[]>();
  public notes = new Map<string, AdminNoteRecord[]>();
  public auditLogs: AuditLogRecord[] = [];
  public publicStats: PublicAggregateStats = createEmptyPublicStats();

  async createComplaintWithRecords(params: {
    idToken: string;
    complaint: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'>;
    initialHistory: Omit<StatusHistoryRecord, 'id' | 'complaintId' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<ComplaintRecord> {
    const id = `cmp_${this.complaints.length + 1}`;
    const now = new Date().toISOString();
    const record: ComplaintRecord = {
      ...params.complaint,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.complaints.push(record);
    this.history.set(id, [
      { ...params.initialHistory, id: `h_${id}_1`, complaintId: id, createdAt: now },
    ]);
    this.auditLogs.unshift({
      ...params.auditLog,
      id: `a_${this.auditLogs.length + 1}`,
      targetId: id,
      createdAt: now,
    });
    this.publicStats = computeAggregateStats(this.complaints);
    return record;
  }

  async listComplaints(_idToken: string, options: ComplaintQueryOptions) {
    return filterAndPaginateComplaints(this.complaints, options);
  }

  async listRecentComplaintsForDuplicateCheck(
    _idToken: string,
    citizenUid: string,
    isAdmin: boolean
  ) {
    return isAdmin
      ? this.complaints
      : this.complaints.filter((c) => c.citizenUid === citizenUid);
  }

  async getComplaintById(_idToken: string, complaintId: string) {
    return this.complaints.find((c) => c.id === complaintId) ?? null;
  }

  async getStatusHistory(_idToken: string, complaintId: string) {
    return this.history.get(complaintId) ?? [];
  }

  async getAdminNotes(_idToken: string, complaintId: string) {
    return this.notes.get(complaintId) ?? [];
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
    const idx = this.complaints.findIndex((c) => c.id === params.complaintId);
    const updated: ComplaintRecord = {
      ...params.existing,
      ...params.updates,
      updatedAt: now,
      ...(params.markResolved ? { resolvedAt: now } : {}),
    };
    this.complaints[idx] = updated;
    const hist = this.history.get(params.complaintId) ?? [];
    hist.push({
      ...params.historyEntry,
      id: `h_${params.complaintId}_${hist.length + 1}`,
      complaintId: params.complaintId,
      createdAt: now,
    });
    this.history.set(params.complaintId, hist);
    this.auditLogs.unshift({
      ...params.auditLog,
      id: `a_${this.auditLogs.length + 1}`,
      createdAt: now,
    });
    this.publicStats = computeAggregateStats(this.complaints);
    return updated;
  }

  async addAdminNote(params: {
    idToken: string;
    complaintId: string;
    note: Omit<AdminNoteRecord, 'id' | 'createdAt'>;
    auditLog: Omit<AuditLogRecord, 'id' | 'createdAt'>;
  }): Promise<AdminNoteRecord> {
    const now = new Date().toISOString();
    const saved: AdminNoteRecord = {
      ...params.note,
      id: `n_${Date.now()}`,
      createdAt: now,
    };
    const list = this.notes.get(params.complaintId) ?? [];
    list.unshift(saved);
    this.notes.set(params.complaintId, list);
    this.auditLogs.unshift({
      ...params.auditLog,
      id: `a_${this.auditLogs.length + 1}`,
      createdAt: now,
    });
    return saved;
  }

  async listAuditLogs() {
    return this.auditLogs;
  }

  async getPublicAggregateStats() {
    return this.publicStats;
  }

  async reconcilePublicStats(_idToken: string, stats: PublicAggregateStats) {
    this.publicStats = stats;
  }
}

const TEST_CONFIG: AppConfig = {
  port: 3000,
  nodeEnv: 'test',
  geminiApiKey: 'test-key-not-real',
  geminiModel: 'gemini-4-hydrogen',
  adminEmails: new Set(['admin@civic.gov']),
  firebaseProjectId: 'test-project',
  firestoreDatabaseId: '(default)',
};

const verifyTestToken: TokenVerifier = async (token: string) => {
  if (token === 'token-citizen-a') {
    return { uid: 'uid-a', email: 'citizen.a@example.com', email_verified: true, name: 'Citizen A' };
  }
  if (token === 'token-citizen-b') {
    return { uid: 'uid-b', email: 'citizen.b@example.com', email_verified: true, name: 'Citizen B' };
  }
  if (token === 'token-admin') {
    return { uid: 'uid-admin', email: 'admin@civic.gov', email_verified: true, name: 'Civic Admin' };
  }
  if (token === 'token-unverified') {
    return { uid: 'uid-unv', email: 'admin@civic.gov', email_verified: false };
  }
  throw new Error('Invalid token');
};

const geminiMock: GeminiClientLike = {
  async generateAnalysis() {
    return {
      category: 'STREETLIGHTS',
      subcategory: 'EXPOSED_WIRE',
      priority: 'MEDIUM',
      severity: 2,
      department: 'ELECTRICAL_LIGHTING',
      public_impact: 'Pedestrian safety hazard near bus stop.',
      explanation: 'Damaged pole with exposed wiring reported.',
      recommended_action: 'Isolate power and repair wiring immediately.',
      confidence_estimate: 0.91,
      requires_human_review: false,
    };
  },
};

describe('CivicResolve Express API Integration Tests', () => {
  it('enforces server-side auth, admin allowlist, ownership isolation, all admin routes, and public zero-PII', async () => {
    const store = new InMemoryCivicStore();
    const app = createApp({
      config: TEST_CONFIG,
      verifyToken: verifyTestToken,
      dataStore: store,
      geminiClient: geminiMock,
      disableRateLimit: true,
    });

    // 1. Health & AI preview endpoints
    const healthRes = await request(app).get('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');

    expect((await request(app).post('/api/ai/analyze').send({})).status).toBe(401);
    const badPreview = await request(app)
      .post('/api/ai/analyze')
      .set('Authorization', 'Bearer token-citizen-a')
      .send({ title: 'x' });
    expect(badPreview.status).toBe(400);

    const okPreview = await request(app)
      .post('/api/ai/analyze')
      .set('Authorization', 'Bearer token-citizen-a')
      .send({
        title: 'Broken streetlight near bus stop',
        description: 'Three poles have been dark along the sidewalk for four nights.',
        location: 'School Road, Velachery',
        userCategory: 'STREETLIGHTS',
        language: 'en',
      });
    expect(okPreview.status).toBe(200);
    expect(okPreview.body.analysis.source).toBe('GEMINI');

    // 2. Unauthenticated, unverified, and invalid token checks
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid_unknown_token')).status
    ).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-unverified')).status
    ).toBe(403);

    // 3. Cache-Control private header & server-derived roles
    const meCitizen = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-citizen-a');
    expect(meCitizen.status).toBe(200);
    expect(meCitizen.headers['cache-control']).toContain('no-store');
    expect(meCitizen.body.user.role).toBe('CITIZEN');
    expect(meCitizen.body.user.isAdmin).toBe(false);

    const meAdmin = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-admin');
    expect(meAdmin.status).toBe(200);
    expect(meAdmin.body.user.role).toBe('ADMIN');
    expect(meAdmin.body.user.isAdmin).toBe(true);

    // 4. Reject invalid complaint & spoofed image upload
    const badSubmit = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-a')
      .send({ title: 'Bad', description: 'short', location: 'A', userCategory: 'OTHER' });
    expect(badSubmit.status).toBe(400);

    const badImgSubmit = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-a')
      .send({
        title: 'Valid length title here',
        description: 'Valid description with plenty of details for submission.',
        location: 'Main Road, Sector 4',
        userCategory: 'ROAD_INFRASTRUCTURE',
        imageDataUrl: `data:image/jpeg;base64,${Buffer.from('<svg></svg>').toString('base64')}`,
      });
    expect(badImgSubmit.status).toBe(400);

    // 5. Submit valid complaint (Gemini + deterministic live-wire escalation)
    const submitRes = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-a')
      .send({
        title: 'Live wire hanging from broken streetlight',
        description: 'There is an exposed live wire sparking near the school bus stop.',
        location: 'School Road, Velachery',
        userCategory: 'STREETLIGHTS',
        language: 'en',
      });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.complaint.priority).toBe('CRITICAL');
    expect(submitRes.body.analysis.safetyEscalated).toBe(true);
    const complaintId = submitRes.body.complaint.id;

    // 6. Citizen listing, history, invalid IDs, 404, and cross-citizen isolation
    const citizenList = await request(app)
      .get('/api/complaints?page=1&pageSize=5&search=Velachery')
      .set('Authorization', 'Bearer token-citizen-a');
    expect(citizenList.status).toBe(200);
    expect(citizenList.body.total).toBe(1);

    expect(
      (await request(app).get('/api/complaints/bad$id').set('Authorization', 'Bearer token-citizen-a')).status
    ).toBe(400);
    expect(
      (await request(app).get('/api/complaints/missing_id').set('Authorization', 'Bearer token-citizen-a')).status
    ).toBe(404);
    expect(
      (await request(app).get(`/api/complaints/${complaintId}`).set('Authorization', 'Bearer token-citizen-b')).status
    ).toBe(403);
    expect(
      (await request(app).get(`/api/complaints/${complaintId}/history`).set('Authorization', 'Bearer token-citizen-b')).status
    ).toBe(403);
    expect(
      (await request(app).get(`/api/complaints/${complaintId}/history`).set('Authorization', 'Bearer token-citizen-a')).status
    ).toBe(200);

    // 7. Citizen cannot access ANY admin endpoint
    for (const check of [
      request(app).get('/api/admin/dashboard'),
      request(app).get('/api/admin/complaints'),
      request(app).get(`/api/admin/complaints/${complaintId}`),
      request(app).patch(`/api/admin/complaints/${complaintId}`).send({ status: 'RESOLVED' }),
      request(app).post(`/api/admin/complaints/${complaintId}/notes`).send({ note: 'nope' }),
      request(app).get('/api/admin/audit-logs'),
      request(app).post('/api/admin/seed-demo').send({}),
    ]) {
      expect((await check.set('Authorization', 'Bearer token-citizen-a')).status).toBe(403);
    }

    // 8. Admin dashboard, queue, detail, update, internal note, audit logs, and demo seeder
    expect((await request(app).get('/api/admin/dashboard').set('Authorization', 'Bearer token-admin')).status).toBe(200);
    const adminQueue = await request(app)
      .get('/api/admin/complaints?sortBy=priority&page=1&pageSize=10')
      .set('Authorization', 'Bearer token-admin');
    expect(adminQueue.status).toBe(200);
    expect(adminQueue.body.total).toBe(1);

    const adminDetail = await request(app)
      .get(`/api/admin/complaints/${complaintId}`)
      .set('Authorization', 'Bearer token-admin');
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.complaint.id).toBe(complaintId);

    const badAdminPatch = await request(app)
      .patch(`/api/admin/complaints/${complaintId}`)
      .set('Authorization', 'Bearer token-admin')
      .send({ status: 'INVALID_STATUS' });
    expect(badAdminPatch.status).toBe(400);

    const adminUpdate = await request(app)
      .patch(`/api/admin/complaints/${complaintId}`)
      .set('Authorization', 'Bearer token-admin')
      .send({
        status: 'RESOLVED',
        citizenVisibleUpdate: 'Emergency electrical team replaced cable and restored pole.',
      });
    expect(adminUpdate.status).toBe(200);
    expect(adminUpdate.body.complaint.status).toBe('RESOLVED');

    const noteRes = await request(app)
      .post(`/api/admin/complaints/${complaintId}/notes`)
      .set('Authorization', 'Bearer token-admin')
      .send({ note: 'Verified earth fault cleared with multimeter.' });
    expect(noteRes.status).toBe(201);

    const auditRes = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', 'Bearer token-admin');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.logs.length).toBeGreaterThanOrEqual(3);

    const seedRes = await request(app)
      .post('/api/admin/seed-demo')
      .set('Authorization', 'Bearer token-admin')
      .send({});
    expect(seedRes.status).toBe(201);
    expect(seedRes.body.seededCount).toBe(3);
    expect(seedRes.body.records.every((r: ComplaintRecord) => r.isDemo === true)).toBe(true);

    // 9. Public transparency endpoints expose zero PII & short public caching
    const pubRes = await request(app).get('/api/public/statistics');
    expect(pubRes.status).toBe(200);
    expect(pubRes.headers['cache-control']).toContain('public');
    expect(pubRes.body.statistics.totalReported).toBe(4);
    expect(JSON.stringify(pubRes.body)).not.toContain('citizen.a@example.com');

    const trendsRes = await request(app).get('/api/public/trends');
    expect(trendsRes.status).toBe(200);
    expect(Array.isArray(trendsRes.body.trends)).toBe(true);
  });

  it('fails closed for admin access when admin allowlist is empty and handles upstream 500s safely', async () => {
    const emptyAdminConfig: AppConfig = {
      ...TEST_CONFIG,
      adminEmails: new Set(),
    };
    const brokenStore = new InMemoryCivicStore();
    brokenStore.getPublicAggregateStats = async () => {
      throw new Error('Sensitive database connection string secret');
    };

    const app = createApp({
      config: emptyAdminConfig,
      verifyToken: verifyTestToken,
      dataStore: brokenStore,
      geminiClient: {
        async generateAnalysis() {
          throw new Error('Upstream Gemini 503 unavailable');
        },
      },
      disableRateLimit: true,
    });

    // Empty allowlist -> nobody is admin
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-admin');
    expect(me.status).toBe(200);
    expect(me.body.user.isAdmin).toBe(false);
    expect(me.body.user.role).toBe('CITIZEN');

    expect(
      (await request(app).get('/api/admin/dashboard').set('Authorization', 'Bearer token-admin')).status
    ).toBe(403);

    // Safe error handler never leaks internal exception text
    const errRes = await request(app).get('/api/public/statistics');
    expect(errRes.status).toBe(500);
    expect(errRes.body.error).not.toContain('Sensitive database connection string secret');

    // Gemini failure triggers honest rule-based fallback
    const submitRes = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-a')
      .send({
        title: 'Water pipe burst on Market Lane',
        description: 'Clean drinking water has been leaking onto Market Lane for 6 hours.',
        location: 'Market Lane, Mylapore',
        userCategory: 'WATER_SUPPLY',
        language: 'en',
      });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.analysis.source).toBe('FALLBACK');
    expect(submitRes.body.analysis.requiresHumanReview).toBe(true);
  });
});
