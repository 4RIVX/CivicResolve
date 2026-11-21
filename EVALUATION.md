# CivicResolve — Final Engineering Evaluation (`EVALUATION.md`)

This document provides an evidence-backed assessment of **CivicResolve** (*"Report. Track. Resolve."*) across all six evaluation parameters, based strictly on the audited source code, deployed configuration, and tests executed in this environment.

---

## 1. Code Quality

### Implemented Features
- **Strict TypeScript & Modular Layering:**
  - Domain contracts & enums: `src/shared/types.ts`
  - Shared Zod validation schemas & ID sanitization: `src/shared/validation.ts`
  - Deterministic safety escalation & department normalization: `src/shared/safetyRules.ts`
  - Duplicate complaint scoring (GPS Haversine + text Jaccard + area + 7-day window): `src/shared/duplicateDetection.ts`
  - Bilingual English/Tamil interface dictionaries: `src/shared/i18n.ts`
  - Express API & centralized error handling: `src/server/app.ts`
  - Firebase token verification & admin RBAC middleware: `src/server/auth.ts`
  - Centralized environment configuration: `src/server/config.ts`
  - Gemini multimodal analyzer + SHA-256 caching + fallback: `src/server/services/geminiService.ts`
  - Cloud Firestore REST store & public stats reconciliation: `src/server/services/firestoreRestClient.ts`
  - Binary image signature validator: `src/server/utils/imageSecurity.ts`
- **Resilient Frontend State & Error Boundaries:** `src/components/ErrorBoundary.tsx` catches React render errors; `src/contexts/AppContext.tsx` manages Firebase Auth session state and bilingual preference; `src/lib/firebase.ts` exposes `handleFirestoreError` for structured Firestore diagnostics.
- **Bug Fixed During Audit:** Unit testing revealed `normalizeDepartmentCode('Stormwater Drain Division', 'OTHER')` matched `'WATER'` inside `'STORMWATER'` prior to `'DRAIN'`. Reordering `'DRAIN'|'SEW'|'STORMWATER'` ahead of `'WATER'` in `src/shared/safetyRules.ts` fixed misrouting of stormwater drainage reports.

### Source-Code References
- `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`
- `src/shared/types.ts`, `src/shared/validation.ts`, `src/shared/safetyRules.ts`, `src/shared/duplicateDetection.ts`, `src/shared/i18n.ts`
- `src/server/config.ts`, `src/server/auth.ts`, `src/server/app.ts`
- `src/components/ErrorBoundary.tsx`, `src/contexts/AppContext.tsx`

### Executed Test Results
- `npm run typecheck` (`tsc --noEmit`): exited with code `0`.
- `npm run lint` (`tsc --noEmit && npx eslint firestore.rules eslint.config.mjs`): exited with code `0` (0 warnings, 0 errors).
- `npm run build` (`vite build`): compiled cleanly in `1.10s`.

### Known Limitations
- `eslint` currently runs `@eslint/js` and `@firebase/eslint-plugin-security-rules` against `firestore.rules` and `eslint.config.mjs`; `typescript-eslint` parser checks across `src/` were not enabled in `eslint.config.mjs` alongside `typescript@^7.0.2`, so TypeScript correctness relies on `tsc --noEmit`.

### Outstanding Issues
- Vite warns that the shared main bundle (`dist/assets/index-*.js`, `1,019.87 kB` / `307.38 kB` gzip) exceeds Vite's default `500 kB` unminified threshold primarily due to the Firebase Web SDK; route components are already lazy-loaded (`src/App.tsx`).

---

## 2. Testing

