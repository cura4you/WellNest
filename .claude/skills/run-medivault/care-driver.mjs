// Real API/PostgreSQL/MinIO browser tests. Creates and removes an isolated local DB/bucket.
import 'dotenv/config';
import { chromium } from 'playwright';
import pg from 'pg';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
const root = process.cwd(), stamp = Date.now(), name = `medivault_care_e2e_${stamp}`;
const artifacts = process.env.CARE_E2E_ARTIFACTS || `/private/tmp/${name}`;
mkdirSync(artifacts, { recursive: true });
const originalUrl = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(originalUrl.hostname), 'E2E requires a local PostgreSQL server.');
const databaseUrl = new URL(originalUrl); databaseUrl.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: originalUrl.toString() });
const db = new pg.Pool({ connectionString: databaseUrl.toString() });
const base = 'http://localhost:5178', api = 'http://localhost:3002';
const bucket = name.replaceAll('_', '-');
const env = { ...process.env, DATABASE_URL: databaseUrl.toString(), DATABASE_SSL: 'false', API_PORT: '3002',
  ALLOWED_ORIGINS: base, VITE_API_BASE_URL: api, VITE_ENABLE_MOCK_AUTH: 'false', S3_BUCKET: bucket,
  AI_BASE_URL: 'http://localhost:11434/v1', AI_MODEL: 'qwen2.5vl:7b', AI_FALLBACK_MODEL: '', AI_TIMEOUT_MS: '120000',
  AI_INTENT_MODEL: 'llama3.2:1b', CHAT_AGENT_ENABLED: 'false',
  EMBEDDING_BASE_URL: 'http://localhost:11434/v1', EMBEDDING_MODEL: 'nomic-embed-text', EMBEDDING_API_KEY: '', EMBEDDING_DIMENSIONS: '768' };
