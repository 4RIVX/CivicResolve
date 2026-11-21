# CivicResolve — Principal Security Engineering Audit (`SECURITY-AUDIT.md`)

**Audit Target:** CivicResolve (`applet_id: 89fb920a-f29d-4e97-b68e-90e0a193b055`, project `data-blend-vc62s`)  
**Audit Scope:** Full-stack security hardening and reproducible security regression testing (Mission A, Phases 0–9)  
**Infrastructure Status:** **Local edits and local tests only — production Firestore rules and Cloud Run have NOT been deployed or modified.**

---

## 1. Executive Summary

All targeted security weaknesses identified in the CivicResolve codebase have been remediated across 7 incremental git commits (`030a17d` through the final Phase 7–9 commit) while preserving all existing citizen, administrator, bilingual, Gemini AI, and public transparency features:

| Phase | Hardening Objective | Status | Primary Evidence |
|---|---|---|---|
| **Phase 0** | Git safety checkpoint & client SDK surface scan | **Verified** | `evidence/phase0-git-checkpoint.txt`, `evidence/phase0-client-firestore-scan.txt`, `evidence/phase0-baseline-tests.txt` |
| **Phase 1** | Remove `isBootstrappedAdminEmail()` & client admin privileges in `firestore.rules`; enforce fail-closed backend admin RBAC | **Verified (static)** / **Emulator NOT VERIFIED locally** | `firestore.rules`, `src/server/auth.ts`, `tests/firestore.rules.test.ts`, `evidence/phase1-2-tests.txt`, `evidence/phase7-emulator-attempt.txt` |
| **Phase 2** | Lock `/publicStats/aggregate` to read-only for clients; migrate `publicStats` updates to server-side Admin SDK transactions | **Verified (unit + transaction mock)** | `src/server/services/firestoreAdminStore.ts`, `src/server/services/publicStatsMath.ts`, `tests/firestoreAdminStore.test.ts`, `evidence/phase1-2-tests.txt` |
| **Phase 3** | Per-UID / per-IP `express-rate-limit` (`trust proxy = 1`), strict CORS allowlist, Helmet CSP, zero stack traces | **Verified** | `src/server/app.ts`, `src/server/config.ts`, `tests/rateLimitAndCors.test.ts`, `evidence/phase3-tests.txt` |
| **Phase 4** | Full image decoding & EXIF/GPS/XMP stripping with `sharp`, pixel/animation/polyglot guards, zero disk writes | **Verified** | `src/server/utils/imageSecurity.ts`, `tests/imageSecurity.test.ts`, `evidence/phase4-tests.txt`, `evidence/sharp-smoke.txt` |
| **Phase 5** | Gemini prompt-injection defense (`BEGIN_UNTRUSTED_CITIZEN_DATA` delimiters, strict Zod `DEPARTMENT_CODES` enum, `.strict()` citizen schemas, monotonic safety escalation) | **Verified** | `src/shared/safetyRules.ts`, `src/shared/validation.ts`, `src/server/services/geminiService.ts`, `tests/promptInjection.test.ts`, `evidence/phase5-tests.txt` |
| **Phase 6** | 30s TTL server-side `PublicStatsCache` with concurrent read deduplication, mutation invalidation, and PII stripping | **Verified** | `src/server/services/publicStatsCache.ts`, `tests/publicStatsCache.test.ts`, `evidence/phase6-tests.txt` |
| **Phase 7–9** | Security regression tests, `bun audit`, Java-enabled CI workflow, coverage & build artifact secret scan | **Verified locally except Java Emulator** | `tests/securityRegression.test.ts`, `.github/workflows/ci.yml`, `evidence/phase7-emulator-attempt.txt`, `evidence/phase8-audit.txt`, `evidence/phase9-*.txt` |

---

## 2. Detailed Changes & Security Verification

