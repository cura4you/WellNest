# CLAUDE.md

Project notes and in-progress decisions for MediVault, kept here so context survives across sessions. For the stable "what is this project" overview (features, full tech stack, setup, deployment, architecture) see `README.md` — this file is the working log: environment quirks, design decisions and their history, and exactly what's done vs. not on the in-progress branch.

## Stack

- Frontend: React 19 + Vite (plain CSS, no Tailwind/component library — see `src/index.css` for the current marketing-site design tokens)
- Backend: Express API (`server/`)
- AI: chat/RAG over pgvector; vision model `qwen2.5vl:7b`
- Storage: MinIO (S3-compatible), self-hosted in Docker (`docker-compose.yml`, quay.io image) — replaced Appwrite
- AI provider: native Ollama (Metal GPU, already installed) — replaced OpenRouter; configurable via `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY`
- DB: local PostgreSQL 17 via Homebrew, `medivault` database, all migrations applied

**Why self-hosted:** cost — the user wants everything runnable locally with no paid API keys/services. Prefer local/self-hosted options for any new external dependency; don't suggest paid SaaS without asking.

## Dev environment (this machine)

- Port 5173 is occupied by another local project (`deal-me-in`) — MediVault runs on **5177** instead. Use `/run-medivault` (committed skill) to launch; don't assume 5173 is free.
- Docker is not running by default.
- Claude-in-Chrome extension has been unreliable here — headless Playwright Chromium works instead.
- `.env` points `DATABASE_URL` / `VITE_API_BASE_URL` at localhost. The team previously used a Neon cloud DB the user doesn't control; local Postgres is preferred now.

### After a machine restart, checklist before assuming anything is broken

None of these survive a reboot on their own except Postgres (a brew service). Hit these in order before debugging further — a 2026-09-22 session lost real time chasing "summaries broken" / "unauthorized login" that were actually just these:

1. **Docker Desktop** — not running by default (`open -a Docker`, wait for daemon), then `docker compose up -d` for MinIO. Check: `curl http://localhost:9000/minio/health/live` → `200`.
2. **Ollama** — the app usually relaunches itself, but confirm: `curl http://localhost:11434` → `"Ollama is running"`. First request after a cold start can take 5-60s+ while the vision model (`qwen2.5vl:7b`, ~6GB) loads into memory — don't mistake that for it being down.
3. **Local Postgres** — `brew services start postgresql@17` if not already running. **Check every migration in `db/migrations/` has actually been applied to the local `medivault` DB** — it's easy for a migration applied to production (Neon) to never get run locally, and the failure mode is ugly: e.g. migration 0010 (`patients.gender`) missing locally made every single login fail with a generic `column "gender" does not exist` that surfaced in the UI as "Unauthorized. Please log in." Compare columns directly rather than trusting a migrations-tracking table: `psql -d medivault -Atc "select column_name from information_schema.columns where table_name='patients'"`.
4. **The API server itself** — if it was left running from a previous session (`node server/src/index.js` via `nohup`), kill and restart it (`lsof -ti:3001 -sTCP:LISTEN | xargs kill`) rather than trusting a days-old process — it can be holding dead connections to Docker/Ollama from before the restart, surfacing as `ECONNREFUSED` in `/tmp/medivault-api.log` even once those services are back up.
5. Then Vite on **5177** as usual via `/run-medivault`.

## Dashboard redesign (in progress, TypeScript rebuild planned)

> ⚠️ **This branch is a design sample, not a feature branch.** Only the Patient
> dashboard's Overview tab has been rebuilt, and even there Health Vitals and
> Upcoming Appointments are hardcoded sample data with no backend behind them.
> Nothing here is production-ready or merged into `main`. See "Current build
> status" below for the precise done/not-done line.

The dashboard UI (`src/pages/dashboard/*.jsx`, `src/components/dashboard/*.jsx` — currently plain JS/JSX, table-and-nav-list style) is being redesigned from scratch. Work is happening **incrementally, piece by piece** — not as one big rewrite — per user preference.

**Live mockup / design canvas:** https://claude.ai/artifact/Foowa1tdp3BCRe4Cy5sMeV
(Claude Design canvas — the chosen direction is fully interactive; two earlier alternate directions are kept alongside for comparison, not to be deleted without asking.)

### Chosen direction

"Raycast interaction language × healthcare UX rules." Built from two references the user specifically liked:
- **Raycast** (shadcn.io/design/raycast): originally targeted zero drop shadows (depth via a surface ladder instead), hairline 1px borders, Inter font with the `ss03` stylistic set (single-story "g"), restrained/functional layout, one command-bar-style search element. **What actually got built deviates on depth** — see Color system below.
- **Fuselab Creative's healthcare UX article**: red reserved strictly for genuine clinical emergencies — never routine status; green only for normal-range values; blue for trust/informational; tabular figures for vitals/numbers; AI answers should cite their source ("reasoning transparency").

