import crypto from 'crypto';
import { pool } from './db.js';
import { guardDemoRequest, consumeDemoProviderCall } from './demoAccess.js';
import { getDemoContext, runDemoContext } from './demoContext.js';

export function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

/**
 * fetch() with retries on transient upstream failures (503 "high demand"
 * from the AI provider, 429 rate limits). Verified this isn't about request
 * size or a hard rejection: the identical request shape/size sometimes
 * 503s in ~20s and sometimes succeeds in ~50s — genuine intermittent
 * capacity variance on the provider's side, not a bug in what we send.
 * With a 240s AI_TIMEOUT_MS budget (see app.js/chat.js/embeddings.js) there's
 * real room to just try again rather than surface the first failure. Same
 * call signature as fetch(); returns the final response (success or last
 * failure) for the caller to handle exactly as it already does with a bare
 * fetch() — no other code changes needed at call sites.
 */
export async function fetchWithRetry(url, options, { retries = 3, retryDelayMs = 2500, retryableStatuses = [503, 429] } = {}) {
  let res;
  for (let attempt = 0; attempt <= retries; attempt++) {
    res = await fetch(url, options);
    if (res.ok || !retryableStatuses.includes(res.status)) return res;
    if (attempt < retries) {
      console.warn(`Upstream ${url} returned ${res.status}, retrying (${attempt + 1}/${retries}) in ${retryDelayMs * (attempt + 1)}ms...`);
      await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
    }
  }
  return res;
}

/**
 * Chat-completions call with retry (fetchWithRetry) on the primary model,
 * then one attempt on a fallback model if the primary is still failing
 * with a retryable status after all its retries. Verified this is worth
 * having: the primary model (gemini-3.6-flash, a reasoning model) has
 * real intermittent capacity problems, while a lighter fallback model
 * answered the identical request in ~2s with no retries needed.
 * `buildBody(model)` lets each call site's message/prompt construction
 * stay in the call site — this just handles which model goes in and
 * when to give up on it.
 */
export async function callAIChatCompletion({ url, headers, buildBody, primaryModel, fallbackModel, signal, retryOptions }) {
  if(getDemoContext()){
    await consumeDemoProviderCall();
    primaryModel=process.env.DEMO_AI_MODEL||fallbackModel||primaryModel;fallbackModel='';retryOptions={retries:0};
    signal=signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
  }
  const attempt = (model) => fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildBody(model)),
    signal,
  }, retryOptions);

  const primaryRes = await attempt(primaryModel);
  if (primaryRes.ok || !fallbackModel || ![503, 429].includes(primaryRes.status)) {
    return primaryRes;
  }
  console.warn(`Primary model "${primaryModel}" still failing (${primaryRes.status}) after retries, trying fallback "${fallbackModel}"...`);
  return attempt(fallbackModel);
}

/**
 * Turns a raw fetch()/AI-call failure into a message safe to show a user —
 * "fetch failed" / "ECONNREFUSED" mean nothing to someone who didn't set up
 * the AI provider, and previously surfaced verbatim (e.g. Ollama not running).
 * The original error is left for the caller to console.error separately;
 * this only shapes what reaches the client.
 */
export function describeAiFailure(err) {
  if(err?.status===429)return {status:429,message:err.message};
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
    return {
      status: 504,
      message: 'The AI service took too long to respond. If it just started up, the model may still be loading into memory — please try again in a moment.',
    };
  }
  const causeCode = err?.cause?.code || err?.code;
  if (causeCode === 'ECONNREFUSED' || causeCode === 'ENOTFOUND' || err?.message === 'fetch failed') {
    return {
      status: 503,
      message: "Can't reach the AI service right now. Make sure it's running (e.g. Ollama, or whatever AI_BASE_URL points to) and try again.",
    };
  }
  return { status: 503, message: 'The AI service ran into a problem. Please try again in a moment.' };
}

/**
 * Age in whole years as of today, from a date_of_birth column value.
 * Doctors read age directly, not a raw DOB they have to do math on — this
 * is what actually surfaces the "age" a doctor asked for, not just storing
 * date_of_birth (which was already collected before that request).
 * @param {Date|string|null} dateOfBirth
 * @returns {number|null}
 */
export function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasNotHadBirthdayYet =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (hasNotHadBirthdayYet) age--;
  return age;
}

