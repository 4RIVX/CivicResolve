# CivicResolve Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Ownership Invariant**: A complaint's `citizenUid` must match `request.auth.uid` on creation and can never be modified after creation (`incoming().citizenUid == existing().citizenUid`).
2. **Verified Email Invariant**: All standard write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Admin Escalation Prevention**: Citizens cannot write to `/admins/{userId}`, cannot modify complaint `status`, `priority`, `assignedDepartment`, `citizenVisibleUpdate`, or read `/complaints/{id}/adminNotes` or `/auditLogs`.
4. **Terminal State Protection**: Once a complaint reaches `RESOLVED`, non-admin updates are strictly forbidden.
5. **PII Isolation Invariant**: `/users/{userId}` and `/complaints/{complaintId}` contain PII (`email`, `citizenEmail`, `location`, `imageDataUrl`) and are strictly restricted to owner or verified admin. Public transparency reads only `/publicStats/aggregate`, which stores strictly aggregated counters.
6. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation; `createdAt` is immutable on updates and `updatedAt == request.time`.
7. **Volumetric Bounds**: Every string field has explicit `.size()` bounds; `imageDataUrl` is capped at 260,000 characters; arrays (`safetyReasons`, `potentialDuplicateIds`) are capped at `<= 10` elements; document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars).

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Complaint Create**: Unauthenticated client attempts `POST /complaints/c1` -> Denied (`isSignedIn()`).
2. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create a complaint -> Denied (`isVerifiedUser()`).
3. **Identity Spoofing on Create**: User A (`uid: "user-a"`) attempts to create a complaint with `citizenUid: "user-b"` -> Denied (`incoming().citizenUid == request.auth.uid`).
4. **Shadow Field Injection ("Ghost Field")**: User A creates a complaint with an extra undeclared field `isApproved: true` or `adminOverride: true` -> Denied (`keys().hasOnly(...)`).
5. **Admin Privilege Self-Escalation**: User A attempts to write `/admins/user-a` -> Denied (`isAdmin()`).
6. **Cross-Citizen Private Complaint Read**: User B attempts `get` or `list` on User A's complaint -> Denied (`resource.data.citizenUid == request.auth.uid || isAdmin()`).
7. **Blanket List Scraping**: User B runs `list` on `/complaints` without scoping `where('citizenUid', '==', 'user-b')` -> Denied (`allow list` enforces `resource.data.citizenUid == request.auth.uid`).
8. **Citizen Status Tampering**: User A attempts `update` on own complaint to set `status: "RESOLVED"` or `priority: "CRITICAL"` -> Denied (`affectedKeys().hasOnly(...)` / `isAdmin()`).
9. **Internal Admin Note Leak**: User A attempts `get` or `list` on `/complaints/{id}/adminNotes` -> Denied (`isAdmin()`).
10. **Audit Log Tampering / Deletion**: Any user (even admin) attempts `update` or `delete` on `/auditLogs/{logId}` -> Denied (`allow update, delete: if false`).
11. **Path ID Poisoning / Resource Exhaustion**: User A attempts write to `/complaints/../../admin` or a 2KB document ID or a 500KB `description` -> Denied (`isValidId()` + `.size()` checks).
12. **PII Injection into Public Stats**: User A attempts to write `email` or `citizenName` or oversized string into `/publicStats/aggregate` -> Denied (`keys().hasOnly(...)` + strict numeric/map/bounded checks).
