// Real API/PostgreSQL/MinIO browser tests. Creates and removes an isolated local DB/bucket.
import 'dotenv/config';
import { chromium } from 'playwright';
import pg from 'pg';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
const root = process.cwd(), stamp = Date.now(), name = `medivault_security_e2e_${stamp}`;
const artifacts = process.env.SECURITY_E2E_ARTIFACTS || `/private/tmp/${name}`;
mkdirSync(artifacts, { recursive: true });
const originalUrl = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(originalUrl.hostname), 'E2E requires a local PostgreSQL server.');
const databaseUrl = new URL(originalUrl); databaseUrl.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: originalUrl.toString() });
const db = new pg.Pool({ connectionString: databaseUrl.toString() });
const base = 'http://localhost:5179', api = 'http://localhost:3003';
const bucket = name.replaceAll('_', '-');
const env = { ...process.env, DATABASE_URL: databaseUrl.toString(), DATABASE_SSL: 'false', API_PORT: '3003',
  ALLOWED_ORIGINS: base, VITE_API_BASE_URL: api, VITE_ENABLE_MOCK_AUTH: 'false', S3_BUCKET: bucket,
  AI_BASE_URL: 'http://localhost:11434/v1', AI_MODEL: 'qwen2.5vl:7b', AI_FALLBACK_MODEL: '', AI_TIMEOUT_MS: '120000',
  AI_INTENT_MODEL: 'llama3.2:1b', CHAT_AGENT_ENABLED: 'false',
  EMBEDDING_BASE_URL: 'http://localhost:11434/v1', EMBEDDING_MODEL: 'nomic-embed-text', EMBEDDING_API_KEY: '', EMBEDDING_DIMENSIONS: '768' };