### Phase 0 — Baseline & Client Surface Inspection
- Verified zero frontend pages or admin components call client-side Firestore SDK reads or writes directly (`evidence/phase0-client-firestore-scan.txt`); all application workflows execute through verified Express `/api/*` endpoints.
- Baseline pre-hardening run: `6` test files passed, `1` skipped (emulator), `26` tests passed (`evidence/phase0-baseline-tests.txt`).

### Phase 1 & 2 — Removal of Admin Bootstrap Fallback & Server-Only `publicStats`
- **Removed Bootstrap Email:** Deleted `isBootstrappedAdminEmail()` and `isAdmin()` from `firestore.rules`. No email address appears anywhere in `firestore.rules`.
- **Client Rules Lock-Down (`firestore.rules:72-108`):**
  - `/admins/{userId}`, `/complaints/{id}/adminNotes/{noteId}`, and `/auditLogs/{logId}` deny all client SDK reads and writes (`allow read, write: if false;`).
  - `/complaints/{id}` and `/complaints/{id}/statusHistory/{historyId}` allow `get`/`list` strictly to the owning verified citizen (`citizenUid == request.auth.uid && request.auth.token.email_verified == true`) and deny all client `create`/`update`/`delete`.
  - `/publicStats/{statId}` permits `allow get: if isValidId(statId) && statId == 'aggregate';` and denies all `list`, `create`, `update`, and `delete`.
- **Auth Middleware (`src/server/auth.ts:91-110`):** `requireAuth` rejects missing/oversized/invalid `uid` (`!VALID_ID_PATTERN.test(payload.uid)`) with `401`, and rejects unverified or malformed emails with `403`. `requireAdmin` evaluates `config.adminEmails` strictly from `ADMIN_EMAILS`/`ADMIN_EMAIL` (empty allowlist fails closed).
- **Atomic Server-Side Aggregate Transactions (`src/server/services/firestoreAdminStore.ts`, `src/server/services/publicStatsMath.ts`):** Replaced default `FirestoreRestStore` with `FirestoreAdminStore` using `db.runTransaction(...)` so creating or updating a complaint updates `complaints`, `statusHistory`, `auditLogs`, and `publicStats/aggregate` atomically, passing all stats through `sanitizePublicStats` to drop any unexpected or PII keys.

### Phase 3 — Rate Limiting, Strict CORS, Helmet CSP, and Safe Errors
- **Rate Limits (`src/server/app.ts:150-208`):** Enabled `app.set('trust proxy', 1)` for Cloud Run single-hop reverse proxy IP resolution (`ipKeyGenerator`), keying authenticated routes by verified `uid:<uid>` and public routes by normalized IP:
  - `POST /api/complaints`: `10/hour/uid` (`complaintSubmitLimiter`)
  - `POST /api/ai/analyze`: `20/hour/uid` (`aiAnalyzeLimiter`)
  - `PATCH /api/admin/complaints/:id`, `POST /api/admin/complaints/:id/notes`, `POST /api/admin/seed-demo`: `60/minute/uid` (`adminMutationLimiter`)
  - Authenticated reads (`GET /api/complaints*`, `GET /api/admin/*`): `120/minute/uid` (`citizenReadLimiter`)
  - `GET /api/auth/me`: `60/minute/IP` (`authPreLimiter`)
  - Public endpoints (`/api/health`, `/api/public/statistics`, `/api/public/trends`): `120/minute/IP` (`publicReadLimiter`)
  - Verified HTTP `429`, `ratelimit-limit` / `ratelimit-remaining` headers, cross-UID isolation, and uninterrupted normal demo flow in `tests/rateLimitAndCors.test.ts`.
- **Strict CORS & Headers (`src/server/config.ts:43-63`, `src/server/app.ts:83-141`):** Origin allowlist built from `APP_URL`, `CORS_ALLOWED_ORIGINS`, localhost dev ports, and exact `Host` match. Unpermitted `Origin` headers receive HTTP `403` without `Access-Control-Allow-Origin: *`. Production CSP via `helmet`, `x-powered-by` disabled, `Cache-Control: no-store` on private endpoints, and safe error responses with zero stack traces.

