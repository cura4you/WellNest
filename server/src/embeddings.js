// Text extraction, chunking, embedding, and similarity search for chat/RAG.
// See CHAT_RAG_INTEGRATION.md for the design. Mirrors the AI_BASE_URL/AI_MODEL/
// AI_API_KEY/AI_TIMEOUT_MS pattern already used by the /api/ai/summarize/:id
// endpoint in app.js, but with its own EMBEDDING_* env vars — a chat-completions
// endpoint doesn't necessarily also serve embeddings.
import { pool } from './db.js';
import { downloadFile } from './storage.js';
import { decryptFile } from './crypto.js';
import { fetchWithRetry, callAIChatCompletion } from './utils.js';

const EMBEDDING_BASE_URL = (process.env.EMBEDDING_BASE_URL || '').replace(/\/$/, '');
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || '';
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || '';
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS) || 768;

const RAG_TOP_K = Number(process.env.RAG_TOP_K) || 5;
const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE) || 1200;
const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP) || 200;

// Reuse the same chat-completions config as summarize — needed here only to
// describe image documents as text before embedding (see describeImage below).
const AI_API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || (process.env.GEMINI_API_KEY ? 'https://openrouter.ai/api/v1' : '')).replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o';
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || '';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60000;

export function isEmbeddingConfigured() {
  return Boolean(EMBEDDING_BASE_URL && EMBEDDING_MODEL);
}

/**
 * Split text into overlapping chunks by character count. Simple and
 * deterministic — good enough for the plaintext this project extracts
 * (lab reports, prescriptions, discharge summaries are not huge).
 * @returns {string[]}
 */
export function chunkText(text, { chunkSize = RAG_CHUNK_SIZE, overlap = RAG_CHUNK_OVERLAP } = {}) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end === normalized.length) break;
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}

export async function extractPdfText(buffer) {
  // Imported lazily, not at module scope, so a failure here is a catchable
  // error inside this one call instead of crashing the whole function on
  // startup (see the indexDocument() call site's waitUntil(...).catch() in
  // app.js's upload route).
  //
  // pdfjs-dist's display/canvas.js does `const SCALE_MATRIX = new DOMMatrix();`
  // at MODULE TOP LEVEL — it runs the instant pdfjs-dist is imported, before
  // any rendering is requested, and throws in Node because DOMMatrix is a
  // browser global. pdfjs-dist's own fix for this is to polyfill DOMMatrix
  // (along with ImageData/Path2D) from the optional @napi-rs/canvas native
  // package — but we only ever call getText() here, never render a page, so
  // that instance's methods are never actually invoked. A real canvas engine
  // is unnecessary weight (and native-binary risk) for a constructor that
  // just needs to not throw; a no-op stub satisfies it just as well.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {};
  }
  // pdfjs-dist runs its PDF parsing on a "worker" — in Node it always falls
  // back to a same-thread "fake worker" that still needs the worker code
  // itself, loaded via a *dynamic* `import(this.workerSrc)` where workerSrc
  // is a runtime string. Vercel's build-time file tracer can't follow a
  // dynamic import built from a variable, so that file silently doesn't
  // make it into the deployed function and the import fails at request
  // time. pdfjs-dist checks `globalThis.pdfjsWorker` first, before it ever
  // attempts that dynamic import — importing the worker module ourselves,
  // with a static (literal, traceable) specifier, and assigning it there
  // satisfies that check and skips the dynamic path entirely.
  if (!globalThis.pdfjsWorker) {
    globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text).join('\n\n').trim();
  } finally {
    await parser.destroy();
  }
}

/**
 * Ask the existing vision-capable chat model to describe an image document in
 * plain text, so it can be chunked/embedded like any other document. Reuses
 * the same OpenAI-compatible chat-completions call as /api/ai/summarize/:id.
 */
