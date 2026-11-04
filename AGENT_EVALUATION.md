# Live agentic chat evaluation — 2026-11-04

All 26 scenarios passed in the final local run. The committed result summary is `docs/agent-live-verification.json`; the full synthetic transcripts, model request/response traces, API logs and Playwright screenshots are in the artifact directory recorded there.

## What was exercised

- Real Ollama `qwen2.5:7b` for planning and text answers, with `nomic-embed-text` embeddings and actual PostgreSQL/pgvector retrieval.
- A fresh isolated database containing two synthetic patients, clinicians with active/expired/revoked grants, dated labs, prescription/visit/follow-up records, paged text, and a report containing hostile instructions. The fixture text is pre-indexed using real embeddings; upload/ingestion was tested separately by the care workflow suite.
- All five tools: discovery, semantic search, paged text, the patient's own profile, and the patient's recorded interaction notes.
- Greetings/thanks without record reads; clinical follow-ups; source-grounded values and comparisons; missing data; profile permission boundaries; cross-patient isolation; revocation within an existing conversation.
- Explicit reading of hostile document text, with no instruction-following marker or private patient-B data in the response.
- An unsupported planner, the flag-off baseline, a closed provider connection, a stalled provider, and a client disconnect after completed read audits. Provider faults were introduced through an isolated local proxy; the shared Ollama service was not stopped.
- Actual Playwright login/chat UI: progress messages, final answer, citation badges, and session persistence after refresh. No captured browser errors.

Median scenario time was approximately 6 seconds; a multi-report comparison took approximately 20 seconds. These measurements include the configured local model's work and are not production latency guarantees.

## Findings and fixes

The initial runs found real failures; the final results were obtained after fixing them:

1. Free-form document type arguments could silently select no records. Tool schemas now enumerate supported types, and invalid values return actionable errors.
2. The model sometimes filled an optional document-id array with `[]`. Empty arrays now mean no id filter; nonempty ids are still intersected with current authorization before retrieval.
3. The model invented date cutoffs, hiding an older named report. Date filters now require a temporal request in the original user message, with an explicit error prompting discovery without invented bounds.
4. The planner sometimes answered a follow-up from history without reading current evidence. Unsupported no-tool factual completions now fall back to authorized RAG using recent user questions as retrieval context. Previous assistant medical answers are omitted from final-generation context when current evidence is unavailable.
5. A model answer included a numbered citation despite having no document sources. Streamed citation tags are now checked against supplied source numbers; out-of-range tags are removed before the client receives them.
6. The planner sometimes searched records for a simple “Thanks!”. Narrow, complete conversational messages now bypass planning entirely; a greeting followed by a record question still enters planning.
7. Failed streams no longer persist incomplete assistant messages as completed answers.

Fallback remains part of the evaluated behavior. In the final run, the clinical follow-up and revoked-history check used the grounding fallback; the missing-value case hit the repeated-call guard; the unsupported-model case used the expected model-error fallback. Passing does not mean every question was answered through tools without fallback.

## Reproduce

Requirements: local PostgreSQL with database-creation permission, installed Playwright/Chromium in `.claude/skills/run-medivault`, and native Ollama with:

```sh
ollama pull qwen2.5:7b
ollama pull qwen2.5vl:7b
ollama pull nomic-embed-text
npm run test:e2e:agent
```

The runner creates and removes its own test database and uses ports 3003–3006, 3050 and 5179. It leaves the normal app and private `.env` unchanged. Raw traces contain synthetic records and are saved outside the repository. `npm test` covers the deterministic regression tests.

## Activation boundary

The production default is still `CHAT_AGENT_ENABLED=false`. To run the evaluated text-chat configuration locally while retaining the vision model for image summaries:

```sh
CHAT_AGENT_ENABLED=true AI_AGENT_MODEL=qwen2.5:7b AI_CHAT_MODEL=qwen2.5:7b npm run dev:local
```

Stop an existing local preview before restarting with those flags. `AI_CHAT_MODEL` only changes text chat; `AI_MODEL` remains available to the image-summary/indexing paths. Hosted deployment, provider/model changes, larger real-world context windows, and performance under concurrent load require their own verification. This finite synthetic suite does not establish that every possible model answer is correct.