### Implemented Features
- **Domain & Business Logic Unit Tests (`tests/unit.test.ts` — 11 tests):** Validation schemas, reference ID format, area extraction, department routing & stormwater/water disambiguation, English & Tamil deterministic safety escalation, low-confidence escalation retention, rule-based fallback, Haversine & Jaccard duplicate detection, image magic-byte validation, and admin allowlist parsing.
- **Firestore REST Client & Aggregation Tests (`tests/firestoreRestClient.test.ts` — 2 tests):** `FirestoreRestStore` typed serialization/deserialization, pagination/sorting, aggregate statistics reconciliation, and public aggregate reads using mocked `fetch` responses.
- **Gemini Multimodal & Caching Tests (`tests/geminiService.test.ts` — 2 tests):** `@google/genai` multimodal `inlineData` payload construction, SHA-256 response cache reuse, retry-then-fallback on empty/malformed responses, and deterministic safety override of low Gemini confidence.
- **Express End-to-End Integration Tests (`tests/integration.test.ts` — 2 suites):** `/api/health`, `/api/auth/me` (401 unauthenticated, 403 unverified email, 200 citizen & admin), `/api/ai/analyze` preview, `/api/complaints` validation (400) & spoofed image rejection (400), submission with safety escalation, cross-citizen isolation (403 on `/api/complaints/:id` & `/history`), admin RBAC enforcement (403 citizen vs 200 admin), PATCH status update + history + auditLog + publicStats reconciliation, `/api/admin/audit-logs`, `/api/admin/seed-demo`, empty `ADMIN_EMAILS` fail-closed verification, and safe 500 error masking.
- **Accessibility & Component UI Tests (`tests/accessibility.test.tsx` — 6 tests):** `axe-core` audits on `LandingPage`, `PublicTransparencyPage`, `LoginPage`, `CitizenReportPage`, `AdminComplaintReviewPage`, `ErrorBoundary`, `StatusBadges`, and `CivicCharts` (including Table View switching and Tamil toggles).
- **Security Regression, Rate-Limit, Image & Prompt-Injection Tests:** `tests/rateLimitAndCors.test.ts` (4 tests), `tests/imageSecurity.test.ts` (3 tests), `tests/promptInjection.test.ts` (3 tests), `tests/publicStatsCache.test.ts` (2 tests), `tests/firestoreAdminStore.test.ts` (2 tests), and `tests/securityRegression.test.ts` (2 tests).
- **Firestore Security Rules Static & Blueprint Tests (`tests/firestore.rules.test.ts` — 4 tests):** Verifies default deny-all rule, removal of `isBootstrappedAdminEmail()` and `isAdmin()`, collection alignment with `firebase-blueprint.json`, `email_verified` gating, owner-only complaint reads, client-denied `/admins`, `/adminNotes`, `/auditLogs`, and read-only `/publicStats/aggregate`.
- **Firestore Emulator Rule Tests (`tests/firestore.emulator.test.ts` — 2 suites, environment-gated):** `@firebase/rules-unit-testing` suite testing unauthenticated denial, citizen own-record isolation, client write denial on `complaints`/`admins`/`auditLogs`, and read-only `publicStats/aggregate` when `FIRESTORE_EMULATOR_HOST` is active.

### Source-Code References
- `vitest.config.ts`, `firebase.json`, `.github/workflows/ci.yml`
- `tests/unit.test.ts`, `tests/firestoreRestClient.test.ts`, `tests/firestoreAdminStore.test.ts`, `tests/geminiService.test.ts`, `tests/integration.test.ts`, `tests/accessibility.test.tsx`, `tests/firestore.rules.test.ts`, `tests/firestore.emulator.test.ts`, `tests/rateLimitAndCors.test.ts`, `tests/imageSecurity.test.ts`, `tests/promptInjection.test.ts`, `tests/publicStatsCache.test.ts`, `tests/securityRegression.test.ts`

### Executed Test Results
- `npm run test:coverage` (`vitest run --coverage`):
  - **12 test files passed, 1 skipped (`tests/firestore.emulator.test.ts`); 43 tests passed, 2 skipped.**
  - **V8 Coverage across all configured source scopes (`src/shared`, `src/server`, `src/components`):**
    - **All files:** `85.84%` Statements | `76.22%` Branches | `82.58%` Functions | `87.03%` Lines
    - `src/shared/validation.ts`: `100%` Lines | `100%` Functions
    - `src/shared/duplicateDetection.ts`: `96.49%` Lines | `100%` Functions
    - `src/shared/safetyRules.ts`: `75.86%` Lines | `100%` Functions
    - `src/server/services/firestoreRestClient.ts`: `93.98%` Lines | `84.61%` Functions
    - `src/server/services/firestoreAdminStore.ts`: `72.72%` Lines | `60.00%` Functions
    - `src/server/services/publicStatsCache.ts`: `100%` Lines | `100%` Functions
    - `src/server/services/publicStatsMath.ts`: `89.06%` Lines | `87.50%` Functions
    - `src/server/services/geminiService.ts`: `93.75%` Lines | `81.81%` Functions
    - `src/server/utils/imageSecurity.ts`: `90.00%` Lines | `100%` Functions
    - `src/server/config.ts`: `96.00%` Lines | `100%` Functions
    - `src/server/auth.ts`: `83.33%` Lines | `75.00%` Functions
    - `src/server/app.ts`: `83.26%` Lines | `90.32%` Functions
    - `src/components/StatusBadges.tsx`: `100%` Lines; `src/components/charts/CivicCharts.tsx`: `100%` Lines; `src/components/ErrorBoundary.tsx`: `91.66%` Lines; `src/components/Layout.tsx`: `59.09%` Lines