There is no well-known public healthcare dashboard that's both polished and interaction-rich, so the approach is: borrow interaction language from top SaaS products (Linear, Notion, Vercel, Sentry, Mercury/Ramp) and apply it to healthcare-specific content — not copy an existing health app.

### Color system

> **Corrected 2026-09-23.** This section originally documented an amber/copper
> accent (`#E0902E`) as chosen. That was true as of 2026-09-14, but color
> exploration continued afterward (screenshots `palette-sage`, `v3-1/2`,
> `plum-final-*` in `.claude/skills/run-medivault/shots/`, dated 2026-09-17
> through 2026-09-19) and **plum/berry is what actually got built** into
> `src/theme/theme.css` and shipped in the 2026-09-20 commit — amber never
> made it into code. This doc just wasn't updated at the time to reflect that
> pivot. Verified live via `run-medivault` on 2026-09-23: the running app is
> plum/berry with soft card shadows, matching `plum-final-light/dark.png`
> exactly, not the amber/flat-hairline description below that used to be here.

Brand accent: **plum/berry**.
- Core accent: `#a8447f` (light theme) / `#d1689e` (dark theme)
- Text-on-surface variant: `#742959` (light) / `#e6a0c4` (dark)
- Ink on filled accent surfaces: `#ffffff` (light) / `#2b0f20` (dark)
- Canvas has a faint plum tint (`#fbf3f8` light / `#1f0f1a` dark), not neutral gray/white.

Depth uses **soft box-shadows** on cards (`--mv-shadow-card`, `--mv-shadow-toast` in `theme.css`), not the flat hairline-only depth Raycast was originally cited for — a deliberate-looking deviation from the reference, not documented as a conscious choice anywhere, so treat it as the current baseline unless the user says otherwise.

Runs through sidebar active state, avatars, primary buttons, AI assistant accents, icon strokes, and hover states — in **both light and dark mode from one CSS-custom-property token set** (`[data-mv-theme='light']` / `[data-mv-theme='dark']` in `theme.css`), not two separate builds. `prefers-color-scheme` fallback exists; theme switch is instant (no crossfade — a deliberate change from an earlier ~150–200ms crossfade plan, see the comment in `theme.css`: animating that many nodes on toggle was expensive and looked glitchy).

Status colors are kept semantically separate from the brand hue — this matters, don't blur it:
- **Green** = normal/positive vitals only
- **Blue** = informational / pending / unread
- **Red** = emergency action only — never decorative, never routine status

### Interactions (decided via explicit user choice)

Adopted: hover-reveal row actions (Notion/Linear-style — actions appear on row hover, not always visible), animated status changes + toast confirmations (e.g. marking a document verified, marking a notification read), a working light/dark theme toggle.

**Updated 2026-09-24:** search is now functional (see below) — the `⌘K` hint is no longer inert, it actually focuses the search input. The "declined command palette" note above is stale; the user explicitly asked to make search real, so this was built, not a scope violation.

### Current build status (branch: `dashboard-redesign-ts`)

