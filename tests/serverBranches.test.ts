import { afterEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  buildAuthenticatedUser,
  createAuthMiddleware,
  createFirebaseTokenVerifier,
  extractBearerToken,
  isAdminEmail,
} from '../src/server/auth';
import { getConfig, parseAdminAllowlist, parseAllowedOrigins } from '../src/server/config';
import {
  applyComplaintCreateToStats,
  applyComplaintUpdateToStats,
  sanitizePublicStats,
} from '../src/server/services/publicStatsMath';
import { createEmptyPublicStats } from '../src/server/services/firestoreRestClient';
import type { AppConfig } from '../src/server/config';
import type { AuthenticatedRequest } from '../src/server/auth';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('server configuration and authentication edge behavior', () => {
  it('normalizes and filters administrator emails and allowed origins', () => {
    expect(parseAdminAllowlist('ADMIN@CIVIC.GOV, not-an-email, ,operator@civic.gov', 'admin@civic.gov')).toEqual(
      new Set(['admin@civic.gov', 'operator@civic.gov'])
    );
    expect(
      parseAllowedOrigins(
        'https://civic.example/path',
        'http://localhost:4400,ftp://files.example,not a URL',
        4400
      )
    ).toEqual(
      new Set([
        'http://localhost:4400',
        'http://127.0.0.1:4400',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://civic.example',
        'http://localhost:4400',
      ])
    );
  });

  it('uses safe defaults for invalid environment values and builds citizen identity fallbacks', () => {
    for (const key of [
      'PORT',
      'NODE_ENV',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'ADMIN_EMAILS',
      'ADMIN_EMAIL',
      'FIREBASE_PROJECT_ID',
      'FIRESTORE_DATABASE_ID',
      'APP_URL',
      'CORS_ALLOWED_ORIGINS',
    ]) {
      delete process.env[key];
    }
    process.env.PORT = '-1';

    const config = getConfig();
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.geminiApiKey).toBe('');
    expect(config.geminiModel).toBe('gemini-4-hydrogen');
    expect(typeof config.firebaseProjectId).toBe('string');
    expect(config.firestoreDatabaseId).toBeTruthy();

    const user = buildAuthenticatedUser({ uid: 'uid-citizen' }, new Set());
    expect(user.email).toBe('uid-citizen@citizen.local');
    expect(user.name).toBe('Citizen');
    expect(user.role).toBe('CITIZEN');
    expect(isAdminEmail(undefined, true, new Set(['admin@civic.gov']))).toBe(false);
    expect(isAdminEmail(' admin@civic.gov ', true, new Set(['admin@civic.gov']))).toBe(true);
  });

  it('rejects unusable bearer tokens and handles each admin middleware outcome', async () => {
    expect(extractBearerToken({ headers: {} } as Request)).toBeNull();
    expect(extractBearerToken({ headers: { authorization: 'Bearer short' } } as Request)).toBeNull();
    expect(extractBearerToken({ headers: { authorization: 'Bearer' } } as Request)).toBeNull();
    expect(extractBearerToken({ headers: { authorization: 'bearer valid_token_string' } } as Request)).toBeNull();
    expect(extractBearerToken({ headers: { authorization: 'Bearer valid_token_string extra' } } as Request)).toBe(
      'valid_token_string'
    );
    await expect(createFirebaseTokenVerifier('')('token-long-enough')).rejects.toThrow(
      'Firebase project ID is not configured'
    );

    const config: AppConfig = {
      port: 3000,
      nodeEnv: 'test',
      geminiApiKey: '',
      geminiModel: 'test-model',
      adminEmails: new Set(['admin@civic.gov']),
      firebaseProjectId: 'test-project',
      firestoreDatabaseId: '(default)',
    };
    const { requireAdmin } = createAuthMiddleware(config, async () => ({ uid: 'unused' }));
    const outcomes: Array<{ status?: number; body?: unknown }> = [];
    const response = {
      status(code: number) {
        outcomes.push({ status: code });
        return this;
      },
      json(body: unknown) {
        outcomes[outcomes.length - 1].body = body;
        return this;
      },
    } as unknown as Response;
    const next = (() => {
      outcomes.push({});
    }) as NextFunction;

    requireAdmin({} as AuthenticatedRequest, response, next);
    requireAdmin({ user: { uid: 'uid-citizen', email: 'c@example.com', name: 'Citizen', emailVerified: true, role: 'CITIZEN', isAdmin: false } } as AuthenticatedRequest, response, next);
    requireAdmin({ user: { uid: 'uid-admin', email: 'admin@civic.gov', name: 'Admin', emailVerified: true, role: 'ADMIN', isAdmin: true } } as AuthenticatedRequest, response, next);
    expect(outcomes.map((outcome) => outcome.status ?? 'next')).toEqual([401, 403, 'next']);
  });
});