### Known Limitations
- **Firestore Emulator Execution in Container:** `firebase-tools` is installed (`/usr/local/bin/firebase`), and `tests/firestore.emulator.test.ts` is wired via `npm run test:emulator` and `.github/workflows/ci.yml` (Java 21), **but this container lacks a Java Runtime (`Error: Could not spawn java -version`)** as recorded in `evidence/phase7-emulator-attempt.txt`. Consequently, live emulator execution is `NOT VERIFIED` locally (`skipped`) until run in CI or a Java 21+ environment.
- `src/pages/*` UI containers (whose business logic resides in `src/shared` and `src/server`) are tested via `tests/accessibility.test.tsx` and Playwright browser checks rather than included in `vitest.config.ts` V8 thresholds.

### Outstanding Issues
- Live Google OAuth popup sign-in could not be driven end-to-end inside headless Chromium without interactive Google account credentials; authenticated routes were verified via redirect guards in Playwright and via injected Firebase token verification in `tests/integration.test.ts`.

---

## 3. Security

### Implemented Features
- **Fail-Closed Server-Side Admin Allowlist (`src/server/config.ts`, `src/server/auth.ts`):** Removed all hardcoded admin emails and bootstrap bypasses. `ADMIN_EMAILS` / `ADMIN_EMAIL` unset initializes an empty `Set<string>`, causing all `/api/admin/*` routes to deny access (`403`).
- **Hardened Firestore Rules (`firestore.rules` — pending deployment after backend):**
  - Completely removed `isBootstrappedAdminEmail()` and client-side `isAdmin()`.
  - Default-deny catch-all (`allow read, write: if false`).
  - `/admins/{uid}`, `/complaints/{id}/adminNotes/{noteId}`, and `/auditLogs/{logId}` deny all client SDK reads/writes.
  - `/complaints/{id}` and `/statusHistory/{id}` allow `get`/`list` strictly to the verified owning citizen (`citizenUid == request.auth.uid`) and deny all client writes (`allow create, update, delete: if false`).
  - `/publicStats/{statId}` permits `allow get: if isValidId(statId) && statId == 'aggregate';` and denies all client `list`, `create`, `update`, and `delete`.
- **Atomic Admin SDK `publicStats` Transactions (`src/server/services/firestoreAdminStore.ts`, `src/server/services/publicStatsMath.ts`):** Server-side Firestore Admin SDK transactions update `complaints`, `statusHistory`, `auditLogs`, and `publicStats/aggregate` atomically with `sanitizePublicStats` PII exclusion.
- **Per-UID / Per-IP Rate Limiting, Strict CORS & Helmet CSP (`src/server/app.ts`, `src/server/config.ts`):** `trust proxy = 1`, `express-rate-limit` (`10/h/uid` submit, `20/h/uid` AI analyze, `60/min/uid` admin mutations, `120/min/uid` auth reads, `120/min/IP` public reads), origin-allowlisted CORS (`403` on unpermitted origins, zero wildcard), Helmet CSP, `no-store` private cache headers, and masked 500 responses.
- **In-Memory Image Re-Encoding & EXIF/GPS Stripping (`src/server/utils/imageSecurity.ts`):** `sharp` validates container formats against JPEG/PNG/WEBP magic bytes, rejects `> 4096px` / pixel-bomb / animated WEBP / SVG polyglots, normalizes orientation with `.rotate()`, and strips EXIF/GPS/XMP/IPTC metadata in memory (`<= 190KB` decoded).
- **Gemini Prompt-Injection Defense & Strict Schemas (`src/shared/validation.ts`, `src/shared/safetyRules.ts`, `src/server/services/geminiService.ts`):** `.strict()` schemas reject smuggled `status`/`role`/`priority`/`department` keys; `aiResponseSchema.department` and `adminComplaintUpdateSchema.assignedDepartment` enforce `DEPARTMENT_CODES`; citizen input is isolated between `BEGIN_UNTRUSTED_CITIZEN_DATA` / `END_UNTRUSTED_CITIZEN_DATA` markers; deterministic safety rules can only raise priority.
- **Dependency Remediation (`package.json`):** `@grpc/grpc-js` pinned to `^1.14.7`; `sharp` `0.35.5` added with `0` vulnerabilities.

