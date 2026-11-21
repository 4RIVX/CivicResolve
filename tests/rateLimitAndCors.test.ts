import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { parseAllowedOrigins, type AppConfig } from '../src/server/config';
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

class StubStore implements CivicDataStore {
  public complaints: ComplaintRecord[] = [];
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
    this.publicStats = computeAggregateStats(this.complaints);
    return record;
  }

  async listComplaints(_idToken: string, options: ComplaintQueryOptions) {
    return filterAndPaginateComplaints(this.complaints, options);
  }

  async listRecentComplaintsForDuplicateCheck() {
    return this.complaints;
  }

  async getComplaintById(_idToken: string, complaintId: string) {
    return this.complaints.find((c) => c.id === complaintId) ?? null;
  }

  async getStatusHistory(): Promise<StatusHistoryRecord[]> {
    return [];
  }

  async getAdminNotes(): Promise<AdminNoteRecord[]> {
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
    return updated;
  }

  async addAdminNote(): Promise<AdminNoteRecord> {
    throw new Error('Not needed in stub');
  }

  async listAuditLogs() {
    return [];
  }

  async getPublicAggregateStats() {
    return this.publicStats;
  }

  async reconcilePublicStats() {}
}

const PROD_STYLE_CONFIG: AppConfig = {
  port: 3000,
  nodeEnv: 'production',
  geminiApiKey: '',
  geminiModel: 'gemini-4-hydrogen',
  adminEmails: new Set(['admin@civic.gov']),
  firebaseProjectId: 'test-project',
  firestoreDatabaseId: '(default)',
  allowedOrigins: parseAllowedOrigins('https://civicresolve.run.app', undefined, 3000),
};

const verifyToken: TokenVerifier = async (token: string) => {
  if (token === 'token-citizen-1') {
    return { uid: 'uid-1', email: 'c1@example.com', email_verified: true, name: 'Citizen 1' };
  }
  if (token === 'token-citizen-2') {
    return { uid: 'uid-2', email: 'c2@example.com', email_verified: true, name: 'Citizen 2' };
  }
  if (token === 'token-admin-1') {
    return { uid: 'uid-admin', email: 'admin@civic.gov', email_verified: true, name: 'Admin 1' };
  }
  throw new Error('Unauthorized');
};

const stubGemini: GeminiClientLike = {
  async generateAnalysis() {
    return {
      category: 'ROAD_INFRASTRUCTURE',
      subcategory: 'POTHOLE',
      priority: 'MEDIUM',
      severity: 3,
      department: 'ROADS_PUBLIC_WORKS',
      public_impact: 'Lane obstruction near bus shelter.',
      explanation: 'Verified complaint description.',
      recommended_action: 'Dispatch crew for asphalt repair.',
      confidence_estimate: 0.85,
      requires_human_review: false,
    };
  },
};

function makeApp(store = new StubStore()) {
  return createApp({
    config: PROD_STYLE_CONFIG,
    verifyToken,
    dataStore: store,
    geminiClient: stubGemini,
  });
}