/* ── snake_case → camelCase row mapper ── */
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = toCamel(k);
    // Parse JSON fields if they appear to be JSON strings
    if (camelKey === 'documentIds' && typeof v === 'string') {
      try {
        out[camelKey] = JSON.parse(v);
      } catch {
        out[camelKey] = v;
      }
    } else {
      out[camelKey] = v;
    }
  }
  return out;
}

export function camelRows(rows) {
  return rows.map(camelRow);
}

/* ── HMAC-signed token (survives server restarts) ── */
const TOKEN_SECRET = process.env.SESSION_SECRET;
if (!TOKEN_SECRET) {
  throw new Error(
    'FATAL: SESSION_SECRET environment variable is not set. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
  );
}

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function issueToken(userId, role, authVersion = 0, ttlMs = TOKEN_TTL_MS) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    ver: authVersion,
    jti: crypto.randomUUID(),
    role,
    iat: Date.now(),
    exp: Date.now() + Math.min(TOKEN_TTL_MS, ttlMs),
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function decodeSession(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
    // Timing-safe comparison
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    // Enforce token expiry
    if (!data.exp || Date.now() > data.exp) return null;
    return { userId: data.sub, role: data.role, authVersion: data.ver ?? 0, expiresAt: data.exp };
  } catch {
    return null;
  }
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function resolveSession(token) {
  const session = decodeSession(token);
  if (!session || !/^[a-f0-9-]{36}$/i.test(session.userId || '')) return null;
  const { rows } = await pool.query(`SELECT u.role,u.auth_version,u.demo_workspace_id,w.expires_at AS demo_expires_at FROM users u LEFT JOIN demo_workspaces w ON w.id=u.demo_workspace_id
    WHERE u.id = $1 AND NOT EXISTS (SELECT 1 FROM revoked_tokens WHERE token_hash = $2)`,
  [session.userId, tokenHash(token)]);
  if (!rows[0] || rows[0].role !== session.role || rows[0].auth_version !== session.authVersion) return null;
  if (rows[0].demo_workspace_id && (process.env.DEMO_ENABLED!=='true' || !rows[0].demo_expires_at || new Date(rows[0].demo_expires_at).getTime()<=Date.now())) return null;
  return {...session,demoWorkspaceId:rows[0].demo_workspace_id||null};
}

export async function revokeToken(token, userId) {
  const session = decodeSession(token);
  if (!session || session.userId !== userId) return;
  await pool.query(`INSERT INTO revoked_tokens(token_hash, user_id, expires_at) VALUES ($1,$2,$3)
    ON CONFLICT (token_hash) DO NOTHING`, [tokenHash(token), userId, new Date(session.expiresAt)]);
}

export function makeSafeUser(userRow, profile = {}) {
  return {
    id: userRow.id,
    email: userRow.email,
    role: userRow.role,
    profile,
    emailVerified: Boolean(userRow.email_verified),
    isAdmin: !userRow.demo_workspace_id && Boolean(userRow.is_admin),
    isGuest: Boolean(userRow.demo_workspace_id),
  };
}

/* ── Auth middleware ── */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (req.authToken===token && req.userId) return next();
  let session;
  try { session = await resolveSession(token); } catch {
    return res.status(503).json({ message: 'Unable to verify your session. Please try again.' });
  }
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized. Please log in.' });
  }
  req.demoWorkspaceId=session.demoWorkspaceId;
  if(session.demoWorkspaceId)res.set('Cache-Control','no-store');
  try { if(!await guardDemoRequest(req,res))return; } catch(error) { return res.status(error.status||503).json({message:error.status?error.message:'Unable to check the workspace. Please try again.'}); }
  if (!session.demoWorkspaceId && process.env.PROVIDER_APPROVAL_REQUIRED === 'true' && req.originalUrl.startsWith('/api/') && ['doctor','hospital'].includes(session.role)) {
    try {
      const r = await pool.query(`SELECT u.email_verified,a.status FROM users u LEFT JOIN provider_applications a ON a.user_id=u.id WHERE u.id=$1`,[session.userId]);
      if (!r.rows[0]?.email_verified || r.rows[0]?.status !== 'approved') return res.status(403).json({ message: 'Verify your email and obtain provider approval before accessing clinical features.', code: 'PROVIDER_APPROVAL_REQUIRED' });
    } catch { return res.status(503).json({ message: 'Unable to verify provider approval. Please try again.' }); }
  }
  req.authToken = token;
  req.userId = session.userId;
  req.userRole = session.role;
  return runDemoContext(session.demoWorkspaceId?{workspaceId:session.demoWorkspaceId}:null,()=>next());
}