### Source-Code References
- `src/server/config.ts`, `src/server/auth.ts`, `src/server/app.ts`
- `src/server/services/firestoreAdminStore.ts`, `src/server/services/publicStatsMath.ts`, `src/server/services/publicStatsCache.ts`
- `src/server/utils/imageSecurity.ts`, `src/server/services/geminiService.ts`
- `src/shared/validation.ts`, `src/shared/safetyRules.ts`, `firestore.rules`, `SECURITY-AUDIT.md`

### Executed Test Results
- `bun audit`: **0 vulnerabilities found (checked 628 packages)** (`@grpc/grpc-js` resolved to `1.14.7`, `sharp` `0.35.5`).
- `npm run lint`: exited with code `0`.
- `tests/integration.test.ts`, `tests/rateLimitAndCors.test.ts`, `tests/imageSecurity.test.ts`, `tests/promptInjection.test.ts`, `tests/securityRegression.test.ts`: verified 401/403 malformed identity & RBAC enforcement, 429 rate-limit thresholds, 403 CORS rejection, EXIF/GPS removal, animated WEBP & polyglot blocking, and prompt-injection rejection.
- `grep` secret scan on `dist/assets/*.js`: zero private secrets (`GEMINI_API_KEY`, `ADMIN_EMAILS`, `PRIVATE_KEY`, `firebase-admin`, personal emails) in production client bundles (`evidence/phase9-build-and-dist-scan.txt`).

### Known Limitations
- **Per-Instance In-Memory Rate Limit & Cache:** `express-rate-limit` and `PublicStatsCache` keep state in memory per Cloud Run instance rather than a shared Redis store.
- **Local Emulator Verification:** Live execution of the updated `firestore.rules` against Firebase Emulator was `NOT VERIFIED` locally (`java: not found`, recorded in `evidence/phase7-emulator-attempt.txt`) and is automated in `.github/workflows/ci.yml` with Java 21.

### Outstanding Issues
- Production deployment must apply the updated backend (`FirestoreAdminStore`) **before** running `firebase deploy --only firestore:rules`, with `ADMIN_EMAILS`, `GEMINI_API_KEY`, and `APP_URL` configured in Cloud Run environment secrets (`SECURITY-AUDIT.md` Section 5).

---

## 4. Problem Statement Alignment

### Implemented Features
- **Full Four-Area Architecture:**
  - Landing Page (`src/pages/LandingPage.tsx`)
  - Citizen Portal: My Complaints dashboard (`src/pages/CitizenDashboardPage.tsx`), Bilingual Complaint Reporting with optional GPS, compressed photograph upload, and `"Preview AI Triage"` (`src/pages/CitizenReportPage.tsx`), plus Citizen Detail & Timeline (`src/pages/ComplaintDetailPage.tsx`)
  - Administrator Console: Prioritized triage queue, aggregate oversight, audit log viewer, and clearly labeled `[DEMO]` sample seeder (`src/pages/AdminDashboardPage.tsx`), plus Complaint Review, Duplicate Detection review, Department/Priority override, and Internal Admin Notes (`src/pages/AdminComplaintReviewPage.tsx`)
  - Public Transparency Dashboard: Zero-PII live aggregated metrics & trends (`src/pages/PublicTransparencyPage.tsx`)
