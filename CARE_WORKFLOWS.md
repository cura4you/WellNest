# Care workflows

Patient-entered vitals, participant-scoped appointments, and persistent in-app notification preferences use migration `0011_care_workflows.sql`. Apply migrations with `npm run db:migrate` before starting the API. Fresh-database migrations are exercised by the browser suite.

## Patient vitals

Patients can record heart rate (bpm), paired systolic/diastolic pressure (mmHg), glucose (mg/dL), measurement time and optional notes, then review or delete their latest 100 entries. The Overview shows real recorded values and dates instead of sample measurements. No clinical interpretation or normal-range classification is inferred. These entries are private to the patient; a scheduled appointment does not expose them to a clinician.

- `GET /api/vitals`
- `POST /api/vitals`
- `DELETE /api/vitals/:id`

The server derives the patient from the authenticated account, validates numeric values and timestamps, and rejects clinician access. Source measurements should use the displayed units; device ingestion is not connected.

## Appointments

All three dashboards have an Appointments view and an Overview preview. The other participant must already have a MediVault account. Patients request a doctor/hospital appointment; providers can create a confirmed appointment for a patient. Providers confirm requests. Either participant can reschedule or cancel; patient rescheduling requires renewed confirmation. Only the provider can complete a confirmed visit after its start time.

- `GET /api/appointments` (latest 200 matching appointments)
- `POST /api/appointments`
- `PATCH /api/appointments/:id` with `action` and the current `version`

Actions are restricted to the assigned patient/provider. Transactions lock both schedules in a consistent order, reject overlapping requested/confirmed bookings, update versions to prevent stale changes, and retain an `appointment_events` audit trail. Requested slots reserve the time until cancelled. Times are stored as instants in PostgreSQL and displayed in the browser's time zone. Scheduling does not grant document or profile access.

This is local appointment coordination, not provider availability discovery, calendar synchronization, video consultation, or a reminder delivery service. No third-party credentials are required for these workflows.

## Notifications

Preferences are saved per account and control new in-app alerts for access requests, access changes, emergency access, document uploads and appointment changes. Document alerts default off; the other categories default on. Existing notifications remain in the inbox after a preference is disabled. Marking an inbox entry as read persists. Refresh buttons load changes made by other participants.

- `GET /api/notification-preferences`
- `PUT /api/notification-preferences/:category` with boolean `enabled`
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`

Email/SMS delivery is not connected. Such integrations would require a chosen provider and account credentials.

## Local preview and browser verification

The existing `.env` can retain hosted service settings. `npm run dev:local` explicitly uses local PostgreSQL, the running `medivault-minio-1` container, and native Ollama without changing the private `.env`. It reads local MinIO credentials from the container without printing them. The frontend is at http://localhost:5177 and the API at http://localhost:3001.

Required local models:

```sh
ollama pull qwen2.5vl:7b
ollama pull nomic-embed-text
```

For the existing Playwright installation:

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e:care
```

If Playwright is missing, install it in `.claude/skills/run-medivault` using that directory's package file, then run `npx playwright install chromium` there. PostgreSQL must permit creating a local test database; Docker/MinIO and Ollama must already be running. Test ports 3002 and 5178 must be free.

The Playwright suite creates an isolated database and MinIO bucket, applies every migration, registers synthetic accounts through the real UI, and tests real API/storage/model responses. It checks persistence across reload/login, role boundaries, booking conflicts/concurrency, status transitions, inbox suppression/read receipts, document sharing/download, interaction notes, profile saves, emergency access/expiry/consent, real local AI summary and cited RAG chat, and all dashboard tabs at desktop/mobile widths. It fails on application console errors or API 5xx responses. Test data and storage are removed in `finally`; logs, screenshots and a JSON report remain under the printed `/private/tmp/medivault_care_e2e_*` directory.

The AI checks exercise the existing RAG path. Activation/evaluation of the optional multi-step agent remains covered separately by `AGENTIC_CHAT_RUNBOOK.md`.