describe('Phase 3 Security: Rate Limiting, Strict CORS, Helmet CSP, and Safe Errors', () => {
  it('enforces per-UID complaint submission rate limit (10/hour) while isolating different UIDs', async () => {
    const app = makeApp();
    const validPayload = {
      title: 'Pothole along bus corridor near station',
      description: 'Large crater forming at main bus stop entrance causing delays.',
      location: 'Anna Salai, Chennai',
      userCategory: 'ROAD_INFRASTRUCTURE',
      language: 'en',
    };

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/complaints')
        .set('Authorization', 'Bearer token-citizen-1')
        .send(validPayload);
      expect(res.status).toBe(201);
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe(String(9 - i));
    }

    const blocked = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-1')
      .send(validPayload);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain('rate limit');

    // A second verified citizen is NOT blocked by token-citizen-1's quota
    const otherCitizen = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-2')
      .send(validPayload);
    expect(otherCitizen.status).toBe(201);
  });

  it('enforces AI analyze rate limit (20/hour/uid) and admin mutation limit (60/min/uid)', async () => {
    const store = new StubStore();
    const app = makeApp(store);

    const previewPayload = {
      title: 'Streetlight outage near junction',
      description: 'Four consecutive streetlamps dark along school crosswalk.',
      location: 'Adyar, Chennai',
      userCategory: 'STREETLIGHTS',
      language: 'en',
    };

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/ai/analyze')
        .set('Authorization', 'Bearer token-citizen-1')
        .send(previewPayload);
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('20');
    }

    const blockedAi = await request(app)
      .post('/api/ai/analyze')
      .set('Authorization', 'Bearer token-citizen-1')
      .send(previewPayload);
    expect(blockedAi.status).toBe(429);

    // Admin creates 1 record via token-citizen-1, then exercises admin PATCH limit (60/min)
    const created = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-1')
      .send(previewPayload);
    const id = created.body.complaint.id;

    for (let i = 0; i < 60; i++) {
      const patchRes = await request(app)
        .patch(`/api/admin/complaints/${id}`)
        .set('Authorization', 'Bearer token-admin-1')
        .send({ status: 'IN_PROGRESS' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.headers['ratelimit-limit']).toBe('60');
    }

    const blockedAdmin = await request(app)
      .patch(`/api/admin/complaints/${id}`)
      .set('Authorization', 'Bearer token-admin-1')
      .send({ status: 'RESOLVED' });
    expect(blockedAdmin.status).toBe(429);
  });

  it('enforces public read limit (120/min/IP) and ensures normal demo workflow never hits 429', async () => {
    const app = makeApp();

    // Normal workflow: health + public stats + auth + ai preview + submit + list + admin queue + patch
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/public/statistics')).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-citizen-1')).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/ai/analyze')
          .set('Authorization', 'Bearer token-citizen-1')
          .send({
            title: 'Broken water pipe on 3rd Street',
            description: 'Clean water leaking across pedestrian path since 6am.',
            location: 'Mylapore, Chennai',
            userCategory: 'WATER_SUPPLY',
            language: 'en',
          })
      ).status
    ).toBe(200);

    const submit = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer token-citizen-1')
      .send({
        title: 'Broken water pipe on 3rd Street',
        description: 'Clean water leaking across pedestrian path since 6am.',
        location: 'Mylapore, Chennai',
        userCategory: 'WATER_SUPPLY',
        language: 'en',
      });
    expect(submit.status).toBe(201);
    expect((await request(app).get('/api/complaints').set('Authorization', 'Bearer token-citizen-1')).status).toBe(200);
    expect((await request(app).get('/api/admin/dashboard').set('Authorization', 'Bearer token-admin-1')).status).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/admin/complaints/${submit.body.complaint.id}`)
          .set('Authorization', 'Bearer token-admin-1')
          .send({ status: 'IN_PROGRESS' })
      ).status
    ).toBe(200);

    // Exhaust remaining public reads from the 120/min/IP budget (already used 2 public reads above)
    for (let i = 0; i < 118; i++) {
      const res = await request(app).get('/api/public/statistics');
      expect(res.status).toBe(200);
    }
    const blockedPublic = await request(app).get('/api/public/statistics');
    expect(blockedPublic.status).toBe(429);
  });

  it('enforces strict CORS allowlist (never wildcard), Helmet CSP headers, and hides stack traces', async () => {
    const store = new StubStore();
    store.getPublicAggregateStats = async () => {
      throw new Error('SECRET_INTERNAL_STACK_LEAK');
    };
    const app = makeApp(store);

    const deniedCors = await request(app)
      .get('/api/public/statistics')
      .set('Origin', 'https://evil-attacker.example');
    expect(deniedCors.status).toBe(403);
    expect(deniedCors.headers['access-control-allow-origin']).toBeUndefined();

    const allowedPreflight = await request(app)
      .options('/api/complaints')
      .set('Origin', 'https://civicresolve.run.app');
    expect(allowedPreflight.status).toBe(204);
    expect(allowedPreflight.headers['access-control-allow-origin']).toBe('https://civicresolve.run.app');
    expect(allowedPreflight.headers['access-control-allow-origin']).not.toBe('*');

    const headersCheck = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:3000');
    expect(headersCheck.status).toBe(200);
    expect(headersCheck.headers['x-powered-by']).toBeUndefined();
    expect(headersCheck.headers['content-security-policy']).toContain("default-src 'self'");
    expect(headersCheck.headers['x-content-type-options']).toBe('nosniff');

    const malformedJson = await request(app)
      .post('/api/complaints')
      .set('Authorization', 'Bearer citizen-1')
      .set('Content-Type', 'application/json')
      .send('{ invalid-json');
    expect(malformedJson.status).toBe(400);
    expect(JSON.stringify(malformedJson.body)).not.toContain('SyntaxError');

    const safe500 = await request(app).get('/api/public/statistics');
    expect(safe500.status).toBe(500);
    expect(safe500.body.error).toBe('An unexpected server error occurred while processing the request.');
    expect(JSON.stringify(safe500.body)).not.toContain('SECRET_INTERNAL_STACK_LEAK');
  });
});
