import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;

function validComplaintData(citizenUid: string) {
  return {
    referenceId: 'CR-2026-EMU001',
    citizenUid,
    citizenEmail: `${citizenUid}@example.com`,
    citizenName: 'Test Citizen',
    title: 'Broken streetlight near market',
    description: 'Streetlights near the main bus shelter have been dark for 4 nights.',
    location: 'Market Road, Anna Nagar',
    area: 'Market Road',
    hasImage: false,
    userCategory: 'STREETLIGHTS',
    language: 'en',
    status: 'REPORTED',
    priority: 'HIGH',
    severity: 4,
    department: 'ELECTRICAL_LIGHTING',
    assignedDepartment: 'ELECTRICAL_LIGHTING',
    subcategory: 'OUTAGE',
    aiSource: 'GEMINI',
    aiModel: 'gemini-4-hydrogen',
    aiExplanation: 'Lighting outage impacts safety.',
    publicImpact: 'Dark street crossing.',
    recommendedAction: 'Dispatch electrical team.',
    confidenceEstimate: 0.9,
    safetyEscalated: false,
    safetyReasons: [],
    requiresHumanReview: false,
    citizenVisibleUpdate: 'Received.',
    potentialDuplicateIds: [],
    duplicateScore: 0,
    isDemo: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

describe.skipIf(!EMULATOR_HOST)('Firebase Firestore Emulator Security Rules Suite', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    testEnv = await initializeTestEnvironment({
      projectId: 'civicresolve-emulator-test',
      firestore: {
        host,
        port: Number(portStr),
        rules: fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  it('denies client admin escalation, denies direct complaint/audit/adminNote writes, and isolates citizen reads', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'complaints/c1'), validComplaintData('uid-a'));
      await setDoc(doc(db, 'complaints/c1/adminNotes/n1'), {
        complaintId: 'c1',
        authorUid: 'uid-admin',
        authorEmail: 'admin@city.gov',
        note: 'Internal review note.',
        internalOnly: true,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'auditLogs/log1'), {
        action: 'COMPLAINT_SUBMITTED',
        actorUid: 'uid-a',
        actorEmail: 'a@example.com',
        actorRole: 'CITIZEN',
        targetType: 'COMPLAINT',
        targetId: 'c1',
        details: 'Submitted.',
        createdAt: serverTimestamp(),
      });
    });

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'complaints/c1')));
    await assertFails(setDoc(doc(unauthDb, 'complaints/c2'), validComplaintData('anon')));

    const unverifiedDb = testEnv
      .authenticatedContext('uid-a', { email: 'a@example.com', email_verified: false })
      .firestore();
    await assertFails(getDoc(doc(unverifiedDb, 'complaints/c1')));

    const citizenADb = testEnv
      .authenticatedContext('uid-a', { email: 'a@example.com', email_verified: true })
      .firestore();
    const citizenBDb = testEnv
      .authenticatedContext('uid-b', { email: 'b@example.com', email_verified: true })
      .firestore();

    // Owner read succeeds; cross-citizen read & blanket list fail
    await assertSucceeds(getDoc(doc(citizenADb, 'complaints/c1')));
    await assertSucceeds(
      getDocs(query(collection(citizenADb, 'complaints'), where('citizenUid', '==', 'uid-a')))
    );
    await assertFails(getDoc(doc(citizenBDb, 'complaints/c1')));
    await assertFails(getDocs(collection(citizenBDb, 'complaints')));

    // Client writes to complaints, adminNotes, admins, and auditLogs strictly denied
    await assertFails(setDoc(doc(citizenADb, 'complaints/c2'), validComplaintData('uid-a')));
    await assertFails(updateDoc(doc(citizenADb, 'complaints/c1'), { status: 'RESOLVED' }));
    await assertFails(getDoc(doc(citizenADb, 'complaints/c1/adminNotes/n1')));
    await assertFails(
      setDoc(doc(citizenADb, 'admins/uid-a'), {
        uid: 'uid-a',
        email: 'a@example.com',
        grantedAt: serverTimestamp(),
      })
    );
    await assertFails(getDoc(doc(citizenADb, 'auditLogs/log1')));
    await assertFails(updateDoc(doc(citizenADb, 'auditLogs/log1'), { details: 'Tampered' }));
    await assertFails(deleteDoc(doc(citizenADb, 'auditLogs/log1')));
  });

  it('enforces publicStats as strictly read-only on /aggregate for all client SDK callers', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'publicStats/aggregate'), {
        totalReported: 5,
        reportedCount: 3,
        inProgressCount: 1,
        resolvedCount: 1,
        criticalCount: 1,
        resolutionRate: 20,
        avgResolutionHours: 4.5,
        byCategory: { STREETLIGHTS: 5 },
        byPriority: { CRITICAL: 1, HIGH: 4, MEDIUM: 0, LOW: 0 },
        byDepartment: { ELECTRICAL_LIGHTING: 5 },
        byArea: { 'Anna Nagar': 5 },
        monthlyTrends: [{ month: '2026-11', reported: 5, resolved: 1 }],
        updatedAt: serverTimestamp(),
      });
    });

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const citizenDb = testEnv
      .authenticatedContext('uid-a', { email: 'a@example.com', email_verified: true })
      .firestore();

    await assertSucceeds(getDoc(doc(unauthDb, 'publicStats/aggregate')));
    await assertFails(getDocs(collection(unauthDb, 'publicStats')));
    await assertFails(
      setDoc(doc(citizenDb, 'publicStats/aggregate'), { totalReported: 999 })
    );
    await assertFails(
      updateDoc(doc(citizenDb, 'publicStats/aggregate'), { totalReported: 999 })
    );
    await assertFails(deleteDoc(doc(citizenDb, 'publicStats/aggregate')));
  });
});
