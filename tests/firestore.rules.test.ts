import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Firestore Security Rules & Blueprint Integrity', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  const blueprint = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf-8')
  ) as { firestore: Record<string, unknown> };

  it('enforces rules_version = 2 and global deny-all catch-all rule', () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).toContain('match /{document=**}');
    expect(rulesText).toContain('allow read, write: if false;');
  });

  it('removes all hardcoded admin bootstrap emails and client-side admin privileges', () => {
    expect(rulesText).not.toContain('isBootstrappedAdminEmail');
    expect(rulesText).not.toContain('function isAdmin');
    expect(rulesText).not.toContain('@gmail.com');
  });

  it('covers every collection declared in firebase-blueprint.json with server-only write protections', () => {
    const expectedMatchers = [
      'match /users/{userId}',
      'match /admins/{userId}',
      'match /complaints/{complaintId}',
      'match /statusHistory/{historyId}',
      'match /adminNotes/{noteId}',
      'match /auditLogs/{logId}',
      'match /publicStats/{statId}',
    ];
    expect(Object.keys(blueprint.firestore).length).toBe(7);
    for (const matcher of expectedMatchers) {
      expect(rulesText).toContain(matcher);
    }
  });

  it('enforces email_verified == true, owner-only complaint reads, client-denied admins/auditLogs/adminNotes, and read-only publicStats', () => {
    expect(rulesText).toContain('request.auth.token.email_verified == true');
    expect(rulesText).toContain('function isValidId(id)');
    expect(rulesText).toContain('existing().citizenUid == request.auth.uid');
    expect(rulesText).toContain('resource.data.citizenUid == request.auth.uid');
    expect(rulesText).toContain("allow get: if isValidId(statId) && statId == 'aggregate';");
    expect(rulesText).toContain('allow list, create, update, delete: if false;');
  });
});
