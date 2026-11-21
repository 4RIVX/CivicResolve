# CivicResolve — AI-Powered Citizen Grievance Management and Resolution

**Tagline:** *Report. Track. Resolve.*

CivicResolve is a civic technology platform designed for Google AI Studio Build Mode and Google Cloud Run. It pairs Firebase Authentication, Cloud Firestore, and server-side Google Gemini Flash intelligence with deterministic safety rules to help citizens report local infrastructure issues in English or Tamil without guessing government department structures.

## Core Modules
1. **Landing & Bilingual Experience (`/`):** Explains the civic grievance problem, 3-step workflow, AI safeguards, and live anonymized impact metrics with instant English / Tamil (`EN / தமிழ்`) switching.
2. **Citizen Portal (`/citizen`, `/citizen/report`, `/citizen/complaints/:id`):** Private Firebase-authenticated workspace for submitting complaints with optional GPS coordinates and client-compressed photographs, viewing Gemini vs. fallback triage provenance, and tracking progress (`REPORTED` -> `IN_PROGRESS` -> `RESOLVED`).
3. **Administrator Portal (`/admin`, `/admin/complaints/:id`):** Protected strictly by server-side verified email allowlist (`ADMIN_EMAILS`). Features 6 operational KPIs, 4 accessible charts, paginated/sortable queue, potential duplicate inspection (without auto-merging), status/department assignment, internal admin notes, labeled demo data seeding, and an immutable audit trail.
4. **Public Transparency Dashboard (`/transparency`):** Displays aggregated municipal metrics, category/priority/area distributions, and monthly trends with zero citizen PII exposed.

## Technology Stack
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router, Lucide Icons
- **Backend:** Node.js, Express 4, Zod, Helmet, `express-rate-limit`
- **Database & Auth:** Cloud Firestore + Firebase Authentication (`firebase` client SDK + `firebase-admin` ID token verification and server-side Firestore access; `firestore.rules` govern client SDK access)
- **AI Engine:** Official `@google/genai` SDK (`gemini-4-hydrogen` configurable via `GEMINI_MODEL`) + deterministic backend safety rules + rule-based fallback
- **Testing:** Vitest, Supertest, React Testing Library, `axe-core`, Playwright Chromium, ESLint (`@firebase/eslint-plugin-security-rules`)

## Environment Configuration
Copy `.env.example` for local/Cloud Run environments (never commit secrets):
- `GEMINI_API_KEY` — Google Gemini API key (server-side only; automatically injected in AI Studio Secrets / Cloud Run).
- `GEMINI_MODEL` — Configurable Gemini Flash model identifier (defaults to `gemini-4-hydrogen`).
- `ADMIN_EMAILS` — Comma-separated allowlist of verified administrator email addresses (e.g., `arivumathi224@gmail.com`).
- `PORT` — HTTP listening port (defaults to `3000`; Cloud Run injects `PORT`).

## Administrator Setup
Administrator privileges are **never** accepted from client payloads or profile fields. Configure `ADMIN_EMAILS` (or `ADMIN_EMAIL`) on the server with verified Google email addresses. The server derives the role after verifying the Firebase ID token; Firestore client rules do not grant administrator access.

## Security Architecture
- **Authentication & RBAC:** Server-side Firebase ID token verification (`verifyIdToken`) with mandatory `email_verified === true` and `ADMIN_EMAILS` allowlist checks.
- **Firestore Security Rules (`firestore.rules`):** Global deny-all default, strict entity schema validation matching `firebase-blueprint.json`, ownership isolation (`citizenUid == request.auth.uid`), admin-only `adminNotes` and `auditLogs`, and zero-PII `publicStats/aggregate`.
- **Upload & Payload Protection:** Browser canvas compression (`<= 240KB`) plus server-side binary magic-byte verification (JPEG/PNG/WEBP only) and zero local filesystem writes for Cloud Run compatibility.
- **API Hardening:** `helmet` headers, `express-rate-limit` on auth and submission endpoints, `512kb` JSON limit, Zod validation, and centralized safe error responses.
- **AI Security:** `GEMINI_API_KEY` remains strictly server-side; citizen text is treated as untrusted data inside structured prompts; every AI response is Zod-validated and guarded by deterministic safety escalation rules.

## API Documentation
- `GET /api/health` — Cloud Run readiness & configuration health check
- `GET /api/auth/me` — Returns verified user identity & server-derived role (`CITIZEN` | `ADMIN`)
- `POST /api/ai/analyze` — Authenticated Gemini Flash + safety rule preview analysis
- `POST /api/complaints` — Validated complaint creation with AI triage, duplicate scoring, history & audit log
- `GET /api/complaints` — Paginated, filtered list of caller's private complaints
- `GET /api/complaints/:id` & `/history` — Ownership-verified complaint details & citizen-visible timeline
- `GET /api/admin/dashboard` — Admin-only aggregated operational metrics & recent audit logs
- `GET /api/admin/complaints` — Admin-only paginated, searchable, sortable grievance queue
- `GET /api/admin/complaints/:id` — Admin-only full triage view including internal notes & duplicate candidates
- `PATCH /api/admin/complaints/:id` — Admin-only status/priority/department/update mutation + audit log
- `POST /api/admin/complaints/:id/notes` — Admin-only internal note creation + audit log
- `POST /api/admin/seed-demo` — Admin-only clearly labeled demonstration dataset seeder (`isDemo: true`)
- `GET /api/public/statistics` & `/trends` — Unauthenticated anonymized aggregate metrics (zero PII)

## Running & Testing
```bash
bun install --frozen-lockfile  # Install the locked dependencies
bun run dev                    # Start Express + Vite dev server on port 3000
bun run build                  # Build production Vite bundle into dist/
bun run start                  # Run production server (NODE_ENV=production)
bun run typecheck              # Run strict TypeScript compiler check
bun run lint                   # Run TypeScript check + ESLint (including Firestore rules audit)
bun run test                   # Run unit, integration, accessibility, and Firestore rules tests
bunx playwright install chromium  # Install the browser used by real-browser tests
bun run test:e2e               # Run Chromium accessibility and routing tests
bun run test:emulator          # Run Firestore rules tests (Java 21 required)
```