### Phase 4 — Secure Image Decoding & EXIF/GPS Stripping (`sharp`)
- Upgraded `src/server/utils/imageSecurity.ts` (`validateAndSanitizeImageDataUrl`) using `sharp` (`0.35.5`) fully in memory (zero local disk writes):
  - Rejects oversized data URLs (`> 360,000` chars), decoded buffers outside `1B..260KB`, and mismatched JPEG/PNG/WEBP magic bytes before invoking `sharp`.
  - Runs `sharp(buffer, { limitInputPixels: 16_777_216, failOn: 'error' })` to verify container format matches signature, enforce `1..4096px` dimensions, and reject animated/multi-frame WEBP (`pages > 1`).
  - Applies `.rotate()` (normalizing EXIF orientation) and re-encodes without `.withMetadata()`, completely removing EXIF camera tags, GPS coordinates, XMP, and IPTC metadata while capping output at `<= 190KB` decoded for Firestore safety.
  - Both `src/server/app.ts` and `src/server/services/geminiService.ts` pass only the re-encoded sanitized bytes to Gemini and Firestore.
  - Verified against EXIF/GPS fixtures, orientation 6, animated 2-frame WEBP, pixel-bomb PNG (> 4096px), SVG/GIF polyglots, MIME spoofing, and truncated headers in `tests/imageSecurity.test.ts`.

### Phase 5 — Gemini Prompt-Injection Defense & Strict Schema Allowlists
- Exported `DEPARTMENT_CODES` tuple in `src/shared/safetyRules.ts`.
- Tightened Zod schemas in `src/shared/validation.ts`:
  - `aiResponseSchema.department` and `adminComplaintUpdateSchema.assignedDepartment` locked to `z.enum(DEPARTMENT_CODES)` (rejects `"ROOT_ADMIN"`).
  - `complaintSubmissionSchema`, `aiAnalyzeRequestSchema`, and `adminComplaintUpdateSchema` marked `.strict()` so citizens cannot smuggle `status`, `role`, `priority`, `department`, or `isAdmin`.
- Updated `src/server/services/geminiService.ts` to delimit untrusted citizen input inside `---BEGIN_UNTRUSTED_CITIZEN_DATA---` / `---END_UNTRUSTED_CITIZEN_DATA---`, constrain `department` in Gemini `RESPONSE_SCHEMA`, reject invalid outputs into deterministic rule fallback (`requiresHumanReview: true`), and enforce monotonic priority escalation (`maxPriority` only raises priority on life-safety hazards).
- Verified with prompt-injection regression tests in `tests/promptInjection.test.ts`.

### Phase 6 — Public Statistics 30s TTL Cache
- Added `src/server/services/publicStatsCache.ts` (`PublicStatsCache`) with `30_000ms` TTL, generation-safe `invalidate()` on complaint submissions/updates/reconciliation, concurrent in-flight request deduplication, and `sanitizePublicStats` PII exclusion.
- Wired into `GET /api/public/statistics` and `GET /api/public/trends` in `src/server/app.ts`; verified in `tests/publicStatsCache.test.ts`.

---

## 3. Verification Status & Honest Findings

| Check | Command | Outcome | Evidence File |
|---|---|---|---|
| Typecheck | `npm run typecheck` | **PASSED** (0 errors) | `evidence/phase9-typecheck.txt` |
| Lint & Firestore Rules Security | `npm run lint` | **PASSED** (0 errors, 0 warnings) | `evidence/phase9-lint.txt` |
| Full Test Suite + V8 Coverage | `npm run test:coverage` | **12 files passed (43 tests passed)**, **1 file skipped (`tests/firestore.emulator.test.ts`, 2 tests skipped)**; Coverage: **85.84% Stmts / 76.22% Branches / 82.58% Funcs / 87.03% Lines** | `evidence/phase9-test-coverage.txt` |
| Firestore Emulator Rules Execution | `npm run test:emulator` | **NOT VERIFIED locally** — `Error: Could not spawn java -version. Please make sure Java is installed and on your system PATH.` | `evidence/phase7-emulator-attempt.txt` |
| Dependency Vulnerability Audit | `bun audit` | **PASSED** (`0` vulnerabilities across 628 packages; `@grpc/grpc-js` `1.14.7`, `sharp` `0.35.5`) | `evidence/phase8-audit.txt` |
| Production Build & Bundle Secret Scan | `npm run build` + `grep` scan on `dist/assets/*.js` | **PASSED** — Zero `GEMINI_API_KEY`, `PRIVATE_KEY`, `ADMIN_EMAILS`, `firebase-admin`, or personal emails in `dist/assets/*.js` (only public Firebase Web config `apiKey` bundled for Auth initialization) | `evidence/phase9-build-and-dist-scan.txt` |

