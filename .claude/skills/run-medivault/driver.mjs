// WellNest smoke driver. Runs the frontend through a real browser:
// landing page -> register <role> -> dashboard -> Storage Vault tab -> logout
// -> login again. Screenshots land in --shots (default: ./.claude/skills/run-medivault/shots).
//
//   node .claude/skills/run-medivault/driver.mjs [--role patient|doctor|hospital|all|chat] [--base http://localhost:5177] [--shots DIR]
//
// Requires: dev server already listening on --base, and `playwright` resolvable
// from the repo (npm install --no-save playwright). Exits 1 on any failure or
// any console/page error.
//
// --role chat drives the Chat/RAG feature end-to-end (registers a doctor +
// patient, uploads a document, waits for background indexing, asks a
// question in the Chat tab, asserts a citation appears). It needs the real
// Express API with EMBEDDING_BASE_URL/EMBEDDING_MODEL configured — it does
// NOT work against the mock-auth path (no backend to call). Not included in
// --role all, which is meant to also pass against mock auth.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE = arg('base', 'http://localhost:5177');
const SHOTS = arg('shots', '.claude/skills/run-medivault/shots');
const ROLE = arg('role', 'patient');
const PASSWORD = 'Medivault2026'; // >= 8 chars, letter + number (src/utils/authValidation.js)
mkdirSync(SHOTS, { recursive: true });

const ROLES = {
  patient: {
    fill: async (page, email) => {
      await page.fill('#fullName', 'Smoke Patient');
      await page.fill('#email', email);
      await page.fill('#dateOfBirth', '1990-05-14');
      await page.selectOption('#bloodGroup', { label: 'O+' });
    },
    secondTab: 'Storage Vault',
  },
  doctor: {
    fill: async (page, email) => {
      await page.fill('#fullName', 'Smoke Doctor');
      await page.fill('#email', email);
      await page.fill('#licenseNumber', `LIC-${Date.now()}`); // unique per run: doctors.license_number is UNIQUE
      await page.selectOption('#specialization', { label: 'Cardiology' });
    },
    secondTab: null,
  },
  hospital: {
    fill: async (page, email) => {
      await page.fill('#hospitalName', 'Smoke General Hospital');
      await page.fill('#officialEmail', email);
      await page.fill('#licenseNumber', `HOSP-${Date.now()}`); // unique per run
      await page.fill('#phone', '9876543210');
      await page.fill('#address', '1 Test Street');
      const proof = join(SHOTS, 'proof.pdf');
      writeFileSync(proof, '%PDF-1.4\n% smoke proof\n');
      await page.setInputFiles('#proof', proof);
    },
    secondTab: null,
  },
};

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const log = (...a) => console.log('[driver]', ...a);

async function runRole(role) {
  const spec = ROLES[role];
  if (!spec) throw new Error(`unknown role ${role}`);
  const email = `smoke-${role}-${Date.now()}@example.com`;

  await page.goto(`${BASE}/register/${role}`, { waitUntil: 'networkidle' });
  const heading = (await page.locator('h1, h2').first().textContent())?.trim();
  log(role, 'register heading:', heading);
  await spec.fill(page, email);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await shot(`${role}-1-register-filled`);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/dashboard/${role}`, { timeout: 10000 });
  await page.waitForTimeout(1200); // dashboard panels fade in; an immediate shot is half-transparent
  log(role, 'dashboard url:', page.url());
  await shot(`${role}-2-dashboard`);

  if (spec.secondTab) {
    await page.getByText(spec.secondTab, { exact: true }).first().click();
    await page.waitForTimeout(800);
    const body = await page.locator('body').innerText();
    if (!body.includes(spec.secondTab)) throw new Error(`${spec.secondTab} tab did not render`);
    await shot(`${role}-3-${spec.secondTab.toLowerCase().replace(/\s+/g, '-')}`);
  }

  // Logout via the sidebar button, then log back in with the same mock account.
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/login/${role}`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/dashboard/${role}`, { timeout: 10000 });
  log(role, 'login round-trip ok:', page.url());
}

async function registerAndLogout(role, spec) {
  const email = `smoke-${role}-${Date.now()}@example.com`;
  await page.goto(`${BASE}/register/${role}`, { waitUntil: 'networkidle' });
  await spec.fill(page, email);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/dashboard/${role}`, { timeout: 10000 });
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForTimeout(500);
  return email;
}

