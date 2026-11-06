# One-click portfolio guest showcase

Share `/demo` on the public MediVault site, or use **Try live demo** on the homepage. Visitors choose Patient, Doctor or Hospital and enter a populated temporary workspace without registration or a shared password. Bots/link previews loading the page do not provision accounts; creation requires clicking a role button.

## Experience

Each workspace contains three fictional identities, three readable PDF records, patient-entered vitals, two appointments, consented doctor access, a pending request, notifications and audit activity. Visitors can approve access as the patient, switch to the doctor to see the record, and explore hospital uploads/scheduling. All roles use the existing application APIs and dashboard components.

The guest toolbar provides role switching, sample-data reset, fictional contact addresses and exit. Appointment forms offer demo participant shortcuts. Reload preserves the current guest role. Reset remounts the dashboard with fresh account/document IDs and invalidates prior role tokens. Entering from a signed-in ordinary account preserves its session locally in the tab and restores it on exit; ordinary login/registration remain available.

The session lasts two hours from creation. Switching/resetting does not extend expiry or replenish activity, upload or AI allowances. Exit closes the entire guest workspace. Expired sessions fail authentication immediately. Cleanup removes guest users, records, chats, audit data and encrypted files; aggregate daily counters and hashed throttling keys remain for usage control. Downloaded files and platform request logs have their own retention behavior.

## Boundaries

`users.demo_workspace_id` marks session-only guest identities. They are not administrator accounts and are not marked email-verified or professionally approved. Guest clinical access is an explicit sandbox exception, including when ordinary provider approval enforcement is enabled. Requests cannot cross into ordinary accounts or another guest workspace.

Authenticated requests check exact email/UUID references against workspace membership. Guest routes have an explicit allowlist; identity changes, verification mail, administrator operations, arbitrary roles and reindexing are excluded. Multipart target validation runs after parsing. Database triggers also reject cross-workspace document, grant, access-request, appointment, interaction, emergency, audit and chat-citation relationships. Existing role/document permissions still apply within a visitor's workspace.

Guest uploads use the same AES-256-GCM encryption and wrapped data keys as the vault, with ciphertext stored in the expiring `demo_files` database table. They never enter the permanent R2 bucket. Storage context uses AsyncLocalStorage and validates the workspace prefix. Workspace reset/expiry cleanup deletes these files together with the owning demo data.

Sample PDF text is pre-indexed locally; guest retrieval uses authorized SQL full-text ranking over its sample chunks. Normal account retrieval continues to use pgvector embeddings. Live guest chat, read-only agent gathering, citations and summaries use the configured hosted AI, with bounded history/output and no per-visitor embedding requests. Guest AI is not a prerecorded response; provider failures/usage exhaustion surface in the UI.

## Limits and operations

Current server policy (`server/src/demoPolicy.js`):

- Two-hour session; two resets; two uploads up to 1 MB each.
- Four AI requests and 500 total bounded guest requests per workspace. Identity/status/switch requests count; reset/exit remain available to finish the session.
- 8 KB JSON updates and 2,000-character AI questions.
- Ten new sessions per IP per hour, 30 active workspaces, and 100 new workspaces per database day.
- 80 actual guest model calls per database day, short per-call timeouts, two agent steps, no guest model retries, and bounded answer length. A single chat can use multiple calls. Ordinary-account AI does not consume the guest allowance.

Apply migrations 0014 and 0015 before deploying. SQL migrations are authoritative; the Drizzle declarations mirror the guest tables.

Configure server-only environment settings:

- `DEMO_ENABLED=true`: enables provisioning and guest sessions. False pauses guest access while normal accounts continue.
- `DEMO_AI_MODEL`: a compatible fast tool-capable model on the existing AI endpoint; this rollout uses `gemini-3.1-flash-lite`.
- Existing AI credentials, database and document key ring are reused. No new provider/account is required for guest entry.
- `CRON_SECRET`: random server secret for `/api/internal/demo-cleanup`. It is never sent to guests or checked into Git.

`vercel.json` schedules expired-workspace cleanup once daily, with additional bounded cleanup when a new visitor starts. The endpoint uses Vercel's bearer secret mechanism. See [Vercel cron security](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs) and [daily scheduling limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing). A schedule is not evidence that its future invocation has run; manually verify the protected handler during rollout. Operators can run `npm run demo:cleanup` against their configured database.

## Verification

- `npm test`: deterministic policy, token, crypto, agent and PDF checks.
- `npm run test:demo:api`: isolated real PostgreSQL/HTTP boundaries, role lifecycle, multipart scoping, reset, caps, expiry and cleanup. No hosted AI or permanent object storage used.
- `DEMO_E2E_LIVE_AI=true npm run test:e2e:demo`: headless Chromium, real isolated database/API, all guest role tabs, sharing, scheduling, live cited Gemini answers, PDF summaries, multiple visitors, reset, themes, responsive layouts and normal-session restoration. Without the flag, external AI calls are skipped.
- Existing care, identity, security, dashboard and homepage suites cover ordinary-account regressions. Guest/identity/security browser suites share ports 3003/5179 and must run sequentially.

The guest browser suite needs local PostgreSQL and the existing Playwright install, but no Docker, MinIO or downloaded Ollama model. Test data is removed in finally. Hosted verification must end every created guest session and check the cleanup endpoint without removing another visitor's active workspace. Evidence is stored under `docs/guest-demo`.
