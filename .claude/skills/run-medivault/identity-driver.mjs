// Real API/PostgreSQL/MinIO browser tests. Creates and removes an isolated local DB/bucket.
import 'dotenv/config';
import { chromium } from 'playwright';
import pg from 'pg';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
const root = process.cwd(), stamp = Date.now(), name = `medivault_identity_e2e_${stamp}`;
const artifacts = process.env.IDENTITY_E2E_ARTIFACTS || `/private/tmp/${name}`;
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
env.PROVIDER_APPROVAL_REQUIRED = 'true'; env.AUTH_EMAIL_ALLOWLIST = ''; env.APP_PUBLIC_URL = base; env.RECOVERY_MAIL_FILE = join(artifacts, 'mail.jsonl');
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
  if (role === 'patient') { await page.waitForURL('**/dashboard/patient'); await page.locator('.mv-topbar-title').waitFor(); } else { await page.waitForURL('**/account/verification'); await page.getByRole('heading',{name:'Your account verification'}).waitFor(); }
  accounts[role] = { email, page }; return page;
}
async function book(page, role, email, time, reason) {
  await nav(page, 'Appointments');
  await page.locator('#participantEmail').fill(email); await page.locator('#appointmentTime').fill(time);
  await page.locator('#appointmentReason').fill(reason); await page.locator('#appointmentLocation').fill('Test clinic');
  await page.getByRole('button', { name: role === 'patient' ? 'Request appointment' : 'Schedule appointment', exact: true }).click();
}
const tokens={}, password='CareTest2026', proof=Buffer.from('%PDF-1.4\nSynthetic portfolio credential proof\n%%EOF');
async function call(path,body,token,origin=api){const r=await fetch(`${origin}${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>({}))};}
async function login(role){const r=await call('/auth/login',{role,email:accounts[role].email,password});assert.equal(r.status,200);tokens[role]=r.data.token;return r.data.token;}
async function status(role){const r=await call('/auth/account-status',null,tokens[role]);assert.equal(r.status,200);return r.data;}
async function app(role){return (await status(role)).application;}
async function upload(role,revision,buffer=proof){const f=new FormData();f.set('revision',String(revision));f.set('proof',new Blob([buffer],{type:'application/pdf'}),'portfolio-proof.pdf');const r=await fetch(`${api}/auth/provider/proof`,{method:'POST',headers:{Authorization:`Bearer ${tokens[role]}`},body:f});return {status:r.status,data:await r.json()};}
async function mailFor(email){for(let i=0;i<40;i++){try{const rows=readFileSync(env.RECOVERY_MAIL_FILE,'utf8').trim().split('\n').map(JSON.parse);const mail=rows.filter(m=>m.to===email&&m.purpose==='verification').at(-1);if(mail)return mail;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Verification email capture timed out');}
async function verify(role,ui=true){const page=accounts[role].page;await page.goto(`${base}/account/verification`);await page.getByRole('button',{name:'Send verification email',exact:true}).click();await expectText(page,'Verification requested.');const mail=await mailFor(accounts[role].email);if(ui){await page.goto(mail.link);await page.getByRole('button',{name:'Confirm email address',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');await page.getByRole('button',{name:'Confirm email address',exact:true}).click();await expectText(page,'Email verified.');}return new URL(mail.link).hash.slice(1);}
async function submit(role){const a=await app(role);return call('/auth/provider/submit',{revision:a.revision,note:'Synthetic portfolio application'},tokens[role]);}
async function decision(role,which='approved',override={}){const a=await app(role);return call(`/auth/admin/applications/${a.userId}/decision`,{revision:a.revision,decision:which,reason:'Reviewed synthetic portfolio evidence',proofId:a.proofId,proofReviewed:true,...override},tokens.patient);}
async function uiLogin(role){const p=accounts[role].page;await p.goto(`${base}/login/${role}`);await p.locator('#email').fill(accounts[role].email);await p.locator('#password').fill(password);await p.getByRole('button',{name:`Login as ${role[0].toUpperCase()+role.slice(1)}`,exact:true}).click();await p.waitForURL(role==='patient'?'**/dashboard/patient':'**/account/verification');return p;}
try{
  for(const port of [3003,3004,5179]){try{await fetch(`http://localhost:${port}/health`);throw Error(`Port ${port} is occupied.`);}catch(e){if(e.message.includes('occupied'))throw e;}}
  await admin.query(`CREATE DATABASE "${name}"`);
  for(const file of readdirSync(join(root,'db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query(readFileSync(join(root,'db/migrations',file),'utf8'));
  start(process.execPath,['server/src/index.js'],'api.log');await ready(`${api}/health`);
  start(process.execPath,['node_modules/vite/bin/vite.js','--host','localhost','--port','5179','--strictPort'],'vite.log');await ready(base);browser=await chromium.launch();
  await check('Unverified providers land on verification; strict server gates reject clinical requests',async()=>{
    for(const role of ['patient','doctor','hospital']){await register(role);await login(role);}
    for(const role of ['doctor','hospital'])assert.equal((await call(`/api/dashboard/${role}`,null,tokens[role])).status,403);
    assert.equal((await call('/api/dashboard/patient',null,tokens.patient)).status,200);
    assert.equal((await call('/auth/admin/applications',null,tokens.patient)).status,403);
  });
  await check('Accounts created during an older deployment are adopted without losing their existing proof',async()=>{
    const id=(await db.query('SELECT id FROM users WHERE email=$1',[accounts.hospital.email])).rows[0].id;
    await db.query('DELETE FROM provider_applications WHERE user_id=$1',[id]);
    const adopted=await app('hospital');assert.equal(adopted.status,'draft');assert.ok(adopted.proofId);assert.equal(adopted.proofReadable,true);
  });
  await check('Administrator access is CLI-only; last-admin revocation is refused and old sessions invalidate',async()=>{
    execFileSync(process.execPath,['scripts/admin.mjs','grant','--email',accounts.patient.email],{cwd:root,env,stdio:'pipe'});
    assert.equal((await call('/auth/account-status',null,tokens.patient)).status,401);await login('patient');assert.equal((await status('patient')).isAdmin,true);
    assert.throws(()=>execFileSync(process.execPath,['scripts/admin.mjs','revoke','--email',accounts.patient.email],{cwd:root,env,stdio:'pipe'}));await uiLogin('patient');
    const malicious=await call('/auth/register/patient',{fullName:'No privilege',email:`no-admin-${stamp}@example.com`,dateOfBirth:'1990-01-01',bloodGroup:'O+',gender:'Other',password,is_admin:true,isAdmin:true});assert.equal(malicious.status,201);assert.equal((await call('/auth/admin/applications',null,malicious.data.token)).status,403);
  });
  await check('Dedicated admin sign-in redirects guests and authenticates only privileged accounts',async()=>{
    const c=await browser.newContext();contexts.push(c);const page=await c.newPage();currentPage=page;
    await page.goto(`${base}/admin/reviews`);await page.waitForURL('**/admin/login');
    await page.locator('#email').fill(accounts.hospital.email);await page.locator('#password').fill(password);await page.locator('#adminAccountRole').selectOption('hospital');await page.getByRole('button',{name:'Sign in to review',exact:true}).click();await expectText(page,'This account does not have administrator access.');
    await page.locator('#email').fill(accounts.patient.email);await page.locator('#adminAccountRole').selectOption('patient');await page.getByRole('button',{name:'Sign in to review',exact:true}).click();await page.waitForURL('**/admin/reviews');await page.locator('#reviewFilter').waitFor();accounts.patient.page=page;
  });
  await check('All three roles verify through captured mail and browser confirmation; hashes persist without URL secrets',async()=>{
    for(const role of ['patient','doctor','hospital']){const token=await verify(role);assert.equal((await status(role)).emailVerified,true);const stored=(await db.query('SELECT token_hash FROM email_verification_tokens WHERE token_hash=$1',[token])).rowCount;assert.equal(stored,0);assert.equal((await call('/auth/verification/confirm',{token})).status,400);}
    await shot(accounts.hospital.page,'email-verified-mobile.png');
  });
  await check('Expired, malformed and replaced-email links cannot verify an address; simultaneous use has one winner',async()=>{
    const user=(await db.query('SELECT id FROM users WHERE email=$1',[accounts.doctor.email])).rows[0];
    const {createHash,randomBytes}=await import('node:crypto');const hash=t=>createHash('sha256').update(t).digest('hex');
    const expired=randomBytes(32).toString('hex'),old=randomBytes(32).toString('hex'),current=randomBytes(32).toString('hex');
    await db.query("INSERT INTO email_verification_tokens(token_hash,user_id,email,expires_at) VALUES($1,$2,$3,now()-interval '1 second'),($4,$2,'old@example.com',now()+interval '1 hour'),($5,$2,$3,now()+interval '1 hour')",[hash(expired),user.id,accounts.doctor.email,hash(old),hash(current)]);
    assert.equal((await call('/auth/verification/confirm',{token:expired})).status,400);assert.equal((await call('/auth/verification/confirm',{token:old})).status,400);assert.equal((await call('/auth/verification/confirm',{token:'bad'})).status,400);
    const r=await Promise.all([call('/auth/verification/confirm',{token:current}),call('/auth/verification/confirm',{token:current})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,400]);
  });
  await check('Providers can update license details; invalid and stale edits are refused',async()=>{
    const a=await app('doctor');assert.equal((await call('/auth/provider/license',{revision:a.revision,licenseNumber:''},tokens.doctor)).status,400);
    assert.equal((await call('/auth/provider/license',{revision:a.revision,licenseNumber:`UPDATED-${stamp}`},tokens.doctor)).status,200);
    assert.equal((await call('/auth/provider/license',{revision:a.revision,licenseNumber:'Stale-edit'},tokens.doctor)).status,409);
    assert.equal((await app('doctor')).licenseNumber,`UPDATED-${stamp}`);
  });
  await check('Proof uploads validate bytes, wrap keys, isolate owners and preserve optimistic concurrency',async()=>{
    const a=await app('doctor');assert.equal((await upload('doctor',a.revision,Buffer.from('fake executable'))).status,400);assert.equal((await upload('doctor',a.revision,Buffer.alloc(4*1024*1024+1))).status,400);
    assert.equal((await upload('doctor',a.revision)).status,201);assert.equal((await upload('doctor',a.revision)).status,409);
    const current=await app('doctor');const stored=(await db.query('SELECT dek_wrapped FROM provider_proofs WHERE id=$1',[current.proofId])).rows[0];assert.match(stored.dek_wrapped,/^v1:/);
    assert.equal((await call(`/auth/credential-proofs/${current.proofId}/download`,null,tokens.hospital)).status,404);
    const download=await fetch(`${api}/auth/credential-proofs/${current.proofId}/download`,{headers:{Authorization:`Bearer ${tokens.patient}`}});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),proof);
    assert.equal(JSON.stringify(current).includes('dek_wrapped'),false);
  });
  await check('Doctor submits through UI; administrator downloads proof, records approval and unlocks dashboard',async()=>{
    const doctor=accounts.doctor.page;await doctor.goto(`${base}/account/verification`);await doctor.getByRole('button',{name:'Submit application',exact:true}).click();await expectText(doctor,'Application submitted.');
    assert.equal((await app('doctor')).status,'pending');const adminPage=accounts.patient.page;await adminPage.goto(`${base}/admin/reviews`);
    const card=adminPage.getByRole('article',{name:`Application for ${accounts.doctor.email}`,exact:true});await card.waitFor();
    const downloaded=adminPage.waitForEvent('download');await card.getByRole('button',{name:'Download proof',exact:true}).click();await downloaded;
    await card.getByRole('textbox',{name:'Review reason',exact:true}).fill('Synthetic license and current proof reviewed');await card.getByRole('checkbox').check();await card.getByRole('button',{name:'Approve application',exact:true}).click();await expectText(adminPage,'Application approved.');
    await doctor.goto(`${base}/dashboard/doctor`);await doctor.locator('.mv-topbar-title').waitFor();assert.equal((await call('/api/dashboard/doctor',null,tokens.doctor)).status,200);await shot(adminPage,'admin-approved.png');
  });
  await check('Legacy unreadable hospital proof is replaced; rejection reasons are visible and resubmission is supported',async()=>{
    const old=await app('hospital');await db.query('UPDATE provider_proofs SET dek_wrapped=NULL WHERE id=$1',[old.proofId]);
    assert.equal((await call(`/auth/credential-proofs/${old.proofId}/download`,null,tokens.hospital)).status,410);
    const page=accounts.hospital.page;await page.goto(`${base}/account/verification`);await expectText(page,'A replacement is required');
    await page.locator('#credentialProof').setInputFiles({name:'replacement.pdf',mimeType:'application/pdf',buffer:proof});await page.getByRole('button',{name:'Upload proof',exact:true}).click();await expectText(page,'Proof uploaded.');await page.getByRole('button',{name:'Submit application',exact:true}).click();await expectText(page,'Application submitted.');
    assert.equal((await decision('hospital','rejected',{reason:'Please provide a clearer synthetic license scan'})).status,200);
    await page.reload();await expectText(page,'Please provide a clearer synthetic license scan');await page.getByRole('button',{name:'Submit application',exact:true}).click();await expectText(page,'Application submitted.');
  });
  await check('Concurrent review decisions serialize; stale decisions and self-review are denied',async()=>{
    const a=await app('hospital');const body={revision:a.revision,reason:'Reviewed synthetic proof for concurrency',proofId:a.proofId,proofReviewed:true};
    const r=await Promise.all([call(`/auth/admin/applications/${a.userId}/decision`,{...body,decision:'approved'},tokens.patient),call(`/auth/admin/applications/${a.userId}/decision`,{...body,decision:'rejected'},tokens.patient)]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
    await db.query("UPDATE users SET is_admin=true WHERE email=$1",[accounts.doctor.email]);const d=await app('doctor');assert.equal((await call(`/auth/admin/applications/${d.userId}/decision`,{...body,revision:d.revision,decision:'rejected'},tokens.doctor)).status,403);await db.query('UPDATE users SET is_admin=false WHERE id=$1',[d.userId]);
  });
  await check('Replacing approved proof immediately removes approval and gates clinical access; review history remains',async()=>{
    const old=await app('doctor');assert.equal(old.status,'approved');assert.equal((await upload('doctor',old.revision)).status,201);
    const next=await app('doctor');assert.equal(next.status,'draft');assert.equal((await call('/api/dashboard/doctor',null,tokens.doctor)).status,403);
    assert.equal((await call(`/auth/admin/applications/${old.userId}/decision`,{revision:old.revision,decision:'approved',reason:'Stale approval must fail',proofId:old.proofId,proofReviewed:true},tokens.patient)).status,409);
    const events=await call(`/auth/admin/applications/${old.userId}/events`,null,tokens.patient);assert.equal(events.status,200);assert.ok(events.data.events.some(e=>e.action==='approved'));assert.ok(events.data.events.filter(e=>e.action==='proof_uploaded').length>=2);
    assert.equal((await submit('doctor')).status,200);assert.equal((await decision('doctor')).status,200);assert.equal((await decision('doctor','rejected',{reason:'Portfolio approval suspended for retest'})).status,200);assert.equal((await call('/api/dashboard/doctor',null,tokens.doctor)).status,403);
  });
  await check('Portfolio mode preserves dashboard access while accurately reporting unverified review state',async()=>{
    const secondary=spawn(process.execPath,['server/src/index.js'],{cwd:root,env:{...env,API_PORT:'3004',PROVIDER_APPROVAL_REQUIRED:'false'},stdio:['ignore','pipe','pipe']});children.push(secondary);await ready('http://localhost:3004/health');
    const own=await call('/auth/account-status',null,tokens.doctor,'http://localhost:3004');assert.equal(own.data.approvalRequired,false);assert.equal(own.data.application.status,'rejected');assert.equal((await call('/api/dashboard/doctor',null,tokens.doctor,'http://localhost:3004')).status,200);
  });
  await check('Review and verification pages remain usable at phone and tablet widths; filters and empty states work',async()=>{
    const p=accounts.patient.page;for(const width of [390,768]){await p.setViewportSize({width,height:900});await p.goto(`${base}/admin/reviews`);await p.locator('#reviewFilter').selectOption('all');await p.getByRole('article').first().waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await shot(p,'admin-mobile.png');const h=accounts.hospital.page;await h.setViewportSize({width:390,height:844});await h.goto(`${base}/account/verification`);await h.getByRole('heading',{name:'Your account verification'}).waitFor();assert.ok(await h.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(h,'provider-mobile.png');
  });
  await check('Verification request throttles persist in the database',async()=>{
    const user=(await db.query('SELECT id FROM users WHERE email=$1',[accounts.doctor.email])).rows[0];await db.query('UPDATE users SET email_verified=false WHERE id=$1',[user.id]);await db.query('DELETE FROM auth_rate_limits');
    for(let i=0;i<5;i++)assert.equal((await call('/auth/verification/send',{},tokens.doctor)).status,202);assert.equal((await call('/auth/verification/send',{},tokens.doctor)).status,429);
  });
  const unexpected=failures.filter(f=>!f.includes('status of 4')&&!f.includes('API 503'));assert.deepEqual(unexpected,[]);
  writeFileSync(join(artifacts,'report.json'),JSON.stringify({passed:steps,errors:unexpected,scope:'Strict approval mode tested against isolated real PostgreSQL/MinIO/API and headless Chromium. Email captured locally and deleted; no external email sent.'},null,2));console.log(`Artifacts: ${artifacts}`);
}catch(e){if(currentPage&&!currentPage.isClosed())await shot(currentPage,'failure.png').catch(()=>{});writeFileSync(join(artifacts,'report.json'),JSON.stringify({passed:steps,error:e.message,errors:failures},null,2));console.error(e.message);console.error(`Artifacts: ${artifacts}`);process.exitCode=1;}
finally{
  await browser?.close();for(const child of children)child.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await db.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(()=>{});await admin.end();
  const storage=new S3Client({endpoint:env.S3_ENDPOINT,region:env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:env.S3_ACCESS_KEY,secretAccessKey:env.S3_SECRET_KEY}});try{const objects=await storage.send(new ListObjectsV2Command({Bucket:bucket}));if(objects.Contents?.length)await storage.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:objects.Contents.map(o=>({Key:o.Key}))}}));await storage.send(new DeleteBucketCommand({Bucket:bucket}));}catch(e){if(e.name!=='NoSuchBucket')console.error('Test storage cleanup failed');}storage.destroy();const{rmSync}=await import('node:fs');rmSync(env.RECOVERY_MAIL_FILE,{force:true});
}
