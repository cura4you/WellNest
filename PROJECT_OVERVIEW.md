# WellNest Project Overview

## 1) Project Name and One-Line Description
- **Project name:** `medivault-react`
- **One-line description:** WellNest is a secure, role-based medical records platform where patients, doctors, and hospitals manage encrypted records, consented access, emergency access, and AI-assisted report summaries.

## 2) Core Problem It Solves (The Why)
Healthcare records are typically fragmented across hospitals and providers, which causes delays, repeated tests, and unsafe care decisions (especially during emergencies). WellNest addresses this by:
- Centralizing patient records under patient ownership
- Enforcing explicit, auditable access control
- Enabling emergency break-glass access with guardrails
- Making records easier to understand through AI summaries

## 3) Complete Tech Stack
### Languages
- JavaScript (frontend + backend)
- TypeScript (Drizzle schema/config)
- SQL (database migrations)

### Frontend
- React 19
- React Router 7
- Vite 7
- Custom CSS components/pages for landing, auth, and dashboards

### Backend/API
- Node.js + Express 5
- `cors` (origin controls)
- `multer` (file upload handling)
- `bcryptjs` (password hashing)
- `express-rate-limit` (auth endpoint protection)
- `dotenv` (environment loading)

### Authentication/Session
- Custom HMAC-signed bearer token session flow (`SESSION_SECRET`)
- Role-aware protected routes and backend middleware

### Data and Storage
- PostgreSQL via `pg`
- Drizzle schema/migrations in `db/`
- S3-compatible object storage via `@aws-sdk/client-s3` (`server/src/storage.js`); MinIO in Docker locally

### AI
- Configurable OpenAI-compatible endpoint (`AI_BASE_URL`); hosted Gemini in production and optional Ollama for local development.
- Separate configurable summary, chat, planner and embedding models; see the current deployment and agent runbooks.
- Optional bearer key from `AI_API_KEY` (legacy `GEMINI_API_KEY` still implies OpenRouter)

### Tooling
- ESLint 9
- `concurrently` for running frontend + backend together

## 4) Top 5 Key Features
1. **Role-based platform and dashboards**
   - Separate flows for patient, doctor, and hospital users.

2. **Secure document vault**
   - Upload/download flows with encryption metadata and strict authorization checks.

3. **Consent and access governance**
   - Access requests, approve/reject, document grant issuance, revoke (single and bulk).

4. **Emergency access workflow**
   - Doctor/hospital can initiate 24-hour emergency access with audit tracking.

5. **AI medical document summarization**
   - Generates structured summaries and highlights from uploaded records.

## 5) Setup and Run Instructions
### Prerequisites
- Node.js (LTS recommended)
- npm
- PostgreSQL database
- Docker (MinIO for document uploads) and optionally Ollama (AI summaries)

### Step-by-step
1. Install dependencies:
   - `npm install`

2. Configure frontend env (`.env`):
   - `VITE_API_BASE_URL=http://localhost:3001`
   - `VITE_ENABLE_MOCK_AUTH=false` (set `true` if you want mock auth mode)

3. Configure backend env (`.env.server` or `.env` used by server):
   - `DATABASE_URL=...`
   - `SESSION_SECRET=...`
   - `API_PORT=3001` (optional)
   - `API_HOST=0.0.0.0` (optional)
   - `ALLOWED_ORIGINS=http://localhost:5173` (optional)
   - `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (required for uploads; `docker compose up -d` starts MinIO)
   - `S3_BUCKET=medivault-documents` (optional)
   - `AI_BASE_URL`, `AI_MODEL` (required for the AI summary endpoint), `AI_API_KEY` (only for hosted providers)

4. Prepare database schema:
   - Use SQL migrations in `db/migrations/`
   - Or run Drizzle commands:
     - `npx drizzle-kit generate`
     - `npx drizzle-kit migrate`

5. Start development:
   - Full stack: `npm run dev:all`
   - Frontend only: `npm run dev`
   - API only: `npm run dev:api`

6. Production build (frontend):
   - `npm run build`
   - Preview: `npm run preview`

## 6) Demo Links, Hosted URLs, or Screenshots
### Hosted/demo URL
- Production: https://medivault-roan-six.vercel.app/

### Local demo assets/docs present
- `public/carousel/slide-1.png`
- `public/carousel/slide-2.png`
- `public/carousel/slide-3.png`
- `public/carousel/slide-4.png`
- `public/docs/WellNest-Architecture.pdf`
- `public/docs/WellNest-Team-Briefing.docx`

## 7) Team Name and Member Names (If Found)
- No explicit team name (separate from "WellNest") found in the current code/config.
- No explicit member name list found in current code/config.
- Text references found:
  - "Team Briefing"
  - "For Team Use Only"

## 8) Hackathon Name
- Mention found: **"Hackathon 2026"**
- A specific branded hackathon event name is not explicitly present in current repo files.

## 9) Future Improvements / TODOs Mentioned
1. **Storage scale migration path**
   - Move blob payloads from DB storage to object storage via backfill when scaling.

2. **Account security operations**
   - Session revocation, password change and recovery flows are implemented. Configure recovery email delivery; see SECURITY_OPERATIONS.md.

3. **Legacy-path cleanup opportunities**
   - Some code comments indicate legacy compatibility branches that can be retired after full migration.

---

## Notes on Source Accuracy
- This overview is based on currently available repository files and code paths.
- Historical sections may predate current releases. Current security behavior is documented in SECURITY_OPERATIONS.md; rollout evidence is under docs/account-security.
