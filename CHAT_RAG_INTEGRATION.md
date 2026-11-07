# Chat + RAG Integration Spec

Goal: add a persistent, multi-turn AI chat to WellNest that can answer
questions using Retrieval-Augmented Generation (RAG) over documents already
stored in the vault (lab reports, prescriptions, imaging, discharge
summaries, etc.), built entirely with this project's existing stack and
conventions — no new frameworks.

This is a spec to implement against, not a set of files to copy. There is
no compatible reference implementation to port — a Next.js/Gemini/Sequelize
chat feature from another project was evaluated and rejected as a literal
copy source because the stack doesn't match (see "Why not copy" below).
Everything here should be built fresh in WellNest's own style.

## Why not copy an existing implementation

A chat feature was found in a sibling project, but it's Next.js App Router
route handlers, the Gemini SDK's function-calling API, and Sequelize models
against Azure SQL. WellNest is Vite + React (SPA) on the frontend, a single
Express app (`server/src/app.js`) + Vercel serverless wrapper on the
backend, and Drizzle ORM + Postgres for data, already calling a generic
OpenAI-compatible endpoint via plain `fetch`. None of the other project's
files would run here. The useful part of that implementation is the
*pattern* (streaming responses, session persistence, rolling summarization
of long histories), not its code, and that pattern is described below in
terms of what WellNest should actually build.

## Hard constraint: this is a medical records vault — access control is not optional

WellNest already enforces document-level access control: a patient owns
their documents, an uploader can access what they uploaded, and anyone else
needs an **approved, unexpired, unrevoked grant** (see the three-tier check
in `server/src/app.js` around lines 1046-1062, used by both the download
endpoint and the existing `/api/ai/summarize/:id` endpoint).

**Every RAG retrieval query must apply this exact same authorization
filter before returning any chunk to the model or the user.** If a user
asks the chat something and the answer would require content from a
document they aren't authorized to view, that document's chunks must not
enter the retrieval set — not even to be silently used and not cited. Do
not implement retrieval as "search everything, then filter the response
text" — filter at the query level (restrict the candidate `document_id`s
before the similarity search runs). Extract the existing three-tier
authorization check into a shared helper (e.g. `server/src/authz.js`) so
it's reused by download, summarize, and the new chat/retrieval code
identically instead of re-implemented three times.

Also consider (ask the user rather than assuming): should chat queries and
the documents they touch be written to `audit_logs` (see
`db/schema/workflow.ts`), matching the existing `view_document` /
`download_document` audit actions? This is a medical app; if the existing
audit trail covers document access, chat-driven access to document content
arguably should too.

## What "RAG" means here, concretely

1. **Ingestion**: when a document is uploaded (existing endpoint:
   `POST /api/documents/upload`, `server/src/app.js:539`) or on-demand via a
   new backfill endpoint for documents uploaded before this feature existed,
   extract the document's plaintext, split it into overlapping chunks, embed
   each chunk, and store the chunks + embeddings.
2. **Retrieval**: when a chat message comes in, embed the user's question,
   run a similarity search restricted to documents the requesting user is
   authorized to see, and pull back the top-K chunks.
3. **Generation**: build a prompt containing the retrieved chunks (with
   citations back to source document + page/section) plus recent
   conversation history, call the existing AI chat-completions endpoint
   pattern, and stream the response back.

### Decrypting documents for ingestion

Documents are stored encrypted (`documents.encrypted`, `dek_wrapped`,
`dek_iv`) and fetched via Appwrite storage. The existing `decryptFile()`
helper (`server/src/app.js:507-513`) and `downloadFile()` are already used
for this exact purpose in the summarize endpoint
(`server/src/app.js:1069-1070`) — reuse them for ingestion rather than
writing new decryption code.

**Important naming collision to be aware of**: `documents.chunkSizeBytes` /
`documents.totalChunks` in `db/schema/documents.ts` refer to **storage
chunking of the encrypted blob**, unrelated to RAG text chunking. Don't
reuse or confuse these fields/columns with the new RAG chunk table below.

### Text extraction

The existing summarize endpoint doesn't extract text — it ships the whole
decrypted file as base64 to a multimodal model. RAG needs actual text
per-chunk, so a text-extraction step must be added:
- PDFs: no PDF text extraction library exists in this project's
  dependencies yet — add one (`pdf-parse` or similar) rather than
  reinventing extraction.
- Plain text / structured docs: read directly.
- Images (e.g. imaging scans): either skip embedding-based retrieval for
  pure images and rely on the existing summarize flow, or use a
  vision-capable model to produce a text description first, then embed
  that description. Ask the user which they'd prefer rather than guessing.

## Database (Drizzle + Postgres)

Follow the exact style already used in `db/schema/documents.ts` and
`db/schema/workflow.ts`: `pgTable`, `uuid('id').defaultRandom().primaryKey()`,
`references(() => ..., { onDelete: ... })`, `timestamp(..., { withTimezone:
true }).defaultNow().notNull()`, and named indexes following the
`<table>_<cols>_idx` convention.

New file `db/schema/chat.ts`:
- `chatSessions`: id, userId (references users), title, createdAt, updatedAt.
- `chatMessages`: id, sessionId (references chatSessions, cascade delete),
  role (`pgEnum` of `user`/`assistant`/`system`), content (text),
  citedDocumentIds (jsonb or a join table if you want proper FKs — prefer a
  join table `chat_message_citations` if you want referential integrity),
  tokenUsage (jsonb, optional), createdAt.