async function describeImage(buffer, mimeType, filename) {
  if (!AI_BASE_URL) throw new Error('AI_BASE_URL not configured — cannot describe image documents for indexing.');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await callAIChatCompletion({
      url: `${AI_BASE_URL}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
      },
      buildBody: (model) => ({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Describe this medical document image ("${filename}") factually and completely in plain text: document type, all visible findings, values, and any text present. This description will be used for search retrieval, not shown directly to a clinician, so favor completeness over brevity.` },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } },
          ],
        }],
        max_tokens: 1200,
        temperature: 0.2,
      }),
      primaryModel: AI_MODEL,
      fallbackModel: AI_FALLBACK_MODEL,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Image description failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract plaintext from a document's decrypted buffer for chunking/embedding.
 * @returns {Promise<string>} may be an empty string if nothing extractable was found.
 */
async function extractText(buffer, mimeType, filename) {
  if (mimeType === 'application/pdf') {
    return extractPdfText(buffer);
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return buffer.toString('utf8');
  }
  if (mimeType.startsWith('image/')) {
    return describeImage(buffer, mimeType, filename);
  }
  return '';
}

async function embedBatch(texts, signal) {
  if (!isEmbeddingConfigured()) throw new Error('EMBEDDING_BASE_URL/EMBEDDING_MODEL not configured.');
  if (texts.length === 0) return [];

  const res = await fetchWithRetry(`${EMBEDDING_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(EMBEDDING_API_KEY ? { Authorization: `Bearer ${EMBEDDING_API_KEY}` } : {}),
    },
    signal: signal || AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

/**
 * Chunk + embed one document into `document_chunks`. Idempotent: existing
 * chunks for the document are replaced. Call after upload, or via the
 * /api/documents/:id/reindex backfill route.
 *
 * @param {string} documentId
 * @returns {Promise<{ chunkCount: number, skipped?: string }>}
 */
export async function indexDocument(documentId) {
  const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);
  if (rows.length === 0) throw new Error('Document not found.');
  const doc = rows[0];

  if (!doc.appwrite_file_id) {
    return { chunkCount: 0, skipped: 'Document stored in legacy format (no object storage reference).' };
  }

  const encryptedBuf = await downloadFile(doc.appwrite_file_id);
  const plainBuffer = doc.encrypted ? decryptFile(encryptedBuf, doc.dek_wrapped) : encryptedBuf;
  const mimeType = doc.mime_type || 'application/octet-stream';

  const text = await extractText(plainBuffer, mimeType, doc.original_filename);
  if (!text || !text.trim()) {
    return { chunkCount: 0, skipped: `No extractable text (mime type: ${mimeType}).` };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) return { chunkCount: 0, skipped: 'Extracted text was empty after chunking.' };

  const embeddings = await embedBatch(chunks);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [documentId, i, chunks[i], toVectorLiteral(embeddings[i])]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { chunkCount: chunks.length };
}

/**
 * Embed a query and run a cosine-similarity search restricted to the given
 * document ids. Callers MUST restrict `documentIds` to what the requesting
 * user is authorized to see (server/src/authz.js) BEFORE calling this —
 * this function does no authorization of its own.
 *
 * @param {string} query
 * @param {string[]} documentIds - candidate set, already authorization-filtered
 * @param {number} [topK]
 * @returns {Promise<Array<{ documentId: string, chunkIndex: number, content: string, distance: number }>>}
 */
export async function retrieveRelevantChunks(query, documentIds, topK = RAG_TOP_K, signal) {
  if (documentIds.length === 0) return [];

  const [queryEmbedding] = await embedBatch([query], signal);
  const { rows } = await pool.query(
    `SELECT document_id, chunk_index, content, embedding <=> $1::vector AS distance
     FROM document_chunks
     WHERE document_id = ANY($2)
     ORDER BY distance ASC
     LIMIT $3`,
    [toVectorLiteral(queryEmbedding), documentIds, topK]
  );

  return rows.map((r) => ({
    documentId: r.document_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    distance: Number(r.distance),
  }));
}