describe('public statistics sanitization and transitions', () => {
  it('sanitizes malformed aggregate values and advances an existing category/month', () => {
    const cleaned = sanitizePublicStats({
      totalReported: -2,
      reportedCount: Number.NaN,
      inProgressCount: 2,
      resolvedCount: 1,
      criticalCount: Number.POSITIVE_INFINITY,
      resolutionRate: 120,
      avgResolutionHours: -1,
      byCategory: { ROAD_INFRASTRUCTURE: 3 },
      byPriority: [],
      byDepartment: { ROADS_PUBLIC_WORKS: 2, bad: Number.NaN },
      byArea: 'not-an-object',
      monthlyTrends: [
        null,
        { month: 'broken' },
        { month: '2026-11', reported: 2, resolved: 1 },
      ] as never,
      updatedAt: '',
      privateEmail: 'not-allowed@example.com',
    } as never);

    expect(cleaned.totalReported).toBe(0);
    expect(cleaned.reportedCount).toBe(0);
    expect(cleaned.inProgressCount).toBe(2);
    expect(cleaned.criticalCount).toBe(0);
    expect(cleaned.resolutionRate).toBe(100);
    expect(cleaned.avgResolutionHours).toBe(0);
    expect(cleaned.byCategory.ROAD_INFRASTRUCTURE).toBe(3);
    expect(cleaned.byCategory.STREETLIGHTS).toBe(0);
    expect(cleaned.byPriority.CRITICAL).toBe(0);
    expect(cleaned.byDepartment).toEqual({});
    expect(cleaned.byArea).toEqual({});
    expect(cleaned.monthlyTrends).toEqual([{ month: '2026-11', reported: 2, resolved: 1 }]);
    expect(cleaned.updatedAt).not.toBe('');
    expect('privateEmail' in cleaned).toBe(false);

    const updated = applyComplaintCreateToStats(
      { ...createEmptyPublicStats(), ...cleaned },
      {
        userCategory: 'ROAD_INFRASTRUCTURE',
        priority: 'LOW',
        assignedDepartment: 'ROADS_PUBLIC_WORKS',
        area: 'Anna Nagar',
      },
      '2026-11-21T12:00:00.000Z'
    );
    expect(updated.byCategory.ROAD_INFRASTRUCTURE).toBe(4);
    expect(updated.byPriority.LOW).toBe(1);
    expect(updated.monthlyTrends).toContainEqual({ month: '2026-11', reported: 3, resolved: 1 });
    expect(updated.criticalCount).toBe(0);
  });

  it('moves complaint counts through every status and priority direction without underflow', () => {
    const current = {
      ...createEmptyPublicStats(),
      totalReported: 4,
      reportedCount: 1,
      inProgressCount: 2,
      resolvedCount: 1,
      criticalCount: 1,
      byPriority: { CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 0 },
      byDepartment: { ROADS_PUBLIC_WORKS: 2, WATER_RESOURCES: 1 },
      monthlyTrends: [{ month: '2026-10', reported: 2, resolved: 0 }],
    };
    const fromInProgressToResolved = applyComplaintUpdateToStats(
      current,
      {
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assignedDepartment: 'ROADS_PUBLIC_WORKS',
        createdAt: '2026-10-12T10:00:00.000Z',
      },
      {
        status: 'RESOLVED',
        priority: 'CRITICAL',
        assignedDepartment: 'WATER_RESOURCES',
      },
      '2026-11-21T12:00:00.000Z'
    );
    expect(fromInProgressToResolved.inProgressCount).toBe(1);
    expect(fromInProgressToResolved.resolvedCount).toBe(2);
    expect(fromInProgressToResolved.criticalCount).toBe(2);
    expect(fromInProgressToResolved.byDepartment).toEqual({
      ROADS_PUBLIC_WORKS: 1,
      WATER_RESOURCES: 2,
    });
    expect(fromInProgressToResolved.monthlyTrends).toContainEqual({
      month: '2026-10',
      reported: 2,
      resolved: 1,
    });

    const toReported = applyComplaintUpdateToStats(
      fromInProgressToResolved,
      {
        status: 'RESOLVED',
        priority: 'CRITICAL',
        assignedDepartment: 'WATER_RESOURCES',
        createdAt: '',
      },
      {
        status: 'REPORTED',
        priority: 'MEDIUM',
        assignedDepartment: 'WATER_RESOURCES',
      },
      '2026-11-21T13:00:00.000Z'
    );
    expect(toReported.resolvedCount).toBe(1);
    expect(toReported.reportedCount).toBe(2);
    expect(toReported.criticalCount).toBe(1);

    const resolvedWithoutCreatedAt = applyComplaintUpdateToStats(
      toReported,
      {
        status: 'REPORTED',
        priority: 'LOW',
        assignedDepartment: 'SANITATION_WASTE',
        createdAt: '',
      },
      {
        status: 'RESOLVED',
        priority: 'LOW',
        assignedDepartment: 'SANITATION_WASTE',
      },
      '2026-11-21T14:00:00.000Z'
    );
    expect(resolvedWithoutCreatedAt.monthlyTrends).toContainEqual({
      month: '2026-11',
      reported: 1,
      resolved: 1,
    });

    const unchanged = applyComplaintUpdateToStats(
      createEmptyPublicStats(),
      {
        status: 'REPORTED',
        priority: 'LOW',
        assignedDepartment: 'ROADS_PUBLIC_WORKS',
        createdAt: 'invalid',
      },
      {
        status: 'REPORTED',
        priority: 'LOW',
        assignedDepartment: 'ROADS_PUBLIC_WORKS',
      },
      '2026-11-21T14:00:00.000Z'
    );
    expect(unchanged.totalReported).toBe(0);
    expect(unchanged.resolutionRate).toBe(0);
    expect(unchanged.monthlyTrends).toEqual([]);
  });
});