Work lived on the **`dashboard-redesign-ts`** git branch and was kept off `main` for most of this project (explicit user instruction) — **until 2026-09-27, when the user explicitly asked to merge everything into `main`** (still not deployed anywhere: local commit only, no push, no Vercel). That merge is done (`main`'s merge commit brings in every commit listed below). `dashboard-redesign-ts` still exists but `main` is now the branch to work from; treat this section as history of how the redesign got built, not as a live "don't touch main" rule — check with the user again before merging or deploying *future* work, this isn't a standing blanket permission.

Two real conflicts came up in that merge (both resolved, both worth knowing about if you're continuing backend work): `main` had independently gained AI retry/fallback-model logic (`fetchWithRetry`, `callAIChatCompletion` in `server/src/utils.js` and `server/src/app.js`) after the branches diverged — that coexists fine with the age/gender additions below, but if you're editing either function area, know both features' code is now interleaved in the same files. `src/pages/dashboard/PatientDashboardPage.jsx` (the pre-redesign original) is gone; only `.tsx` exists now.

New TypeScript dashboard code lives in **`src/dashboard-v2/`**:
- `DashboardShell.tsx` — the sidebar + topbar shell: collapsible sidebar (expand toggle always visible and inline, not hover-only), 3-column grid topbar with a genuinely centered, **functional** search bar (filters documents/access requests/audit events/notifications already loaded on the dashboard; `⌘K` focuses it; selecting a document opens it, other categories jump to that tab), theme toggle, notification bell, and a profile dropdown on the avatar (name/email + Logout, closes on outside click/Escape).
- `PatientOverview.tsx` — the Overview tab: metrics row (real data), Health Vitals + Upcoming Appointments (still **"SAMPLE DATA"**, no backend for these yet), Recent Documents, Recent Activity, Quick Actions, AI Assistant mini-widget (badged "RAG").
- `StorageVault.tsx`, `AccessRequests.tsx`, `AuditLogView.tsx`, `NotificationsPanel.tsx`, `SettingsPanel.tsx` — the other six Patient tabs, all ported to the same card/row/hover-reveal-action visual language as Overview (see "What's done" below).
- `AiAssistantCard.tsx`, `ToastStack.tsx` / `useToast.ts`, `icons.tsx` (hand-built icon set, not a library), `types.ts` (typed shapes for dashboard data, including `SearchResultItem`).
- Theme system in **`src/theme/`**: `theme.css` (token set) + `useTheme.ts` (light/dark toggle, `prefers-color-scheme` fallback; theme switch is instant, no crossfade — see Color system above). Light theme's main canvas has a subtle gradient echoing the sidebar's treatment; dark theme is untouched/flat, left alone on request.
- `PatientDashboardPage.tsx` composes `DashboardShell` + all seven tab components.

**What's done:** the entire Patient dashboard is now on the new plum/berry design system — Overview, Storage Vault, Access Requests, Audit Log, Notifications, Settings, and AI Chat. AI Chat is a special case: `components/chat/ChatPanel.jsx`'s logic (session management, SSE streaming, citations) was left **completely untouched** — only re-skinned via `.mv-chat`-scoped CSS in `dashboard-v2.css` overriding its existing classnames with `--mv-*` tokens instead of the old marketing-site ones. `DocumentViewer.jsx` and `AISummaryModal.jsx` (opened from Storage Vault) are also untouched — they still depend on `components/dashboard/dashboard.css`, which `PatientDashboardPage.tsx` still imports for exactly that reason (don't remove it without giving those two their own stylesheet first).

Verified end-to-end against the real backend on 2026-09-24: registered a fresh patient + doctor, uploaded a real document, submitted and approved an access request (toast + pill turned green), sent a real AI chat message and got a cited RAG answer, toggled a notification switch, filtered Storage Vault by type, checked dark theme. Zero console/page errors. Along the way, found and fixed a real pre-existing bug: migration `0008_grants_unique_document_grantee.sql` had never been applied to the local DB, so every access-request approval 500'd ("no unique or exclusion constraint matching the ON CONFLICT specification") — applied it directly (file was already committed, just hadn't been run locally).

**What's still old:** the Doctor and Hospital dashboards (`DoctorDashboardPage.jsx`, `HospitalDashboardPage.jsx`) are completely untouched — still the original blue/navy design, not nested in the new shell at all.

**Earlier design exploration** (before the shell above was settled on) is preserved as screenshots in `.claude/skills/run-medivault/shots/`: sidebar layout options (`sidebar-A-*` collapsed/expanded, `sidebar-B-floating`, `sidebar-C-grouped`, `sidebar-D-bold-*`), button styling passes (`sidebar-buttons-fixed/hover`), and full-page palette/layout variants (`palette-sage`, `plum-final-light/dark`, `v3-1-light`, `v3-2-dark`). **`plum-final-light/dark.png` is the closest match to what actually shipped** — see the Color system correction note above; despite the naming, "amber/copper" was never what got built.

**User feedback, 2026-09-23 → resolved 2026-09-24:** user walked through specific Overview-tab issues before allowing further migration (as flagged below) — all addressed in the `DashboardShell.tsx` changes described above (sidebar toggle, search, profile dropdown, topbar centering, light-theme gradient). Once confirmed, user explicitly asked to migrate every remaining Patient tab, which is now done (see "What's done" above). The historical record of what was raised and fixed:
- Collapsed sidebar's expand button was invisible until hover and floated outside the sidebar bounds when it did appear → now always visible, inline, part of the icon rail.
- Topbar search wasn't centered (flex + max-width left asymmetric whitespace) → 3-column grid, genuinely centered.
- No way to reach account actions from the topbar → added the profile dropdown.
- Search was inert (⌘K hint went nowhere) → made functional, scoped to client-side filtering over already-loaded dashboard data (no new backend endpoint).
- Sidebar's gradient look asked about for the main canvas too, light theme only, confirmed not to touch dark theme (user explicitly said dark "looks really good" as-is) → added, scoped via `[data-mv-theme='light']`.

**Follow-up fixes, 2026-09-25/26** (found via user testing after the full-tab migration above):
- Access Requests: Approve/Reject on a pending request were wrapped in the hover-reveal class — invisible until hovered. These are consequential actions, not decorative ones; made always visible (`AccessRequests.tsx`).
- Storage Vault: the type `<select>` and date `<input>` filters rendered at different heights despite identical CSS (native `type="date"` carries its own calendar-icon chrome `<select>` doesn't) — normalized both to an explicit `height`/`box-sizing`, replaced the select's native arrow with a custom one.
- **Type/component scale-up**: user compared against the old design (bold Poppins headings up to 36-48px) and found the new dashboard "everything looks so much smaller." Root cause wasn't the font (Inter isn't smaller-reading than Poppins) — the new design never stepped up to a true heading size anywhere; topbar title and card titles both sat in body-text range (13-15px). Fixed in two passes: (1) topbar title 15px→20px/700, card titles 13.5px→15.5px/700; (2) user asked for components generally bigger too, so did a coordinated increase across stat tiles (value 23px→28px), card/row padding, row text, buttons, nav items, avatars, icon buttons, search bar, and all form controls (select/date/text inputs unified to 38px height), plus sidebar width 250px→264px to match. Verified in both themes, no layout breakage.
- Sidebar "MediVault" logo was inert decoration — wrapped it in a button using the existing `onHome` handler so it navigates to `/` like the sidebar's "Home" link already does.

**Full navigation/API audit, 2026-09-27** (user asked to "go over the whole dashboard" for broken hyperlinks and API issues, on `main` post-merge):
- Overview's 4 metric tiles (Documents/Pending Requests/Active Grants/Audit Events) were static, non-clickable — now route to Storage Vault / Access Requests / Access Requests (no dedicated grants tab exists) / Audit Log respectively (`PatientOverview.tsx`).
- Quick Actions: "Upload Document" relabeled "View Documents" (patients get a 403 on the actual upload endpoint — only doctors/hospitals can upload; the button always navigated correctly, just to a page with no upload capability, so the label was the lie). "Emergency Card" navigated nowhere (fake toast) — Emergency Access is doctor-initiated only, no patient-side equivalent exists, so it now goes to Settings, where the actual patient-editable emergency info (blood group/gender/emergency contact) lives.
- **DocumentViewer/AISummaryModal theme mismatch** (Storage Vault's View/AI Summary actions): both are shared with the untouched Doctor dashboard, so were left in their original teal/purple styling regardless of the app's light/dark toggle. Fixed via `.mv-root`-scoped CSS overrides in `dashboard-v2.css` (Doctor dashboard, not wrapped in `.mv-root`, is completely unaffected — verified via screenshot). `VerifiedStamp.jsx`'s brand color was hardcoded into SVG attributes (CSS can't touch those) — gave it a `color` prop (default: the original teal) threaded through `DocumentViewer` as `verifiedColor`, passed as `var(--mv-accent-text)` only from the Patient dashboard's usage.
- **Real bug, unrelated to the redesign but found via this audit: session was lost on every hard page refresh, for every role**, not just Patient — `ProtectedRoute` read `isAuthenticated` before `AuthContext`'s mount effect had restored the session from localStorage, so the first render's pre-hydration `false` triggered an immediate redirect to login, even with a valid non-expired token sitting right there. Fixed with an `initializing` flag on `AuthContext` that `ProtectedRoute` waits on before deciding whether to redirect. This was invisible in normal SPA navigation (client-side route changes don't remount the provider) — only manifested on an actual hard reload/direct URL load, which is exactly the kind of thing repeated Playwright `page.goto()` calls surface but a person clicking through the UI mostly wouldn't hit.

## Homepage/marketing-site color migration (done, 2026-09-27)

Separate from the dashboard-v2 TypeScript rebuild above — this is the plain marketing site (`src/pages/LandingPage.jsx`, `src/index.css`, `src/components/{Navbar,Hero,Features,FlowSection,CTA,Footer}.jsx`, `src/components/auth/auth.css`), which never got a TypeScript rebuild, just a color pass to match the plum brand.

**Approach:** section by section (Navbar → Hero → Features → Flow → CTA/Footer → auth pages), each verified live and committed separately, matching the same incremental style as the dashboard. Reused the exact same hex values already established in dashboard-v2/theme.css (`#a8447f`/`#742959` light accent, `#2b0f20` ink, `#7a4560`/`#4a1f38` muted/body text, `#fbf3f8`/`#fdf7fb` canvas tints, and the sidebar's dark gradient `linear-gradient(165deg, #3d1230, #2b0f20, #200a18)` reused verbatim for `.navbar`/`.footer`/`.auth-shell-brand` — three separate dark surfaces made intentionally identical, not just "in the family") — no new color decisions, just applying what already existed.

**Key mechanical constraint throughout:** most marketing-site CSS reads from shared root tokens (`--deep-twilight`, `--bright-teal`, `--muted-text`, etc.) or the shared global `.btn-primary`/`.btn-outline` classes — touching those directly would have re-themed every section at once, defeating "section by section." Each section's colors were instead hardcoded directly on that section's own dedicated classes (`.hero-*`, `.feature-card`, `.flow-tab`, `.cta-box`, `.auth-*`...), and any shared button classes were overridden via descendant selectors scoped to that section (`.navbar .btn-primary`, `.hero-ctas .btn-primary`, `.auth-role-card .btn.btn-primary`, etc.) rather than editing `.btn-primary` itself. The root tokens are still their original teal/navy values — nothing there was ever touched, and nothing should assume they're plum.

**A note on process:** the user initially asked to "redefine the whole homepage" — floated a bolder, more expressive dark-hero redesign (mocked as a mockup on `https://claude.ai/artifact/NeAdgFwQcLAHPA47JFoZks`, dark plum-to-black hero, Unbounded/Plus Jakarta Sans, stat strip). User reviewed it and preferred the current structure/content ("this one can be used by others" — a live product isn't the place to gamble on an untested redesign) — reverted to the conservative color-only migration path described above, which is what actually shipped. That artifact is a rejected direction, not a roadmap; don't treat it as upcoming work without the user raising it again.

One real gap found and fixed along the way (not a color issue): `AuthRoleEntryPage.jsx`'s "Login/Register as &lt;Role&gt;" buttons on the role-selection page reach for the bare `.btn.btn-primary` class with no `.auth-*` class alongside it — missed on the first auth-pages pass (still teal) until a follow-up screenshot caught it. If another shared-class button turns up unstyled somewhere, check for exactly this pattern (a component using the global button class directly, with no page-specific class to hang a scoped override off of).

## Doctor/Hospital dashboard rebuild (started 2026-09-27)

User confirmed full TypeScript rebuild (same depth as Patient), not just a color pass like the homepage got. Same rollout strategy as Patient: generalize the shared shell first, ship each role's Overview tab, leave the rest on old JSX/styling temporarily nested in the new shell, then reskin tab-by-tab afterward.

**`DashboardShell.tsx` generalized** — was Patient-only (hardcoded `NAV_GROUPS` keyed to `PatientView`, hardcoded `"Patient"` role label, bell hardcoded to `onViewChange('notifications')`). Now `DashboardShell<V extends string>`, taking `navGroups`, `roleLabel`, and `onNotificationsClick` as props. `NavItem`/`NavGroup` in `types.ts` are generic (`<V extends string = string>`) so this didn't require touching every callsite's types. Verified Patient still works identically post-refactor before building on top of it.

**Doctor** (`DoctorDashboardPage.tsx`, `DoctorOverview.tsx`): new shell + Overview shipped. Overview has real clickable metrics (Active Grants/Request History/Emergency Access/Shared Documents — routed to whichever tab the number actually means), Recently Shared Documents + Recent Activity cards (real data, same hover/click patterns as Patient), Quick Actions with all-real destinations from the start (the Patient Overview's fake-toast mistake was not repeated here). The other 10 tabs (Shared Documents, Active Grants, Request Access, Request History, Activity Log, Emergency Access, Drug Interactions, Chat, Settings, Notifications) still run their original JS logic and old visual styling, just nested in the new shell — fully functional, not yet reskinned. `EmergencyAccess.jsx`/`DrugInteractions.jsx` in particular still look completely old (navy/blue biometric-scanner theme, old form styling) — expected, not a bug.

**Hospital** (`HospitalDashboardPage.tsx`, `HospitalOverview.tsx`): same treatment. Overview real (Recent Uploads + Compliance & Audit cards, Quick Actions). Upload Queue, Staff Access, Compliance & Audit, Emergency Access, Chat, Settings, Notifications still old.

Added `PillIcon`/`StethoscopeIcon`/`BuildingIcon` to `icons.tsx` for Drug Interactions/Doctor/Hospital-specific nav items. Added `DoctorView`/`DoctorDashboardData` and `HospitalView`/`HospitalDashboardData` (plus their row types: `GrantedAccessRow`, `RequestHistoryRow`, `SharedDocumentRow`, `UploadQueueRow`, `StaffAccessRow`) to `types.ts`, matching the exact shapes `dashboardApi.js`/the server already return.

A mechanical gotcha hit twice while doing this: renaming `DoctorDashboardPage.jsx`→`.tsx` (same for Hospital) left Vite's dev-server module graph confused (`Pre-transform error: Failed to load url .../DoctorDashboardPage.jsx ... Does the file exist?`) until the dev server was restarted — a plain HMR reload wasn't enough. If a file gets renamed across extensions mid-session, restart Vite before testing rather than debugging what looks like a real error.

### Next steps

- Reskin Doctor's and Hospital's remaining tabs to the plum dashboard-v2 look, same tab-by-tab process used for Patient (Storage Vault, Access Requests, etc. earlier this session). `EmergencyAccess.jsx` and `DrugInteractions.jsx` are shared between Doctor and Hospital — reskin once, both benefit, same `.mv-root`-scoped-override approach already proven on `DocumentViewer`/`AISummaryModal`.
- Wire Health Vitals and Upcoming Appointments to real data once there's a real data source for them (currently no vitals/appointments backend exists at all — this is new scope, not just a frontend wiring task).
- Audit Log currently displays raw JSON in the description field for some event types (e.g. `{"scope":"all_documents","reason":"..."}` for `share_document`, `{"filename":"...","size":...}` for `upload`) — pre-existing behavior from `dashboardApi`/the server's audit formatting, not something the `AuditLogView.tsx` port introduced or fixed. Worth cleaning up if the user asks.
- Component structure, typed data shapes for `dashboardApi` / `vaultApi` service responses, continuing to extend `dashboard-v2/types.ts` as more of the dashboard is ported.
- Continue refining section by section as directed — confirm scope before large rewrites, and always confirm before merging any of this into `main`.

## AI workflow hardening (2026-09-27)

Prompted by looking at an unrelated repo (`MedExplain_AI`) for ideas — decided not to import it (different stack, redundant with our AI Summary feature; see git history for the full reasoning) but borrowed two ideas from it, plus a third the user asked for directly.

**`parse_warning` on AI Summary** (`server/src/app.js` `/api/ai/summarize/:id`, `src/components/dashboard/AISummaryModal.jsx`): the summarize endpoint now checks the model's response for the four essential section markers (🏥📋🧠🔴) it asked for in the prompt. If any are missing, `parseWarning: true` comes back in the JSON and the modal shows a blue "didn't come back in the expected format" banner above the (still-rendered, best-effort) parsed output, instead of silently showing whatever `parseSection()` in the modal produces. Verified `parseWarning: false` on a real qwen2.5vl:7b summary that included all markers.

**Graceful AI-unreachable fallback**: `describeAiFailure(err)` in `server/src/utils.js` turns a raw fetch failure (`"fetch failed"`, `ECONNREFUSED`, `AbortError`) into a message that names the actual problem ("can't reach the AI service... make sure it's running") instead of leaking the low-level error text to the UI. Used in both the summarize endpoint's catch block and chat's streaming error paths (`server/src/chat.js`) — this is the same class of bug as the earlier Ollama-down session that showed a raw "fetch failed" in the UI.

**Tool-calling intent gate in front of RAG** (`server/src/chat.js`): `/api/chat` no longer unconditionally embeds + searches documents on every message. `detectDocumentSearchIntent()` makes one small non-streaming completion with a `search_documents` tool defined and lets the model decide, via a real tool call, whether the message needs a document lookup at all — greetings/small talk skip retrieval entirely. **Fails open** (defaults to searching) on any error, non-200, or a model that doesn't call the tool — for a medical records app an unnecessary search is far cheaper than a missed one.

Verified end-to-end against the local stack and found a real environment gap, not a code bug: **`qwen2.5vl:7b` (the configured `AI_MODEL`) doesn't support tool calling at all** — Ollama returns a 400 `"does not support tools"`, so the gate currently always fails open locally (identical to the old always-search behavior). `llama3.2:1b` (also pulled locally) does accept tool calls but is too small to judge well — it calls the tool unconditionally even for "hi there", so it's a functional no-op too. Added a separate `AI_INTENT_MODEL` env var (`server/src/chat.js`, documented in `.env`/`.env.example`) so intent-detection can use a different model than the vision model used for real answers; for the gate to actually skip searches, pull something like `ollama pull qwen2.5:7b` and set `AI_INTENT_MODEL=qwen2.5:7b`. Not done yet — left as a next step since it's a multi-GB download, not a code change.

### Next steps (AI workflow)
- If the intent gate should actually activate locally: `ollama pull qwen2.5:7b` (or another mid-size instruction-tuned, tool-calling-capable model) and set `AI_INTENT_MODEL` in `.env`.
- Consider extending `parse_warning`-style validation to chat responses too, if malformed/incomplete answers turn out to be a recurring issue there (not observed yet — chat's format is free-form prose, not a fixed section template, so there's no obvious structural check to apply the same way).

## Homepage bold-redesign pass, built for real (2026-10-01)

The dark-hero direction floated and rejected on 2026-09-27 (see "A note on process" under Homepage/marketing-site color migration above) got explicitly revisited and built — the user asked to "revisit the bolder dark-hero direction" from that same rejected mockup (`https://claude.ai/artifact/NeAdgFwQcLAHPA47JFoZks`). Scoped via three explicit choices: extend the dark/bold treatment all the way down the page (not just Hero, which is all the mockup itself covered), change `--font-heading`/`--font-body` site-wide rather than homepage-only, and build directly in code rather than iterate on the canvas further.

**Fonts, site-wide**: `--font-heading: 'Unbounded', 'Poppins', sans-serif` / `--font-body: 'Plus Jakarta Sans', 'Inter', sans-serif'` in `src/index.css` `:root` (Unbounded was already loaded in `index.html`; added Plus Jakarta Sans to the same Google Fonts link). This reaches every page that reads those tokens, including the auth pages — verified via screenshot, looks consistent there too, not just the homepage.

**Hero** (`src/components/Hero.jsx`): rebuilt from the two-column layout + `HeroCarousel` (cycling product screenshots) to the mockup's centered dark statement block — badge pill, big headline with one accent-colored word, subtext, two CTAs, a 3-stat strip below. `HeroCarousel.jsx` is deleted (was only used here); its screenshots in `public/carousel/` were left in place (unused, harmless) rather than deleted along with it. The stat strip intentionally does NOT use the mockup's `<60s to break-glass emergency access` figure — that's an unverified performance claim; swapped for `Instant` (same meaning: break-glass access has no approval wait, not a measured benchmark) to avoid stating a fabricated number. The other two stats (`256-bit` encryption, `100%` patient-owned/auditable) are both direct restatements of real existing feature copy, not new claims.

**Extended past what the mockup covered**, per the "extend further down" choice:
- **Features** (`src/components/Features.jsx`): kept all 6 existing cards (mockup only showed 3 as a "preview"), bumped card radius to 20px. One card — Emergency Access Protocol — got the mockup's dark-inverted card treatment (`.feature-card-dark`), deliberately chosen rather than arbitrary: it's the one card about a genuine clinical emergency, so making it the single visual outlier among six cards reinforces the project's standing "red = emergency only, never decorative" rule instead of diluting it.
- **FlowSection**: left the interactive role-tab/stepper logic untouched, wrapped the stepper in a `.flow-panel-card` hairline-bordered card to match the new card language.
- **CTA** (`src/components/CTA.jsx`): converted from the bright solid plum-gradient box to a third dark "bookend" matching Hero/Navbar/Footer's exact gradient + grid-texture treatment, with the same accent-highlighted-word heading pattern as Hero.
- **Navbar/Footer**: already dark plum from the 2026-09-27 color migration, so mostly unchanged — just inherits the new fonts.

**Two real pre-existing bugs found and fixed along the way** (not introduced by this pass, just surfaced by testing it): (1) the mobile nav dropdown (`.nav-right` in `src/index.css`) used `background: var(--deep-twilight)` — the old pre-migration navy-blue token, never updated — and its closed-state `transform: translateY(-110%)` didn't account for the panel's `top: var(--nav-h)` offset, leaving a ~36px sliver of navy-blue panel visible above the navbar on every mobile pageload; fixed the color and switched to an exact `calc()` offset that always fully clears the viewport regardless of the panel's content height. (2) the mobile vertical stepper's `.step-connector` was still the old blue gradient too, while its desktop counterpart had already been migrated to plum.

**One experiment that didn't survive testing**: tried a translucent `rgba(32,10,24,0.72)` + `backdrop-filter: blur(14px)` navbar to match the mockup's glass-bar look more literally. Looked washed-out/gray in a real screenshot — `.navbar` sits in normal document flow directly above `.hero` rather than overlapping it, so at scroll position 0 there's nothing dark behind it to blend with, just the light body canvas tint. Reverted to the solid gradient fill (same as before this pass). Worth knowing if blur-glass navbar effects come up again elsewhere: they need the element to actually overlap colorful content in the stacking context, not just sit adjacent to it in flow.

Verified via Playwright: desktop (1440px) and mobile (390px) screenshots of the full scrolled homepage, the mobile hamburger menu open state, and two auth pages (`/register`, `/login/patient`) for the site-wide font change. Zero console/page errors. Not yet committed — ask before committing/merging, same standing rule as the rest of this log.

## Dashboard role consistency pass (2026-11-04, local)

Doctor and Hospital no longer render their remaining tabs through the old `DashboardSection`/`DataTable`/`ActivityFeed` visual system. They use shared `dashboard-v2` cards and rows (`RoleListPanel`), the Patient audit and notification panels, and matching forms. `DrugInteractions` and `UploadModal` retain their existing behavior with theme-token overrides for both light and dark themes. The Hospital emergency document action now opens `DocumentViewer`, like Doctor's.

The emergency screen was rebuilt from the simulated fingerprint/Aadhaar scanner to a direct patient-email request. This matches the backend's real consent check, 24-hour window, and audit record; the backend event reason was corrected accordingly. Patient vitals and appointments remain explicitly labeled sample data and were not changed.

Verification: `npm run build`, `npx tsc --noEmit`, `npm run lint`, and `git diff --check` pass. A live browser preview was unavailable in the current sandbox (`listen EPERM` for Vite; Chromium MachPort permission denied), so the new visual states still need manual review in a normal local browser. These changes are uncommitted and undeployed.

## Agentic chat implementation (2026-11-04)

Implemented all five read-only tools, bounded multi-round gathering, fresh document authorization, patient-only profile/interaction scope, immediate deduplicated auditing, streamed status/source labels, preserved citation order, and single-pass RAG fallback. New code is in `server/src/chatAgent.js`; integration is in `chat.js` and `ChatPanel.jsx`. Embedding retrieval now accepts cancellation. Agent traces and source/citation metadata use existing `token_usage` JSONB; no migration is needed.

`npm test` runs 22 deterministic tests with injected data/model dependencies. Build, TypeScript, lint, and diff checks are also required. Ollama could not be reached from this environment, so no live model evaluation was claimed and the flag remains off by default. `AGENTIC_CHAT_RUNBOOK.md` records configuration, the live evaluation set, and remaining wider project work.

## Real care workflows and browser verification (2026-11-04)

Added migration 0011 with patient vitals, participant-scoped/versioned appointments, appointment events and per-user notification preferences. Vitals use the actual patient's data and units without inferred normal ranges. Appointment requests, provider confirmation, rescheduling, cancellation and completion use shared UI across all roles; transactions serialize both schedules to prevent overlaps. In-app notifications respect saved preferences and read receipts. No calendar/email/SMS integration is implied.

Browser testing found and fixed stale cached profiles after saves, a missing Hospital staff row id and overly broad staff-grant query, emergency windows missing from document authorization, and the dashboard shell's absent mobile layout. The shared shell now uses a keyboard-accessible mobile drawer. Server-side emergency checks also require current consent and an unexpired active window.

`care-driver.mjs` uses real local PostgreSQL/MinIO/Ollama, isolated fixtures, fresh migrations and synthetic accounts; artifacts are printed by the runner. `CARE_WORKFLOWS.md` documents coverage and setup. Local migration tracking for manually applied 0008–0010 was reconciled only after verifying existing schema; 0011 was applied locally and the migration runner reports nothing pending. `dev:local` overrides hosted service settings at process launch without editing `.env`.

Final verification: 20 real-stack Playwright workflow groups passed with no captured application console errors or API 5xx responses; all role tabs checked at 1440px and 390px, plus light/dark appointment screenshots. Local qwen2.5vl summaries and nomic-backed cited RAG chat passed. All 27 automated tests, lint, TypeScript, build and diff checks passed. The committed `docs/care-verification.json` records the run; screenshots/logs remain in its artifact directory. Optional multi-step agent activation is still separate from this legacy-RAG browser check.

## Live agentic evaluation (2026-11-04)

Installed local qwen2.5:7b and evaluated the agent against real PostgreSQL/pgvector, Ollama, API endpoints and Playwright using isolated synthetic records. Final run: 26/26 scenarios passed, with results in `docs/agent-live-verification.json` and reproduction/findings in `AGENT_EVALUATION.md`. Tests include clinical follow-ups and revocation across turns, actual hostile-record reads, role/profile boundaries, timeouts/outages/disconnects, fallback and saved browser citations.

Fixed document-type validation, empty optional id filters, invented date bounds, stale-history reliance, bogus streamed citations, unnecessary conversational lookups, and incomplete stream persistence. `AI_CHAT_MODEL` separates the text-answer model from vision `AI_MODEL`. The evaluated configuration uses qwen2.5:7b for planning/text answers, nomic embeddings, and preserves qwen2.5vl for vision paths. Fallbacks are recorded and remain expected recovery behavior. Default agent flag is still off; the evaluation does not constitute a production rollout.

## Production deployment (2026-11-04)

The user confirmed https://medivault-roan-six.vercel.app as their production site. Its project is `medivault` under `mohammad-petiwalas-projects`, linked in the ignored .vercel directory. Deploy this project directly; the GitHub integration also has a separate Saniya-team deployment, which is not the selected destination.

Source commit `af91a9b` was built as a protected production candidate, tested, then promoted as deployment `dpl_GJSGmzj4Mr25MZgfjQye6hAqgg7L`. Applied additive migration 0011 to the hosted Neon database after checking the ledger through 0010. Preserved hosted AI, embedding, session and R2 credentials. Enabled the agent in production with max steps 4 and AI timeout 45000ms; local Ollama settings were not uploaded.

Hosted checks passed: real registration and desktop/mobile dashboards for all roles; persisted vitals/preferences; patient appointment request/doctor confirmation and hospital scheduling; hosted AI greeting and profile lookup; encrypted R2 upload/download, PDF indexing, lab-result retrieval and persisted citation. Public Playwright checks passed for all three role logins, saved appointments, reloads and mobile navigation after promotion. All synthetic accounts, appointments, document metadata and storage objects were removed. See `docs/deployment-verification.json`. This targeted production smoke run complements the broader isolated local regressions; it does not test every failure mode against live services.

## Homepage redesign and deployment (2026-11-04)

Replaced the dark marketing homepage with a light, warm-white layout, charcoal typography, and plum accents consistent with the dashboard palette. LandingPage.jsx now owns its homepage navigation, role cards, keyboard-accessible sample workspace tabs, care workflow, access explanation, and footer. The illustrative preview is explicitly labelled as sample data and never requests real records. Scoped styles live in src/pages/landing.css; existing auth navigation still reaches the features/flow/cta anchors. Homepage links for existing sessions point to the current role's dashboard. Updated page title and description.

Source commit e8ce572 was deployed directly to the user's mohammad-petiwalas-projects/medivault project, verified as a protected production candidate, then promoted to https://medivault-roan-six.vercel.app as dpl_BGny3Ljk8eTu3zJKACyx9rC7TZ93. Ten Playwright groups passed against both candidate and public site at phone/tablet/desktop sizes, including preview keyboard controls, all internal destinations, registration form navigation, mobile menu/anchors, legacy navigation, reduced motion, and stored-session role links. Lint, TypeScript, production build, 36 automated tests and diff checks passed. The public health endpoint remains healthy. No production fixture data was created. See docs/homepage-verification.json for scope and evidence.