- **Genuine Gemini Integration + Safety Overrides:** Centrally configurable `GEMINI_MODEL` (`gemini-4-hydrogen`), multimodal image + text analysis, explicit `GEMINI` vs `FALLBACK` badges, confidence disclaimer, and deterministic life-safety overrides (`exposed wire`, `open manhole`, gas/fire, Tamil hazard terms).
- **Transparent Duplicate Scoring:** `findPotentialDuplicates` scores category, description/title Jaccard similarity, area overlap, Haversine GPS distance, and 7-day proximity and surfaces candidates for human review without auto-merging.
- **Full English & Tamil (`தமிழ்`) UI & Intake:** `src/shared/i18n.ts` covers navigation, landing, login security note, form labels, AI preview, dashboards, pagination, and status/priority/category terms.

### Source-Code References
- `src/pages/LandingPage.tsx`, `src/pages/LoginPage.tsx`, `src/pages/PublicTransparencyPage.tsx`
- `src/pages/CitizenDashboardPage.tsx`, `src/pages/CitizenReportPage.tsx`, `src/pages/ComplaintDetailPage.tsx`
- `src/pages/AdminDashboardPage.tsx`, `src/pages/AdminComplaintReviewPage.tsx`
- `src/shared/i18n.ts`, `src/shared/safetyRules.ts`, `src/shared/duplicateDetection.ts`

### Executed Test Results
- Playwright headless Chromium verified `/`, `/login` (Tamil toggle + active Firebase Auth button + Tamil security note), `/transparency`, and unauthenticated redirect from `/citizen` to `/login`.
- `tests/integration.test.ts` verified full submission -> AI/fallback classification -> safety escalation -> admin status transition -> public aggregate reconciliation.

### Known Limitations
- Because image evidence is stored as compressed data URLs (`<= 190KB` decoded) inside Firestore documents rather than a separate Firebase Cloud Storage bucket, attachment resolution is bounded to `960px` max edge JPEG/WEBP/PNG to stay comfortably under Firestore's `1MB` document limit.

### Outstanding Issues
- Interactive Google OAuth login & live Firestore record creation against `data-blend-vc62s` require a real user session in a standard browser with popups allowed (`ADMIN_EMAILS` configured for admin access).

---

## 5. Accessibility

### Implemented Features
- **Semantic Landmarks & Keyboard Skip Link:** `<header>`, `<nav aria-label="Primary navigation">`, `<main id="main-content">`, `<footer>`, and skip link in `src/components/Layout.tsx`.
- **Accessible Forms & Live Validation:** Explicit `<label htmlFor>`, `aria-invalid`, `aria-describedby` error links, `role="alert"` error banners, `>= 44px` minimum touch targets on primary buttons (`src/pages/CitizenReportPage.tsx`, `src/pages/LoginPage.tsx`, `src/components/ErrorBoundary.tsx`).
- **Non-Color Status & Chart Alternatives:** `StatusIndicator` and `PriorityIndicator` (`src/components/StatusBadges.tsx`) pair color with distinct Lucide icons and localized text labels. `AccessibleBarChart` and `MonthlyTrendsChart` (`src/components/charts/CivicCharts.tsx`) include `<figure>`, `role="img"`, descriptive `aria-label`, and a keyboard-operable `"Table View"` toggle rendering `<table>` semantics.
- **Responsive Design & Motion:** Responsive mobile/desktop grids (`390×844` and `1440×900`) and `prefers-reduced-motion` support (`src/index.css`).

### Source-Code References
- `src/components/Layout.tsx`, `src/components/StatusBadges.tsx`, `src/components/charts/CivicCharts.tsx`, `src/components/ErrorBoundary.tsx`
- `src/pages/CitizenReportPage.tsx`, `src/pages/LoginPage.tsx`, `src/pages/AdminComplaintReviewPage.tsx`
- `src/index.css`, `src/shared/i18n.ts`

### Executed Test Results
- `tests/accessibility.test.tsx` (`axe-core` audit): **6/6 tests passed with 0 WCAG violations** across `LandingPage`, `PublicTransparencyPage` (including Table View), `CitizenReportPage` (validation + AI Preview), `AdminComplaintReviewPage`, `StatusBadges`, and `ErrorBoundary`.
- Headless Chromium (`playwright-cli`) at `390×844` mobile and `1440×900` desktop verified zero horizontal overflow (`scrollWidth: 390 === innerWidth: 390`) and zero browser console errors.

