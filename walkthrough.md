# CivicResolve Security Hardening Walkthrough

This walkthrough summarizes the security improvements implemented across CivicResolve in plain, verifiable terms. Production Firestore rules and Cloud Run deployments were **not** modified by these local changes.

---

## Key Improvements Completed

| Area | What Changed | Why It Matters |
|---|---|---|
| **Administrator Access & Firestore Rules** | Removed `isBootstrappedAdminEmail()` and client-side `isAdmin()` from `firestore.rules`. Locked `/admins/{uid}`, `/complaints/{id}/adminNotes`, and `/auditLogs` against all client SDK access, and made `/publicStats/aggregate` read-only (`get` only) for clients. | Eliminates hardcoded email privileges in rules and prevents client-side tampering with complaint records, audit history, or public statistics. |
| **Server-Side Aggregate Transactions** | Added `FirestoreAdminStore` (`src/server/services/firestoreAdminStore.ts`) and `publicStatsMath.ts` so the Express backend updates complaints, timelines, audit trails, and `/publicStats/aggregate` atomically using Firebase Admin SDK transactions. | Ensures citizens and public viewers never write directly to shared aggregate statistics while keeping totals accurate on every create or status change. |
| **Role-Aware Rate Limiting & CORS** | Configured `express-rate-limit` (`trust proxy = 1`) keyed by verified user UID on citizen/admin routes (`10/h` submit, `20/h` AI preview, `60/min` admin updates) and normalized IP on public routes (`120/min`), strict CORS allowlist (`403` on unknown origins), Helmet CSP, and zero stack traces. | Protects Gemini quota and Firestore from automated abuse without blocking normal citizen/admin workflows or leaking internal server errors. |
| **Photo Re-Encoding & Metadata Removal** | Upgraded `validateAndSanitizeImageDataUrl()` (`src/server/utils/imageSecurity.ts`) using `sharp` in memory to validate JPEG/PNG/WEBP magic bytes, reject animated WEBP/pixel bombs/SVG polyglots, normalize orientation, and strip EXIF/GPS/XMP/IPTC tags before storing or calling Gemini. | Protects citizen location/device privacy by stripping hidden photo metadata and blocking malformed or disguised uploads before they reach storage or AI. |
| **Gemini Prompt-Injection Guardrails** | Wrapped citizen text in `BEGIN_UNTRUSTED_CITIZEN_DATA` / `END_UNTRUSTED_CITIZEN_DATA` delimiters, locked `department` to `DEPARTMENT_CODES` in both Gemini schema and Zod, added `.strict()` to citizen/admin inputs, and enforced monotonic safety escalation. | Prevents crafted complaint text from smuggling `status: RESOLVED`, `ROOT_ADMIN` departments, or out-of-bounds severity numbers into saved records. |
| **Public Statistics 30s Cache** | Added `PublicStatsCache` (`src/server/services/publicStatsCache.ts`) with a 30-second TTL, concurrent read deduplication, mutation invalidation, and PII key stripping. | Reduces repeated Firestore reads under public traffic bursts while refreshing immediately when grievances are created or updated. |

---

## Verification Summary

- **Lint & Typecheck:** `npm run typecheck` and `npm run lint` (including Firebase security rules linting) passed cleanly.
- **Automated Tests & Coverage:** `npm run test:coverage` passed **12 test files / 43 tests** (covering auth claims, IDOR isolation, rate limits, CORS, Helmet CSP, Sharp EXIF removal, animated WEBP/polyglot rejection, prompt injection, and 30s public cache), with **87.03%** line coverage (`85.84%` statements).
- **Firestore Emulator Status:** `tests/firestore.emulator.test.ts` (2 tests) was skipped locally because the container lacks a Java runtime (`Error: Could not spawn java -version`). `.github/workflows/ci.yml` configures Java 21 to execute those emulator tests in CI.
- **Dependency & Bundle Secret Checks:** `bun audit` found **0 vulnerabilities** across 628 packages (`@grpc/grpc-js` `1.14.7`, `sharp` `0.35.5`), and compiled client bundles (`dist/assets/*.js`) contain zero private keys or server secrets.