// Test storage stays on local MinIO even when the private .env targets hosted storage.
const container = JSON.parse(execFileSync('docker', ['inspect', 'medivault-minio-1'], { encoding: 'utf8' }))[0];
const storageEnv = Object.fromEntries(container.Config.Env.map((entry) => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
env.S3_ENDPOINT = 'http://localhost:9000'; env.S3_REGION = 'us-east-1';
env.S3_ACCESS_KEY = storageEnv.MINIO_ROOT_USER; env.S3_SECRET_KEY = storageEnv.MINIO_ROOT_PASSWORD;
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
try {
  for (const port of [3002, 5178]) {
    try { await fetch(`http://localhost:${port}/health`); throw new Error(`Port ${port} is occupied; stop its test server first.`); } catch (e) { if (e.message.includes('occupied')) throw e; }
  }
  await admin.query(`CREATE DATABASE "${name}"`);
  await db.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  for (const file of readdirSync(join(root, 'db/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const client = await db.connect();
    try { await client.query('BEGIN'); await client.query(readFileSync(join(root, 'db/migrations', file), 'utf8')); await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]); await client.query('COMMIT'); }
    catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  start(process.execPath, ['server/src/index.js'], 'api.log'); await ready(`${api}/health`);
  start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5178', '--strictPort'], 'vite.log'); await ready(base);
  browser = await chromium.launch();
  let patient, doctor, hospital;
  await check('Real registration and dashboard hydration for all three roles', async () => { patient = await register('patient'); doctor = await register('doctor'); hospital = await register('hospital'); });
  await check('Patient overview has no sample vitals or appointments', async () => {
    assert.equal(await patient.getByText('Sample data', { exact: false }).count(), 0); await expectText(patient, 'No measurements yet.');
    await patient.getByRole('button', { name: 'Record vitals', exact: true }).click(); await expectText(patient, 'Record your vitals');
  });
  await check('Vitals create, persist after reload, and appear on Overview', async () => {
    await patient.locator('#heartRate').fill('76'); await patient.locator('#systolic').fill('118'); await patient.locator('#diastolic').fill('76'); await patient.locator('#glucose').fill('94'); await patient.locator('#vitalNotes').fill('Morning measurement');
    await patient.getByRole('button', { name: 'Save measurement', exact: true }).click(); await expectText(patient, 'Measurement saved.');
    await patient.reload(); await patient.locator('.mv-topbar-title').waitFor(); await expectText(patient, '94');
    await nav(patient, 'Health Vitals'); await expectText(patient, 'Morning measurement'); await shot(patient, 'patient-vitals.png');
  });
  const vital = (await request(patient, '/vitals')).body.vitals[0];
  await check('Vitals reject invalid measurements and cross-role access', async () => {
    assert.equal((await request(patient, '/vitals', 'POST', { measuredAt: new Date().toISOString(), heartRate: -1, notes: '' })).status, 400);
    assert.equal((await request(patient, '/vitals', 'POST', { measuredAt: new Date().toISOString(), systolic: 100, notes: '' })).status, 400);
    assert.equal((await request(doctor, '/vitals')).status, 403); assert.equal((await request(hospital, '/vitals')).status, 403);
  });
  await check('Patient requests an appointment with doctor', async () => {
    await book(patient, 'patient', accounts.doctor.email, at(2), 'Annual review'); await expectText(patient, 'Appointment requested.');
    await patient.getByRole('article', { name: 'Appointment: Annual review' }).getByText('requested', { exact: true }).waitFor();
    await nav(doctor, 'Appointments'); await expectText(doctor, 'Annual review'); await shot(doctor, 'doctor-request.png');
  });
  await check('Doctor confirms; patient sees persisted confirmation', async () => {
    await doctor.getByRole('article', { name: 'Appointment: Annual review' }).getByRole('button', { name: 'Confirm', exact: true }).click(); await expectText(doctor, 'Appointment updated.');
    await patient.reload(); await patient.getByRole('button', { name: 'Manage appointments', exact: true }).click(); await expectText(patient, 'confirmed');
  });
  const appointment = (await request(patient, '/appointments')).body.appointments[0];
  assert.equal(new Date(appointment.startsAt).toISOString(), new Date(at(2)).toISOString());
  await check('Appointment permissions, stale versions and overlap checks', async () => {
    assert.equal((await request(hospital, `/appointments/${appointment.id}`, 'PATCH', { action: 'cancel', version: appointment.version })).status, 404);
    assert.equal((await request(patient, `/appointments/${appointment.id}`, 'PATCH', { action: 'confirm', version: appointment.version })).status, 403);
    assert.equal((await request(doctor, `/appointments/${appointment.id}`, 'PATCH', { action: 'cancel', version: 1 })).status, 409);
    await book(doctor, 'doctor', accounts.patient.email, at(2), 'Conflicting appointment'); await expectText(doctor, 'overlaps an existing appointment');
  });
  await check('Patient reschedule requires renewed provider confirmation', async () => {
    await patient.getByRole('article', { name: 'Appointment: Annual review' }).getByRole('button', { name: 'Reschedule', exact: true }).click();
    await patient.locator('#appointmentTime').fill(at(3)); await patient.getByRole('button', { name: 'Save new time', exact: true }).click(); await expectText(patient, 'Appointment rescheduled.');
    await expectText(patient, 'requested');
  });
  await check('Hospital schedules, reschedules and patient cancels', async () => {
    await book(hospital, 'hospital', accounts.patient.email, at(4), 'Hospital consultation'); await expectText(hospital, 'Appointment scheduled.');
    await hospital.getByRole('article', { name: 'Appointment: Hospital consultation' }).getByRole('button', { name: 'Reschedule', exact: true }).click();
    await hospital.locator('#appointmentTime').fill(at(5)); await hospital.getByRole('button', { name: 'Save new time', exact: true }).click(); await expectText(hospital, 'Appointment rescheduled.');
    await patient.reload(); await nav(patient, 'Appointments');
    patient.once('dialog', (dialog) => dialog.accept()); await patient.getByRole('article', { name: 'Appointment: Hospital consultation' }).getByRole('button', { name: 'Cancel appointment', exact: true }).click(); await expectText(patient, 'Appointment updated.');
    await patient.getByLabel('Appointment filter').selectOption('all'); await expectText(patient, 'cancelled'); await shot(hospital, 'hospital-appointments.png');
  });
  await check('All roles persist notification preferences across reload and login', async () => {
    for (const [role, { page }] of Object.entries(accounts)) {
      await nav(page, 'Notifications'); const toggle = page.getByRole('switch', { name: 'Toggle Appointments notifications', exact: true }); await toggle.waitFor();
      assert.equal(await toggle.getAttribute('aria-checked'), 'true'); await toggle.click(); await expectText(page, 'Notification preference saved.');
      await page.reload(); await nav(page, 'Notifications'); assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      await page.locator('.mv-sidebar').getByRole('button', { name: 'Logout', exact: true }).click();
      await page.goto(`${base}/login/${role}`); await page.locator('#email').fill(accounts[role].email); await page.locator('#password').fill('CareTest2026'); await page.getByRole('button', { name: /Login|Sign in/i }).last().click();
      await page.waitForURL(`**/dashboard/${role}`); await nav(page, 'Notifications'); await toggle.waitFor(); assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    }
  });
  await check('Preferences suppress new appointment notifications; inbox read state persists', async () => {
    const before = (await request(patient, '/notifications')).body.notifications.length;
    await book(doctor, 'doctor', accounts.patient.email, at(6), 'Quiet appointment'); await expectText(doctor, 'Appointment scheduled.');
    assert.equal((await request(patient, '/notifications')).body.notifications.length, before);
    await nav(patient, 'Notifications'); const mark = patient.getByRole('button', { name: 'Mark read', exact: true }).first(); await mark.waitFor(); await mark.click();
    await expectText(patient, '· read'); await patient.reload(); await nav(patient, 'Notifications'); await expectText(patient, '· read');
  });
  await check('Cross-patient isolation, concurrent scheduling and appointment completion', async () => {
    const r = await fetch(`${api}/auth/register/patient`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: 'Other Patient', email: `other-${stamp}@example.com`, password: 'CareTest2026', dateOfBirth: '1991-01-01', bloodGroup: 'A+' }) });
    const other = await r.json(); assert.equal(r.status, 201);
    const headers = { Authorization: `Bearer ${other.token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${api}/api/vitals/${vital.id}`, { method: 'DELETE', headers })).status, 404);
    const mine = await (await fetch(`${api}/api/appointments`, { headers })).json(); assert.equal(mine.appointments.length, 0);
    const schedule = { participantEmail: accounts.doctor.email, startsAt: new Date(at(8)).toISOString(), durationMinutes: 30, reason: 'Concurrent booking', location: '' };
    const results = await Promise.all([request(patient, '/appointments', 'POST', schedule), fetch(`${api}/api/appointments`, { method: 'POST', headers, body: JSON.stringify(schedule) }).then(async (r) => ({ status: r.status, body: await r.json() }))]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const row = (await db.query("SELECT id FROM appointments WHERE reason = 'Quiet appointment'")).rows[0];
    await db.query("UPDATE appointments SET starts_at = NOW() - interval '1 hour' WHERE id = $1", [row.id]);
    await doctor.reload(); await nav(doctor, 'Appointments'); await doctor.getByLabel('Appointment filter').selectOption('all');
    await doctor.getByRole('article', { name: 'Appointment: Quiet appointment' }).getByRole('button', { name: 'Mark completed', exact: true }).click(); await expectText(doctor, 'completed');
  });
  await check('Vitals delete through UI persists', async () => {
    await nav(patient, 'Health Vitals'); patient.once('dialog', (dialog) => dialog.accept()); await patient.getByRole('button', { name: 'Delete measurement', exact: true }).click(); await expectText(patient, 'Measurement deleted.');
    assert.equal((await request(patient, '/vitals')).body.vitals.length, 0);
  });
  let documentId;
  await check('Hospital upload creates a real encrypted record in local MinIO', async () => {
    const fixturePage = await contexts[0].newPage();
    await fixturePage.setContent('<html><body style="font:26px sans-serif;padding:50px;background:white;color:black"><h1>Laboratory report</h1><p>Patient: Care Test Patient</p><p>Visit date: 2026-11-01</p><p>HbA1c: 6.2 percent</p><p>Fasting glucose: 94 mg/dL</p><p>This is synthetic test data.</p></body></html>');
    const png = await fixturePage.screenshot(); await fixturePage.close(); writeFileSync(join(artifacts, 'lab-report.png'), png);
    await nav(patient, 'Notifications');
    const uploadPreference = patient.getByRole('switch', { name: 'Toggle Document uploads notifications', exact: true });
    if (await uploadPreference.getAttribute('aria-checked') === 'false') { await uploadPreference.click(); await expectText(patient, 'Notification preference saved.'); }
    await nav(hospital, 'Overview'); await hospital.getByRole('button', { name: /Upload Document/, exact: false }).click();
    await hospital.locator('#uploadPatientEmail').fill(accounts.patient.email);
    await hospital.locator('.upload-modal input[type="file"]').setInputFiles({ name: 'care-lab-report.png', mimeType: 'image/png', buffer: png });
    await hospital.getByRole('button', { name: /Upload & Stamp/ }).click(); await hospital.locator('.upload-modal').waitFor({ state: 'hidden', timeout: 20000 });
    const row = (await db.query('SELECT id, encrypted, appwrite_file_id FROM documents ORDER BY created_at DESC LIMIT 1')).rows[0];
    assert.equal(row.encrypted, true); assert.ok(row.appwrite_file_id); documentId = row.id;
    await nav(patient, 'Notifications'); await patient.getByRole('button', { name: 'Refresh notifications', exact: true }).click(); await expectText(patient, 'Document uploaded');
  });
  await check('Doctor requests a document and patient approves via dashboard', async () => {
    await nav(doctor, 'Request Access'); await doctor.locator('#patientEmail').fill(accounts.patient.email);
    await doctor.getByRole('button', { name: 'Search', exact: true }).click(); await expectText(doctor, 'Care Test Patient');
    await doctor.locator('.mv-role-selection-row input').first().check(); await doctor.locator('#reason').fill('Review lab report');
    await doctor.getByRole('button', { name: 'Submit Request', exact: true }).click(); await expectText(doctor, 'Access request submitted');
    await patient.reload(); await nav(patient, 'Access Requests'); await patient.getByRole('button', { name: 'Approve', exact: true }).click(); await expectText(patient, 'approved');
    await doctor.reload(); await nav(doctor, 'Shared Documents'); await expectText(doctor, 'care-lab-report.png');
    await doctor.getByRole('button', { name: 'View', exact: true }).click(); await doctor.locator('.docviewer-shell').waitFor();
    const downloadPromise = doctor.waitForEvent('download'); await doctor.getByTitle('Download', { exact: true }).click();
    assert.equal((await downloadPromise).suggestedFilename(), 'care-lab-report.png'); await doctor.getByTitle('Close', { exact: true }).click();
  });
  await check('Doctor interaction notes save and delete through UI', async () => {
    await nav(doctor, 'Drug Interactions'); await doctor.locator('.di-search-input').fill(accounts.patient.email); await doctor.getByRole('button', { name: 'Search', exact: true }).click();
    await doctor.locator('[name="drugA"]').fill('Synthetic Drug A'); await doctor.locator('[name="drugB"]').fill('Synthetic Drug B');
    await doctor.locator('textarea[name="description"]').fill('Synthetic interaction note for UI verification.');
    await doctor.getByRole('button', { name: 'Save Interaction Note', exact: true }).click(); await expectText(doctor, 'Drug interaction saved successfully.');
    doctor.once('dialog', (dialog) => dialog.accept()); await doctor.locator('.di-delete-btn').click(); await expectText(doctor, 'Deleted.');
  });
  await check('All roles save profile settings', async () => {
    await nav(patient, 'Profile & Settings'); await patient.locator('#emergencyContact').fill('Test Contact'); await patient.getByRole('button', { name: 'Save Profile', exact: true }).click(); await expectText(patient, 'Profile saved');
    await nav(doctor, 'Profile & Settings'); await doctor.locator('#specialization').fill('Internal Medicine'); await doctor.getByRole('button', { name: 'Save Profile', exact: true }).click(); await expectText(doctor, 'Profile saved');
    await nav(hospital, 'Profile & Settings'); await hospital.locator('#contactPhone').fill('2125550198'); await hospital.getByRole('button', { name: 'Save Profile', exact: true }).click(); await expectText(hospital, 'Profile saved');
    await hospital.reload(); await nav(hospital, 'Profile & Settings'); assert.equal(await hospital.locator('#contactPhone').inputValue(), '2125550198');
    await patient.reload(); await nav(patient, 'Profile & Settings'); assert.equal(await patient.locator('#emergencyContact').inputValue(), 'Test Contact');
    await doctor.reload(); await nav(doctor, 'Profile & Settings'); assert.equal(await doctor.locator('#specialization').inputValue(), 'Internal Medicine');
    const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'patient', email: accounts.patient.email, password: 'CareTest2026' }) });
    assert.equal((await login.json()).user.profile.emergencyContactName, 'Test Contact');
  });
  await check('Real local AI summary and cited RAG chat', async () => {
    await nav(doctor, 'Shared Documents'); await doctor.getByRole('button', { name: 'AI Summary', exact: true }).click();
    await doctor.locator('.aisummary-result').waitFor({ timeout: 150000 }); await shot(doctor, 'doctor-ai-summary.png');
    await doctor.locator('.aisummary-close').click();
    for (let i = 0; i < 100; i++) {
      if ((await db.query('SELECT id FROM document_chunks WHERE document_id=$1 LIMIT 1', [documentId])).rowCount) break;
      if (i === 99) throw new Error('Document indexing did not finish.');
      await new Promise((r) => setTimeout(r, 1500));
    }
    await nav(doctor, 'AI Chat'); await doctor.locator('.chat-input').fill('What HbA1c value is in my laboratory report? Cite the document.');
    await doctor.locator('.chat-input-row button').click();
    await doctor.locator('.chat-bubble-assistant .chat-bubble-content').last().waitFor({ timeout: 150000 });
    for (let i = 0; i < 100; i++) { if (await doctor.locator('.chat-input-row button').textContent() === 'Send') break; await new Promise((r) => setTimeout(r, 1000)); }
    const answer = await doctor.locator('.chat-bubble-assistant .chat-bubble-content').last().innerText();
    assert.match(answer, /6[.,]2/); await doctor.locator('.chat-citation-badge').waitFor(); await shot(doctor, 'doctor-chat.png');
  });
  await check('Hospital revokes doctor access; emergency window permits document view', async () => {
    await nav(hospital, 'Staff Access'); await hospital.getByRole('button', { name: 'Revoke', exact: true }).click(); await expectText(hospital, 'Revoked');
    assert.equal((await request(doctor, `/documents/${documentId}/download`)).status, 403);
    await nav(doctor, 'Emergency Access'); await doctor.locator('#emergencyPatientEmail').fill(accounts.patient.email);
    await doctor.getByRole('button', { name: 'Start emergency access', exact: true }).click(); await expectText(doctor, 'Access active');
    await doctor.getByRole('button', { name: 'View', exact: true }).click(); await doctor.locator('.docviewer-shell').waitFor(); await doctor.getByTitle('Close', { exact: true }).click();
    await shot(doctor, 'doctor-emergency.png');
    await nav(hospital, 'Emergency Access'); await hospital.locator('#emergencyPatientEmail').fill(accounts.patient.email); await hospital.getByRole('button', { name: 'Start emergency access', exact: true }).click(); await expectText(hospital, 'Access active');
    await nav(patient, 'Notifications'); await expectText(patient, 'Emergency access started');
    await db.query("UPDATE emergency_access_events SET ends_at = NOW() - interval '1 minute'");
    assert.equal((await request(doctor, `/documents/${documentId}/download`)).status, 403);
    await db.query('UPDATE patients SET emergency_consent_enabled = false');
    assert.equal((await request(doctor, '/emergency-access/initiate', 'POST', { patientEmail: accounts.patient.email })).status, 403);
  });
  // Existing workflows and every dashboard tab are checked below.
  await check('All dashboard tabs render in light/dark themes and mobile without overflow', async () => {
    const tabs = { patient: ['Overview','Health Vitals','Appointments','Storage Vault','Access Requests','Audit Log','AI Chat','Profile & Settings','Notifications'],
      doctor: ['Overview','Appointments','Shared Documents','Active Grants','Request Access','Request History','Activity Log','Emergency Access','Drug Interactions','AI Chat','Profile & Settings','Notifications'],
      hospital: ['Overview','Appointments','Upload Queue','Staff Access','Compliance & Audit','Emergency Access','AI Chat','Profile & Settings','Notifications'] };
    for (const [role, { page }] of Object.entries(accounts)) {
      for (const label of tabs[role]) { await nav(page, label); await page.waitForTimeout(60); }
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        // On mobile, the shared horizontal nav remains reachable.
        await nav(page, 'Appointments'); await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
        await shot(page, `${role}-${width}-appointments-dark.png`);
        for (const label of tabs[role]) {
          await nav(page, label);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${role} ${label} overflows at ${width}px`);
        }
        await nav(page, 'Appointments');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        assert.equal(overflow, false, `${role} overflows at ${width}px`);
        await page.getByRole('button', { name: 'Toggle theme', exact: true }).click(); await shot(page, `${role}-${width}-appointments-light.png`);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  });
  assert.deepEqual(failures, [], 'Browser/API errors');
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify({ passed: steps, errors: failures, artifacts }, null, 2));
  console.log(`Artifacts: ${artifacts}`);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await shot(currentPage, 'failure.png').catch(() => {});
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify({ passed: steps, error: error.stack, errors: failures }, null, 2));
  console.error(error); console.error(`Artifacts: ${artifacts}`); process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch((e) => console.error('Test DB cleanup:', e.message)); await admin.end();
  const storage = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } });
  try { const objects = await storage.send(new ListObjectsV2Command({ Bucket: bucket })); if (objects.Contents?.length) await storage.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key })) } })); await storage.send(new DeleteBucketCommand({ Bucket: bucket })); } catch (e) { if (e.name !== 'NoSuchBucket') console.error('Test bucket cleanup:', e.message); }
  storage.destroy();
}