### Known Limitations
- `jsdom` + `axe-core` checks programmatic ARIA, labels, heading hierarchy, and landmark rules but does not compute full CSS contrast against rendered bitmap images in headless unit tests; contrast was checked via Tailwind palette tokens (`slate-900`/`slate-800` on `white`/`slate-50`, `red-800`/`teal-900`/`blue-700`).

### Outstanding Issues
- None identified in audited pages; interactive screen-reader narration (NVDA/VoiceOver) was not manually recorded in this container.

---

## 6. Efficiency

### Implemented Features
- **Lean Initial Bundle & Route Splitting:** Lazy-loaded `PublicTransparencyPage`, `LoginPage`, Citizen Portal, and Admin Console routes (`src/App.tsx:8-30`) so initial landing loads exclude portal & chart chunks. Removed the unused eager `testConnection()` Firestore probe from module initialization in `src/lib/firebase.ts`, eliminating an extra failed permission request on public page loads.
- **Browser-Side Image Compression (`src/lib/imageCompression.ts`):** Offloads resizing (`<= 960px` max edge) and JPEG compression (`<= 240KB` data URL) to the client's `<canvas>`, saving bandwidth and Cloud Run memory.
- **Gemini Caching & Timeout Guards (`src/server/services/geminiService.ts`):** Persists analysis in Firestore so reading complaints never re-calls Gemini; caches identical text/image/model hashes in memory via SHA-256 (`buildCacheKey`); enforces a `15s` request timeout.
- **Server-Side Filtering, Pagination & 30s Public Stats Caching:** `FirestoreAdminStore.listComplaints` scopes queries (`citizenUid` for citizens) and paginates (`page`, `pageSize`); `PublicStatsCache` (`src/server/services/publicStatsCache.ts`) caches zero-PII aggregate reads for `30s` with concurrent read deduplication and immediate mutation invalidation, paired with `Cache-Control: public, max-age=30` on `/api/public/statistics` and `/api/public/trends`.

### Source-Code References
- `src/App.tsx:8-30`, `src/lib/firebase.ts:63-71`, `src/lib/imageCompression.ts`
- `src/server/services/geminiService.ts:75-90, 152-206`
- `src/server/services/firestoreAdminStore.ts`, `src/server/services/publicStatsCache.ts`, `src/server/app.ts`

### Executed Test Results
- **Production Bundle Sizes (`npm run build`):**
  - `dist/index.html`: `1.53 kB` (`0.68 kB` gzip)
  - `dist/assets/index-*.css`: `34.23 kB` (`7.04 kB` gzip)
  - `dist/assets/LoginPage-*.js`: `2.53 kB` (`1.00 kB` gzip)
  - `dist/assets/PublicTransparencyPage-*.js`: `6.57 kB` (`1.78 kB` gzip)
  - `dist/assets/CivicCharts-*.js`: `7.95 kB` (`1.89 kB` gzip)
  - `dist/assets/CitizenDashboardPage-*.js`: `14.34 kB` (`2.81 kB` gzip)
  - `dist/assets/AdminDashboardPage-*.js`: `19.66 kB` (`3.91 kB` gzip)
  - `dist/assets/CitizenReportPage-*.js`: `109.69 kB` (`29.91 kB` gzip)
  - `dist/assets/index-*.js`: `1,020.06 kB` (`307.43 kB` gzip)

### Known Limitations
- `PublicStatsCache` and Gemini's SHA-256 response cache are in-memory per Cloud Run container instance (ephemeral across cold starts or horizontal scale-out).
- `listComplaints` scans up to `200` scoped records and filters/sorts multi-criteria combinations in memory to avoid proliferation of composite Firestore indexes.

### Outstanding Issues
- The shared vendor/Firebase bundle (`dist/assets/index-*.js`, `307.43 kB` gzip) could be further split into dedicated Firebase/React vendor chunks via Vite `rolldownOptions.output.codeSplitting` if initial cache granularity across releases becomes a priority.
