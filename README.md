<div align="center">

# 🏥 MediVault

### *Encrypted. Consent-driven. AI-augmented. Patient-first.*

[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![MinIO](https://img.shields.io/badge/MinIO_(S3)-C72E49?style=for-the-badge&logo=minio&logoColor=white)](https://min.io/)
[![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.com/)

Maintained by [@moh0405](https://github.com/moh0405)

</div>

---

## 🩺 The Problem

> Every year, patients repeat tests, face delayed diagnoses, and receive unsafe care — all because their records are scattered across different hospitals and providers.

Healthcare data is **fragmented**, **inaccessible**, and **out of the patient's hands**. In emergencies, this costs lives.

**MediVault fixes this.**

---

## 💡 What is MediVault?

MediVault is a **secure, role-based medical records platform** that puts patients in full control of their health data. Patients own their records. Doctors request access. Hospitals stay accountable. AI makes it all understandable — and can answer questions about it, citing its sources.

- 🔐 **Patient-owned encrypted records**
- ✅ **Explicit, auditable consent flows**
- 🚨 **Emergency break-glass access with guardrails**
- 🤖 **AI-powered report summaries and retrieval-augmented chat**

---

## ✨ Key Features

| Feature | Description |
|--------|-------------|
| 🧑‍⚕️ **Role-Based Dashboards** | Separate, purpose-built flows for Patients, Doctors, and Hospitals |
| 🗄️ **Secure Document Vault** | Encrypted upload/download with strict role-based authorization |
| 🤝 **Consent & Access Governance** | Request, approve, reject, grant, revoke — full lifecycle control, with a full audit trail |
| 🚨 **Emergency Access Workflow** | Time-boxed break-glass access for treating clinicians, fully audited |
| 🤖 **AI Medical Summarization** | Structured summaries of uploaded records from a local vision model (Ollama) or any OpenAI-compatible API |
| 💬 **AI Chat with RAG** | Ask natural-language questions about your own accessible documents; answers are grounded in retrieved excerpts (pgvector) and cite the source document, not freeform generation |
| 💊 **Drug Interaction Checker** | Cross-checks a patient's current medications against known interaction pairs |
| 📜 **Full Audit Log** | Every access, grant, revoke, upload, and AI action is logged per patient |

---

## 🛠️ Tech Stack

### Frontend
- ⚛️ React 19 + React Router 7
- ⚡ Vite 7
- 🎨 Custom CSS (landing, auth, dashboards) — no Tailwind or component library
- 🎨 Patient, Doctor, and Hospital dashboards use the shared TypeScript design system in `src/dashboard-v2/`. See **Project Status** below.

### Backend
- 🟢 Node.js + Express 5
- 🔑 Custom HMAC-signed bearer token auth (role-aware)
- 🛡️ Rate limiting, CORS controls, bcrypt password hashing

### Data & Storage
- 🐘 PostgreSQL (`pg`, plain SQL migrations in `db/migrations/`) with the `pgvector` extension for embeddings
- 🪣 S3-compatible object storage for encrypted document blobs (MinIO in Docker locally)

### AI
- 🤖 **Summarization/chat completions**: any OpenAI-compatible chat API. Default: local Ollama `qwen2.5vl:7b` (free, vision-capable — reads the document image directly). OpenRouter/GPT-4o or Gemini work via env vars.
- 🔎 **Embeddings (for Chat/RAG)**: a separate OpenAI-compatible `/embeddings` endpoint (`EMBEDDING_BASE_URL`/`EMBEDDING_MODEL`) — the chat-completions endpoint above doesn't necessarily also embed. Documents are chunked, embedded, and stored in `document_chunks` (pgvector); chat retrieves the top-k relevant chunks before answering.

### Tooling
- ESLint 9 · Concurrently · dotenv

---

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS)
- npm
- PostgreSQL database with the `pgvector` extension available
- Docker Desktop (runs MinIO for file storage)
- [Ollama](https://ollama.com/) (optional, for free local AI summaries/chat)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/saniyadesai/medivault.git
cd medivault

# 2. Install dependencies
npm install
```

### Environment Setup

Create a single `.env` file in the project root (you can copy from `.env.example`).

```env
# Frontend (Vite)
# Keep empty to use relative paths (recommended for Vercel rewrites).
VITE_API_BASE_URL=
VITE_ENABLE_MOCK_AUTH=false

# Backend (Node/Express)
DATABASE_URL=your_postgres_url
SESSION_SECRET=your_secret_key
API_PORT=3001
API_HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:5173
NODE_ENV=development

# Object storage (MinIO from docker-compose.yml, or any S3-compatible service)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=medivault
S3_SECRET_KEY=medivault-secret
S3_BUCKET=medivault-documents
S3_REGION=us-east-1

# AI summaries (any OpenAI-compatible chat API; local Ollama by default)
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5vl:7b
AI_API_KEY=
AI_TIMEOUT_MS=300000

# Chat + RAG embeddings — needs its own embedding-capable endpoint.
# AI_BASE_URL above is chat-completions only and doesn't necessarily also embed.
EMBEDDING_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_API_KEY=
EMBEDDING_DIMENSIONS=768
RAG_TOP_K=5
RAG_CHUNK_SIZE=1200
RAG_CHUNK_OVERLAP=200
```

### Local Services (Docker + Ollama)

```bash
# File storage: MinIO on :9000 (console on :9001). Reads S3_ACCESS_KEY / S3_SECRET_KEY from .env
docker compose up -d

# AI summaries (optional, free): install Ollama, then pull the vision model once (~6 GB)
ollama pull qwen2.5vl:7b
```

To use OpenRouter instead of Ollama set `AI_BASE_URL=https://openrouter.ai/api/v1`, `AI_MODEL=openai/gpt-4o`, and `AI_API_KEY` to your key.

### Database Setup

```bash
# pgvector must be enabled BEFORE migration 0009 runs (it creates a vector column)
# brew install pgvector   # if using Homebrew Postgres and it's not already available
createdb medivault
psql -d medivault -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Apply the SQL migrations in order (PostgreSQL 14+)
for f in db/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d medivault -f "$f" || break; done
```

As of this writing there are 10 migration files, through `0010_patient_gender.sql`. Always apply every file in order — a database built from an earlier subset will 500 on requests that touch newer columns/tables rather than failing loudly at startup.

### Run the App

```bash
# Full stack (recommended) — frontend on :5177, API on :3001
npm run dev:all

# Frontend only (mock auth, no backend needed — set VITE_ENABLE_MOCK_AUTH=true)
npm run dev

# Backend only
npm run dev:api

# Production build
npm run build
npm run preview
```

### Vercel Deployment

Vercel runs the React build as static files and the Express app as one serverless function (`api/server.js`). Ollama and MinIO are local-only, so production needs hosted equivalents. All of them have free tiers:

| Need | Recommended | Also works |
|---|---|---|
| PostgreSQL (with pgvector) | [Neon](https://neon.tech) (free tier; also available as the Vercel Postgres integration; supports the `vector` extension) | Supabase, Railway, RDS |
| S3-compatible bucket | [Cloudflare R2](https://developers.cloudflare.com/r2/) (10 GB free, no egress fees) | AWS S3, Backblaze B2, Supabase Storage |
| Vision-capable model | [Google AI Studio](https://aistudio.google.com) Gemini API, free tier, OpenAI-compatible endpoint | Groq (free tier), OpenRouter (paid) |
| Embeddings model | Google AI Studio `gemini-embedding-001` via the same OpenAI-compatible endpoint | Any OpenAI-compatible `/embeddings` endpoint |

**1. Create the services**

- Neon: create a project, copy the connection string (it ends in `?sslmode=require`), then run `CREATE EXTENSION IF NOT EXISTS vector;` against it once (Neon supports pgvector natively).
- R2: create a bucket named `medivault-documents`, then *Manage R2 API Tokens → Create API token* with Object Read & Write on that bucket. Note the Access Key ID, Secret Access Key, and the S3 endpoint `https://<account-id>.r2.cloudflarestorage.com`.
- Gemini: create an API key in AI Studio (used for both chat completions and embeddings).

**2. Apply the migrations to the hosted database** (from your machine, once per new database):

```bash
DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require' npm run db:migrate
```

The runner records applied files in `schema_migrations`, so re-running is safe. If the database was already migrated by hand, baseline it first with `npm run db:migrate -- --mark-applied`.

**3. Import the repo in Vercel** (or `vercel link` from the CLI). Build settings come from `vercel.json`.

**4. Environment variables** (Project Settings → Environment Variables, or `vercel env add NAME production`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 API token pair |
| `S3_BUCKET` | `medivault-documents` |
| `S3_REGION` | `auto` for R2 (`us-east-1` etc. for AWS) |
| `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_MODEL` | `gemini-3.6-flash` (list the models your key can use with `curl "https://generativelanguage.googleapis.com/v1beta/models?key=$AI_API_KEY"` — Gemini periodically retires older model names) |
| `AI_API_KEY` | Gemini API key |
| `AI_TIMEOUT_MS` | `50000` (must stay under the function's 60 s `maxDuration` in `vercel.json`) |
| `EMBEDDING_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `EMBEDDING_MODEL` | `gemini-embedding-001` |
| `EMBEDDING_API_KEY` | Same Gemini key, or a separate one |
| `EMBEDDING_DIMENSIONS` | `768` |
| `ALLOWED_ORIGINS` | your production URL, e.g. `https://medivault.vercel.app` |
| `NODE_ENV` | `production` |

Leave `VITE_API_BASE_URL` **unset** in production: the frontend then uses relative `/api` URLs, which `vercel.json` rewrites to the function. Do not set `VITE_ENABLE_MOCK_AUTH` in production; it would make the site keep accounts in each visitor's browser instead of the database.

**5. Deploy** (`vercel --prod`, or push to `main` once the Git integration is on) and check `https://<your-app>.vercel.app/health` returns `{"ok":true}`.

Operational notes:
- `/api/*`, `/auth/*`, and `/health` are rewritten to the Express serverless function in `api/server.js`; everything else serves `index.html` so React Router works on refresh.
- Vercel serverless functions reject request bodies over 4.5 MB, so uploads are capped at 4 MB when `VERCEL` is set (20 MB locally).
- `maxDuration` is 60 s on the Hobby plan; the AI call must finish inside it. Gemini Flash usually answers in a few seconds.
- The bucket must already exist; the function does not create it (only the local `npm run dev:api` does).
- TLS to Postgres is enabled automatically for non-localhost `DATABASE_URL`s (`server/src/db.js`); set `DATABASE_SSL=false` to override.

---

## 📐 Architecture

> See full architecture diagram: [`public/docs/MediVault-Architecture.pdf`](public/docs/MediVault-Architecture.pdf)

```
┌───────────────────────────────────────────────┐
│                React Frontend                  │
│      Patient · Doctor · Hospital Dashboards    │
└──────────────────┬──────────────────────────────┘
                   │ HMAC Bearer Token Auth
┌──────────────────▼──────────────────────────────┐
│             Express API (Node.js)               │
│  Auth · Records · Consent · Emergency · Chat    │
└──────┬───────────┬──────────────┬───────────┬────┘
       │           │              │           │
  ┌────▼────┐ ┌────▼─────┐ ┌─────▼──────┐ ┌──▼──────────┐
  │PostgreSQL│ │ MinIO/S3 │ │ Ollama /   │ │ Embeddings +│
  │ +pgvector│ │(Documents│ │ OpenAI-    │ │ pgvector    │
  │  (Data)  │ │  Blobs)  │ │ compatible │ │ RAG search  │
  │          │ │          │ │ (Summaries)│ │ (Chat)      │
  └──────────┘ └──────────┘ └────────────┘ └─────────────┘
```

---

## 🧭 Project Status

The Patient, Doctor, and Hospital dashboards share the plum/berry TypeScript design system in `src/dashboard-v2/`. Patient tabs were migrated first; Doctor and Hospital now use matching cards, lists, forms, and notifications throughout. The shared emergency access screen uses the same visual system and describes the actual consented, audited access flow. Patient Health Vitals and Upcoming Appointments are still explicitly labeled sample data because no backend source exists for them.

The latest Doctor/Hospital design changes are currently local and have not been deployed. See `CLAUDE.md` for implementation history and local setup notes.

---

## 🗺️ Roadmap

- [ ] **Object storage migration** — Backfill blob payloads from DB to object storage at scale
- [ ] **Token revocation table** — `revoked_tokens` for immediate session invalidation
- [ ] **Legacy path cleanup** — Retire compatibility branches post-migration
- [ ] **Mobile app** — React Native patient portal
- [ ] **HL7 FHIR integration** — Interoperability with hospital systems
- [x] **Doctor/Hospital dashboard redesign** — Extend the `dashboard-v2` design system across all role tabs

---

<div align="center">

**MediVault** — *Encrypted. Consent-driven. AI-augmented. Patient-first.*

⭐ Star this repo if you found it useful!

</div>