New file `db/schema/embeddings.ts` (or add to `documents.ts` if that reads
more naturally):
- `documentChunks`: id, documentId (references documents, cascade delete),
  chunkIndex (integer), content (text), embedding (vector column — see
  below), createdAt.

**pgvector**: check whether the `vector` extension is available on the
target Postgres instance (self-hosted vs. a managed provider — this needs
to be confirmed, don't assume). If available, add a migration with
`CREATE EXTENSION IF NOT EXISTS vector;` and a `vector(N)` column (N =
embedding dimension, depends on the chosen embedding model — confirm this
before hardcoding). Check whether the installed `drizzle-orm` version has
native `vector` type support; if not, define the column via raw SQL in the
migration and query it with Drizzle's `sql` template tag rather than the
query builder. If pgvector isn't available and can't be installed, fall
back to storing embeddings as a `real[]`/`jsonb` array and doing cosine
similarity in application code — acceptable at small scale, flag it as a
scaling limitation.

Add the migration as `db/migrations/0009_chat_and_rag.sql` (next number
after the existing `0008_grants_unique_document_grantee.sql`), matching
the existing migration file style.

## Backend (Express)

`server/src/app.js` is already ~1000+ lines — don't add more to it. Create
new files and mount them:
- `server/src/authz.js` — the extracted, shared document-authorization
  helper described above.
- `server/src/embeddings.js` — text chunking + calls to an embedding
  endpoint + the pgvector (or in-app cosine) similarity query.
- `server/src/chat.js` — an Express router with:
  - `POST /api/chat` — `{ sessionId, message }` → loads recent history,
    retrieves relevant chunks (via `authz.js` + `embeddings.js`), calls the
    chat-completions endpoint (reuse the `AI_BASE_URL`/`AI_MODEL`/
    `AI_API_KEY`/`AI_TIMEOUT_MS` pattern from `server/src/app.js:1029-1128`
    exactly — same env vars, same OpenAI-compatible request shape), streams
    the response, persists both messages.
  - `GET /api/chat/sessions` — list the authenticated user's sessions.
  - `GET /api/chat/sessions/:id` — one session's messages.
  - `DELETE /api/chat/sessions/:id`.
  - `POST /api/documents/:id/reindex` (or hook directly into the upload
    endpoint) — chunk + embed a document into `documentChunks`.
  All routes go through `requireAuth` exactly like existing routes
  (`server/src/utils.js`, imported at `server/src/app.js:8`).

## Frontend (Vite + React)

Follow existing conventions in `src/`:
- New service functions in `src/services/vaultApi.js`, matching the style
  of `summarizeDocument()` (lines ~79-90: `getToken()`, `fetch` with
  `Authorization: Bearer ${token}`, `API_BASE_URL` from
  `VITE_API_BASE_URL`, throw on `!res.ok`): `sendChatMessage`,
  `listChatSessions`, `getChatSession`, `deleteChatSession`.
- New chat UI under `src/components/chat/` or `src/pages/Chat.jsx`
  (whichever matches how similar features are organized — check `src/pages`
  vs `src/components` for the existing convention before choosing), wired
  into `react-router-dom` routing and navigation.
- Streamed responses: match whatever streaming approach is simplest given
  Express here (e.g. `text/event-stream` or chunked NDJSON over `fetch` +
  `ReadableStream`) — pick one and use it consistently for both the request
  and the frontend reader.

## Environment variables

Reuse (already exist, already wired to the chat-completions call):
- `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_TIMEOUT_MS`

Add (do not hardcode a default provider/model — ask the user, see below):
- `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_API_KEY` — a chat
  completions-capable endpoint does not necessarily also serve embeddings
  (e.g. OpenRouter doesn't); this may need to point somewhere different
  from `AI_BASE_URL`.
- `RAG_TOP_K` (default 5), `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`.

Update `.env.example` with the new variables and a one-line comment each,
matching the existing comment style in that file.

## Things to ask the user instead of guessing

1. Which embedding-capable API/model they actually have access to, and its
   output dimension (needed for the `vector(N)` column width).
2. Whether the target Postgres instance supports installing the `pgvector`
   extension.
3. Whether chat access and the documents it touches should be written to
   `audit_logs` alongside existing `view_document`/`download_document`
   actions.
4. How to handle imaging/scan documents that have no extractable text (skip
   embedding vs. vision-model-generated description).
5. Where new pages/components conventionally live in `src/` (pages vs.
   components) — confirm by reading a couple of existing examples rather
   than assuming.

## Suggested build order

1. Read this file fully, then re-read `server/src/app.js` (auth check
   block, `decryptFile`/`downloadFile`, the summarize endpoint) and
   `db/schema/documents.ts` / `workflow.ts` to confirm the details above
   still match — this doc is a snapshot, the code is the source of truth.
2. Resolve the open questions above with the user.
3. Extract the shared `authz.js` helper (refactor, should not change
   existing behavior — verify download/summarize still work after).
4. Add `db/schema/chat.ts` + the RAG chunk table + migration.
5. Build `embeddings.js` (chunking + embedding calls + similarity query).
6. Build the ingestion hook (on upload) + `/api/documents/:id/reindex`
   backfill endpoint.
7. Build `server/src/chat.js` (session CRUD + the chat endpoint with
   retrieval + streaming + persistence), mount it in `app.js`.
8. Build the frontend chat UI + service functions + routing.
9. Update `.env.example`.
10. Test end-to-end locally (`npm run dev:all`): upload a document, confirm
    it gets indexed, ask a question in chat that requires that document's
    content, confirm the answer is grounded in it, and confirm a *second*
    user without access to that document gets no leakage through chat.