async function runChatFlow() {
  const patientEmail = await registerAndLogout('patient', ROLES.patient);
  log('chat: patient registered', patientEmail);

  // Doctor: register and stay logged in (uploads + chats as this doctor).
  const doctorEmail = `smoke-doctor-${Date.now()}@example.com`;
  await page.goto(`${BASE}/register/doctor`, { waitUntil: 'networkidle' });
  await ROLES.doctor.fill(page, doctorEmail);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard/doctor', { timeout: 10000 });
  log('chat: doctor registered', doctorEmail);

  // Upload a document for the patient. The server extracts real text/vision
  // content to index, so a fake PDF (fine for hospital-proof, which is never
  // parsed) won't do — screenshot the current page to get a real PNG.
  const testDocPath = join(SHOTS, 'chat-test-doc.png');
  await page.screenshot({ path: testDocPath });

  await page.getByText('Upload Document', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.fill('#uploadPatientEmail', patientEmail);
  await page.setInputFiles('input[type="file"]', testDocPath);
  await page.getByRole('button', { name: /Upload.*Stamp/ }).click();
  await page.waitForTimeout(4000);
  const closeBtn = page.getByRole('button', { name: 'Cancel' });
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
  log('chat: document uploaded, waiting for background indexing (vision description + embedding)...');
  // Indexing runs fire-and-forget after the upload response: a vision-model
  // description call plus an embedding call. Observed 5-23s across runs this
  // session (varies with model load) — a fixed wait here was flaky (a 20s
  // wait once lost the race at 23s), so poll by retrying the chat message
  // instead of padding a single sleep.
  await page.waitForTimeout(10000);

  await page.getByText('💬 Chat', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await shot('chat-1-tab-open');

  let citationText = '';
  let reply = '';
  for (let attempt = 1; attempt <= 4 && !citationText; attempt++) {
    await page.fill('.chat-input', `Describe the document I just uploaded for this patient. (attempt ${attempt})`);
    await page.click('.chat-input-row button.btn-primary');
    await page.waitForFunction(() => {
      const btn = document.querySelector('.chat-input-row button.btn-primary');
      return btn && btn.textContent.trim() === 'Send';
    }, { timeout: 60000 });
    await page.waitForTimeout(500);

    reply = (await page.locator('.chat-bubble-assistant .chat-bubble-content').last().innerText()).trim();
    if (!reply) throw new Error('chat: assistant reply was empty');

    const citationVisible = await page.locator('.chat-citations').last().isVisible().catch(() => false);
    if (citationVisible) {
      citationText = await page.locator('.chat-citations').last().innerText();
    } else if (attempt < 4) {
      log(`chat: attempt ${attempt} got no citation yet (indexing still in flight) — retrying in 8s`);
      await page.waitForTimeout(8000);
    }
  }
  await shot('chat-2-answered');
  log('chat: assistant reply:', reply.slice(0, 120).replace(/\n+/g, ' '));

  if (!citationText) throw new Error('chat: no citation after 4 attempts — retrieval returned nothing (check EMBEDDING_BASE_URL/EMBEDDING_MODEL are set and pgvector is enabled)');
  log('chat: citation shown:', citationText.replace(/\n+/g, ' '));
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  log('landing title:', await page.title());
  await shot('0-landing');

  if (ROLE === 'chat') {
    await runChatFlow();
  } else {
    const roles = ROLE === 'all' ? Object.keys(ROLES) : [ROLE];
    for (const r of roles) await runRole(r);
  }

  if (errors.length) {
    console.error('[driver] browser errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    log('OK - no console/page/network errors. Screenshots in', SHOTS);
  }
} catch (e) {
  console.error('[driver] FAILED:', e.message);
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