// Test storage stays on local MinIO even when the private .env targets hosted storage.
const container = JSON.parse(execFileSync('docker', ['inspect', 'medivault-minio-1'], { encoding: 'utf8' }))[0];
const storageEnv = Object.fromEntries(container.Config.Env.map((entry) => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
env.S3_ENDPOINT = 'http://localhost:9000'; env.S3_REGION = 'us-east-1';
env.S3_ACCESS_KEY = storageEnv.MINIO_ROOT_USER; env.S3_SECRET_KEY = storageEnv.MINIO_ROOT_PASSWORD;
env.APP_PUBLIC_URL = base; env.RECOVERY_MAIL_FILE = join(artifacts, 'mail.jsonl');
env.EMBEDDING_BASE_URL = ''; env.EMBEDDING_MODEL = ''; env.ALLOW_LEGACY_DOCUMENT_KEYS = 'false';
const children = [], contexts = [], failures = [], steps = [];
let browser, currentPage;
const accounts = {};
function start(command, args, file) {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = createWriteStream(join(artifacts, file)); child.stdout.pipe(log); child.stderr.pipe(log); children.push(child); return child;
}
async function ready(url) {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`Service unavailable: ${url}`);
}
async function check(label, action) {
  await action(); steps.push(label); console.log(`PASS ${label}`);
}
async function expectText(page, text, timeout = 10000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}
async function nav(page, label) {
  currentPage = page;
  await page.locator('.mv-topbar-title').waitFor();
  if (!await page.locator('.mv-sidebar').isVisible()) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.mv-sidebar').getByRole('button', { name: label, exact: true }).click();
}
async function shot(page, filename) { await page.waitForTimeout(250); await page.screenshot({ path: join(artifacts, filename), fullPage: true }); }
const localTime = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const at = (days, hour = 12) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return localTime(d); };
async function request(page, path, method = 'GET', body) {
  return page.evaluate(async ({ api, path, method, body }) => {
    const token = JSON.parse(localStorage.getItem('medivault.auth')).token;
    const r = await fetch(`${api}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { api, path, method, body });
}
async function register(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  const page = await context.newPage(); currentPage = page;
  page.on('pageerror', (e) => failures.push(`${role} page: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource: the server responded with a status of 4')) failures.push(`${role} console: ${m.text()}`); });
  page.on('response', (r) => { if (r.url().startsWith(api) && r.status() >= 500) failures.push(`${role} API ${r.status()} ${r.url()}`); });
  await page.goto(`${base}/register/${role}`);
  const email = `care-${role}-${stamp}@example.com`;
  if (role === 'hospital') {
    await page.locator('#hospitalName').fill('Care Test Hospital'); await page.locator('#officialEmail').fill(email);
    await page.locator('#licenseNumber').fill(`HOSP-${stamp}`); await page.locator('#phone').fill('2125550199');
    await page.locator('#address').fill('1 Test Street');
    await page.locator('#proof').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nE2E proof') });
  } else {
    await page.locator('#fullName').fill(role === 'patient' ? 'Care Test Patient' : 'Care Test Doctor'); await page.locator('#email').fill(email);
    if (role === 'patient') { await page.locator('#dateOfBirth').fill('1990-05-14'); await page.locator('#bloodGroup').selectOption('O+'); await page.locator('#gender').selectOption('Female'); }
    else { await page.locator('#licenseNumber').fill(`DOC-${stamp}`); await page.locator('#specialization').selectOption({ label: 'Cardiology' }); }
  }
  await page.locator('#password').fill('CareTest2026'); await page.locator('#confirmPassword').fill('CareTest2026');
  await page.getByRole('button', { name: /Create|Register|Sign up/i }).last().click();
  await page.waitForURL(`**/dashboard/${role}`, { timeout: 15000 });
  await page.locator('.mv-topbar-title').waitFor(); await expectText(page, 'Upcoming Appointments');
  accounts[role] = { email, page }; return page;
}
async function book(page, role, email, time, reason) {
  await nav(page, 'Appointments');
  await page.locator('#participantEmail').fill(email); await page.locator('#appointmentTime').fill(time);
  await page.locator('#appointmentReason').fill(reason); await page.locator('#appointmentLocation').fill('Test clinic');
  await page.getByRole('button', { name: role === 'patient' ? 'Request appointment' : 'Schedule appointment', exact: true }).click();
}
const tokens = {};
const password = 'CareTest2026', nextPassword = 'Changed2026Secure';
async function call(path, body, token) {
  const response = await fetch(`${api}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({})); return { status: response.status, data };
}
async function signIn(role, pass = password) {
  const result = await call('/auth/login', { role, email: accounts[role].email, password: pass });
  assert.equal(result.status, 200); return result.data.token;
}
async function mails() {
  for (let i = 0; i < 30; i++) { try { return readFileSync(env.RECOVERY_MAIL_FILE, 'utf8').trim().split('\n').map(JSON.parse); } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Local recovery email was not delivered');
}
async function newLink(role) {
  const before = await db.query('select count(*)::int as c from password_reset_tokens');
  assert.equal((await call('/auth/forgot-password', { role, email: accounts[role].email })).status, 202);
  for(let i=0;i<30;i++) {const list=await mails(); const item=list.filter(m=>m.to===accounts[role].email).at(-1); if(item && (await db.query('select count(*)::int as c from password_reset_tokens')).rows[0].c>before.rows[0].c) return item.link; await new Promise(r=>setTimeout(r,100));}
  throw new Error('No recovery link');
}
async function uiLogin(role, pass) {
  const page = accounts[role].page;
  await page.goto(`${base}/login/${role}`); await page.locator('#email').fill(accounts[role].email); await page.locator('#password').fill(pass);
  await page.getByRole('button', { name: `Login as ${role[0].toUpperCase()+role.slice(1)}` }).click();
  await page.waitForURL(`**/dashboard/${role}`); await page.locator('.mv-topbar-title').waitFor();
  return page;
}
try {
  for (const port of [3003, 5179]) {
    try { await fetch(`http://localhost:${port}/health`); throw new Error(`Port ${port} is occupied.`); } catch (e) { if (e.message.includes('occupied')) throw e; }
  }
  await admin.query(`CREATE DATABASE "${name}"`);
  for (const file of readdirSync(join(root, 'db/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.query(readFileSync(join(root, 'db/migrations', file), 'utf8'));
  start(process.execPath, ['server/src/index.js'], 'api.log'); await ready(`${api}/health`);
  start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5179', '--strictPort'], 'vite.log'); await ready(base);
  browser = await chromium.launch();
  await check('All three roles register and hydrate through real APIs; hospital proof key is wrapped', async () => {
    for (const role of ['patient', 'doctor', 'hospital']) { await register(role); tokens[role] = await signIn(role); }
    const proof = (await db.query('SELECT proof_dek_wrapped FROM hospitals')).rows[0]; assert.match(proof.proof_dek_wrapped, /^v1:/);
  });
  await check('Encrypted upload/download is byte-identical; legacy keys and grant copies rewrap idempotently', async () => {
    const form = new FormData(); const content = 'Synthetic security test record';
    form.set('file', new Blob([content], { type: 'text/plain' }), 'security.txt'); form.set('documentType', 'lab_report'); form.set('patientId', accounts.patient.email);
    const uploaded = await fetch(`${api}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.doctor}` }, body: form });
    assert.equal(uploaded.status, 201); const id = (await uploaded.json()).documentId;
    const get = () => fetch(`${api}/api/documents/${id}/download`, { headers: { Authorization: `Bearer ${tokens.patient}` } });
    assert.equal(await (await get()).text(), content);
    const doc = (await db.query('SELECT * FROM documents WHERE id = $1', [id])).rows[0]; assert.match(doc.dek_wrapped, /^v1:/);
    const { unwrapDocumentKey } = await import('../../../server/src/crypto.js');
    const raw = unwrapDocumentKey(doc.dek_wrapped).toString('base64');
    await db.query('UPDATE documents SET dek_wrapped = $1 WHERE id = $2', [raw, id]);
    const doctor = (await db.query("SELECT id FROM users WHERE role='doctor'")).rows[0];
    await db.query("INSERT INTO document_access_grants(document_id,patient_id,grantee_user_id,wrapped_dek_for_grantee,status) VALUES($1,$2,$3,$4,'approved')", [id, doc.patient_id, doctor.id, raw]);
    execFileSync(process.execPath, ['scripts/rewrap-document-keys.mjs', '--apply'], { cwd: root, env, stdio: 'pipe' });
    const a = (await db.query('SELECT dek_wrapped FROM documents WHERE id=$1',[id])).rows[0].dek_wrapped;
    const b = (await db.query('SELECT wrapped_dek_for_grantee FROM document_access_grants WHERE document_id=$1',[id])).rows[0].wrapped_dek_for_grantee;
    assert.match(a,/^v1:/); assert.equal(a,b); assert.equal(await (await get()).text(),content);
    execFileSync(process.execPath, ['scripts/rewrap-document-keys.mjs', '--apply'], { cwd: root, env, stdio: 'pipe' });
    assert.equal((await db.query('SELECT dek_wrapped FROM documents WHERE id=$1',[id])).rows[0].dek_wrapped,a);
  });
  await check('Logout revokes only that token for every role; separately issued sessions remain valid', async () => {
    for (const role of ['patient','doctor','hospital']) {
      const first=tokens[role], second=await signIn(role); assert.notEqual(first,second);
      assert.equal((await call('/auth/logout',{},first)).status,200);
      assert.equal((await call('/auth/session',null,first)).status,401);
      assert.equal((await call('/auth/session',null,second)).status,200); tokens[role]=second;
    }
  });
  await check('Recovery response is identical for existing, missing and mismatched-role accounts; only token hashes persist', async () => {
    const a=await call('/auth/forgot-password',{role:'patient',email:accounts.patient.email});
    const b=await call('/auth/forgot-password',{role:'patient',email:'missing@example.com'});
    const c=await call('/auth/forgot-password',{role:'hospital',email:accounts.patient.email});
    assert.deepEqual(a,b);assert.deepEqual(a,c);
    const link=(await mails()).find(m=>m.to===accounts.patient.email).link;
    const token=new URL(link).hash.slice(1); const rows=await db.query('SELECT token_hash FROM password_reset_tokens');
    assert.ok(rows.rows.every(r=>r.token_hash!==token));
  });
  await check('Patient resets through browser; URL secret is removed, old password and all old sessions fail', async () => {
    const link=await newLink('patient'); const page=accounts.patient.page;
    await page.goto(link); await page.locator('#password').waitFor(); assert.equal(new URL(page.url()).hash,'');
    await page.locator('#password').fill(nextPassword); await page.locator('#confirmPassword').fill(nextPassword);
    await page.getByRole('button',{name:'Update password',exact:true}).click();await expectText(page,'Password updated.');
    assert.equal((await call('/auth/session',null,tokens.patient)).status,401);
    assert.equal((await call('/auth/login',{role:'patient',email:accounts.patient.email,password})).status,401);
    tokens.patient=await signIn('patient',nextPassword);
    assert.equal((await call('/auth/reset-password',{token:new URL(link).hash.slice(1),password:'Replay2026Test'})).status,400);
    await shot(page,'patient-reset-success.png');
  });
  await check('Expired and invalid links fail; weak passwords fail; concurrent reset has exactly one winner', async () => {
    await db.query('DELETE FROM auth_rate_limits');
    const old=await newLink('doctor'); const expired=new URL(old).hash.slice(1);
    await db.query("UPDATE password_reset_tokens SET expires_at=now()-interval '1 second' WHERE used_at IS NULL");
    assert.equal((await call('/auth/reset-password',{token:expired,password:nextPassword})).status,400);
    assert.equal((await call('/auth/reset-password',{token:'bad',password:nextPassword})).status,400);
    const link=await newLink('doctor'), token=new URL(link).hash.slice(1);
    assert.equal((await call('/auth/reset-password',{token,password:'weak'})).status,400);
    const results=await Promise.all([call('/auth/reset-password',{token,password:nextPassword}),call('/auth/reset-password',{token,password:nextPassword})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);tokens.doctor=await signIn('doctor',nextPassword);
  });
  await check('Doctor changes password in shared account security; current password required and all sessions revoked', async () => {
    const page=await uiLogin('doctor',nextPassword);
    await page.getByRole('link',{name:'Account security',exact:true}).click(); await page.locator('#currentPassword').fill('Wrong2026');
    await page.locator('#password').fill('Final2026Secure');await page.locator('#confirmPassword').fill('Final2026Secure');
    await page.getByRole('button',{name:'Change password and sign out',exact:true}).click();await expectText(page,'Current password is incorrect.');
    await page.locator('#currentPassword').fill(nextPassword);await page.getByRole('button',{name:'Change password and sign out',exact:true}).click();await page.waitForURL('**/login');
    assert.equal((await call('/auth/session',null,tokens.doctor)).status,401);tokens.doctor=await signIn('doctor','Final2026Secure');
  });
  await check('Hospital signs out all devices through shared security screen', async () => {
    const page=await uiLogin('hospital',password);await page.getByRole('link',{name:'Account security',exact:true}).click();
    await page.getByRole('button',{name:'Sign out all devices',exact:true}).click();await page.waitForURL('**/login');
    assert.equal((await call('/auth/session',null,tokens.hospital)).status,401);
  });
  await check('Failed server logout stays signed in with an error; retry revokes token', async () => {
    const page=await uiLogin('patient',nextPassword);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('medivault.auth')).token);
    await page.route('**/auth/logout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Test outage'})}));
    await page.locator('.mv-sidebar').getByRole('button',{name:'Logout',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.ok(await page.evaluate(()=>!!localStorage.getItem('medivault.auth')));
    await page.unroute('**/auth/logout');await page.locator('.mv-sidebar').getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/login/patient');
    assert.equal((await call('/auth/session',null,stored)).status,401);
  });
  await check('Recovery pages fit phone widths and all login roles expose recovery links', async () => {
    const page=accounts.patient.page;
    for(const role of ['patient','doctor','hospital']) {await page.goto(`${base}/login/${role}`);await page.getByRole('link',{name:'Forgot password?',exact:true}).click();await page.locator('#email').waitFor();assert.equal(await page.locator('#role').inputValue(),role);}
    await page.setViewportSize({width:390,height:844});await page.goto(`${base}/forgot-password`);await page.locator('#email').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(page,'recovery-mobile.png');
  });
  await check('Authentication fails closed during a database verification outage and recovers', async () => {
    await db.query('ALTER TABLE revoked_tokens RENAME TO revoked_tokens_unavailable');
    try { assert.equal((await call('/auth/session',null,tokens.doctor)).status,503); }
    finally { await db.query('ALTER TABLE revoked_tokens_unavailable RENAME TO revoked_tokens'); }
    assert.equal((await call('/auth/session',null,tokens.doctor)).status,200);
  });
  await check('Database-backed recovery throttle rejects repeated requests', async () => {
    await db.query('DELETE FROM auth_rate_limits');
    for(let i=0;i<5;i++) assert.equal((await call('/auth/forgot-password',{role:'patient',email:'missing@example.com'})).status,202);
    assert.equal((await call('/auth/forgot-password',{role:'patient',email:'missing@example.com'})).status,429);
  });
  // The deliberately injected outage is expected; all other server/browser errors fail.
  const unexpected=failures.filter(f=>!f.includes('API 503')&&!f.includes('status of 503'));
  assert.deepEqual(unexpected,[]);
  writeFileSync(join(artifacts,'report.json'),JSON.stringify({passed:steps,errors:unexpected,scope:'Isolated real PostgreSQL, MinIO, API and headless Chromium. Email captured to a private local file; no external mail sent.'},null,2));
  console.log(`Artifacts: ${artifacts}`);
} catch(error) {
  if(currentPage&&!currentPage.isClosed()) await shot(currentPage,'failure.png').catch(()=>{});
  writeFileSync(join(artifacts,'report.json'),JSON.stringify({passed:steps,error:error.message,errors:failures},null,2));console.error(error.message);console.error(`Artifacts: ${artifacts}`);process.exitCode=1;
} finally {
  await browser?.close();for(const child of children) child.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(()=>{});await admin.end();
  const storage=new S3Client({endpoint:env.S3_ENDPOINT,region:env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:env.S3_ACCESS_KEY,secretAccessKey:env.S3_SECRET_KEY}});
  try{const objects=await storage.send(new ListObjectsV2Command({Bucket:bucket}));if(objects.Contents?.length)await storage.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:objects.Contents.map(o=>({Key:o.Key}))}}));await storage.send(new DeleteBucketCommand({Bucket:bucket}));}catch(e){if(e.name!=='NoSuchBucket')console.error('Storage cleanup failed');}storage.destroy();
  // Reset links are credentials; retain only the redacted report and screenshots.
  const {rmSync}=await import('node:fs');rmSync(env.RECOVERY_MAIL_FILE,{force:true});
}