*(CI Mitigation: `.github/workflows/ci.yml` provisions `temurin` Java 21 alongside Node.js 22 to execute `tests/firestore.emulator.test.ts` against the live Firestore Emulator on every push and pull request.)*

---

## 4. Remaining Risks & Operational Constraints

1. **Cloud Run In-Memory Rate Limit & Cache Scope:** `express-rate-limit` and `PublicStatsCache` store state per Cloud Run container instance rather than a shared Redis instance. Under multi-instance autoscaling, per-user/IP budgets and `30s` aggregate caches are enforced independently per container instance.
2. **Prompt Injection Is Bounded, Not Eliminated:** Schema allowlists (`DEPARTMENT_CODES`, integer `1..5`, priority enums), untrusted data delimiters, and deterministic safety escalation prevent Gemini prompt injections from changing complaint status, creating unauthorized departments (`ROOT_ADMIN`), mutating database roles, or suppressing life-safety escalations. Subtle semantic framing inside natural-language text that still conforms to valid schema enums remains possible; all fallback and safety-escalated cases are flagged `requiresHumanReview: true`.
3. **Production Deployment Prerequisite (Server IAM):** Moving `publicStats` updates to `FirestoreAdminStore` requires the Cloud Run runtime service account to hold Cloud Datastore User / Firebase Admin Firestore permissions against `data-blend-vc62s` (`ai-studio-89fb920a-f29d-4e97-b68e-90e0a193b055`).

---

## 5. Exact Deployment Order (NOT Executed Here)

**IMPORTANT:** Deploy the backend **before** deploying `firestore.rules`. Because the new `firestore.rules` removes client write access to `/complaints` and `/publicStats`, deploying rules first would block any legacy client SDK writes until the updated backend container is live.

1. **Verify Environment Secrets in Cloud Run / AI Studio:**
   - `GEMINI_API_KEY` (server secret)
   - `ADMIN_EMAILS` (comma-separated verified municipal admin email allowlist)
   - `APP_URL` (hosted Cloud Run URL for strict CORS allowlist)
   - `GEMINI_MODEL` (optional override, defaults to `gemini-4-hydrogen`)
2. **Step 1 — Build & Deploy Backend Service First:**
   ```bash
   npm run build
   gcloud run deploy civicresolve \
     --source . \
     --project data-blend-vc62s \
     --region <REGION> \
     --allow-unauthenticated \
     --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=data-blend-vc62s,FIRESTORE_DATABASE_ID=ai-studio-89fb920a-f29d-4e97-b68e-90e0a193b055,APP_URL=https://<SERVICE_URL>"
   ```
   *(Ensure `GEMINI_API_KEY` and `ADMIN_EMAILS` are bound via Secret Manager or `--set-secrets`, and verify `GET https://<SERVICE_URL>/api/health` returns `200` and `GET /api/public/statistics` reads via Admin SDK.)*
3. **Step 2 — Deploy Hardened Firestore Security Rules Second:**
   ```bash
   firebase deploy --only firestore:rules --project data-blend-vc62s
   ```
4. **Step 3 — Run Live Emulator Verification in a Java 21 Environment:**
   ```bash
   npm run test:emulator
   ```
