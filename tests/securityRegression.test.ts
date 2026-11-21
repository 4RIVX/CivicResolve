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

class RegStore implements CivicDataStore {
  public complaints: ComplaintRecord[] = [];
  public publicStats: PublicAggregateStats = createEmptyPublicStats();

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
  async listRecentComplaintsForDuplicateCheck(
    _idToken: string,
    citizenUid: string,
    isAdmin: boolean
  ) {
    return isAdmin
      ? this.complaints
      : this.complaints.filter((c) => c.citizenUid === citizenUid);
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
  async updateComplaintByAdmin(): Promise<ComplaintRecord> {
    throw new Error('Unused');
  }
  async addAdminNote(): Promise<AdminNoteRecord> {
    throw new Error('Unused');
  }
  async listAuditLogs() {
    return [];
  }
  async getPublicAggregateStats() {
    return this.publicStats;
  }
  async reconcilePublicStats() {}
}

describe('Phase 7 Security Regression: Malformed Identity Claims & Role-Spoof Immunity', () => {
  const verifyToken: TokenVerifier = async (token: string) => {
    if (token === 'tok-missing-uid') {
      return { uid: '', email: 'u@example.com', email_verified: true };
    }
    if (token === 'tok-invalid-uid') {
      return { uid: '../etc/passwd', email: 'u@example.com', email_verified: true };
    }
    if (token === 'tok-oversized-uid') {
      return { uid: 'u'.repeat(129), email: 'u@example.com', email_verified: true };
    }
    if (token === 'tok-missing-email') {
      return { uid: 'uid-valid-1', email: '', email_verified: true };
    }
    if (token === 'tok-invalid-email') {
      return { uid: 'uid-valid-2', email: 'not-an-email', email_verified: true };
    }
    if (token === 'tok-citizen-spoof') {
      return {
        uid: 'uid-citizen-x',
        email: 'citizen@example.com',
        email_verified: true,
        name: 'Citizen Spoofer',
      };
    }
    throw new Error('Invalid token');
  };

  const config: AppConfig = {
    port: 3000,
    nodeEnv: 'test',
    geminiApiKey: '',
    geminiModel: 'gemini-4-hydrogen',
    adminEmails: new Set(['admin@civic.gov']),
    firebaseProjectId: 'test-project',
    firestoreDatabaseId: '(default)',
  };

  it('rejects missing, malformed, and oversized uid/email claims at requireAuth', async () => {
    const app = createApp({
      config,
      verifyToken,
      dataStore: new RegStore(),
      disableRateLimit: true,
    });

    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-missing-uid')).status
    ).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-invalid-uid')).status
    ).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-oversized-uid')).status
    ).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-missing-email')).status
    ).toBe(403);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-invalid-email')).status
    ).toBe(403);
  });

  it('ignores client-supplied role headers and rejects path-traversal complaint IDs', async () => {
    const app = createApp({
      config,
      verifyToken,
      dataStore: new RegStore(),
      disableRateLimit: true,
    });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tok-citizen-spoof')
      .set('X-Role', 'ADMIN')
      .set('X-Is-Admin', 'true');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('CITIZEN');
    expect(me.body.user.isAdmin).toBe(false);

    const adminAttempt = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', 'Bearer tok-citizen-spoof')
      .set('X-Role', 'ADMIN');
    expect(adminAttempt.status).toBe(403);

    expect(
      (
        await request(app)
          .get('/api/complaints/..%2Fadmins')
          .set('Authorization', 'Bearer tok-citizen-spoof')
      ).status
    ).toBe(400);
  });
});
