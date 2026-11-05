// Explicit UI fixtures cover new interactions/failure states. care-driver.mjs covers real services.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = process.env.DASHBOARD_UX_E2E_BASE || 'http://localhost:5177';
const artifacts = process.env.DASHBOARD_UX_E2E_ARTIFACTS || `/private/tmp/medivault_dashboard_ux_${Date.now()}`;
fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const jar = process.env.DASHBOARD_UX_E2E_COOKIE_JAR ? fs.readFileSync(process.env.DASHBOARD_UX_E2E_COOKIE_JAR, 'utf8').split('\n').filter(x => x.includes('\t')).map(x => { const v = x.split('\t'); return { name: v[5], value: v[6], domain: v[0].replace('#HttpOnly_', ''), path: v[2], httpOnly: true, secure: true, sameSite: 'None' }; }) : [];
const results = [], errors = [], browser = await chromium.launch();
const id1 = '11111111-1111-4111-8111-111111111111', id2 = '22222222-2222-4222-8222-222222222222';
const docs = [{ id: id1, name: 'Blood test report.pdf', type: 'lab_report', date: '2026-11-01', status: 'encrypted', uploadedBy: 'care@example.com', patient: 'Jamie Morgan', patientEmail: 'jamie@example.com' }, { id: id2, name: 'Chest imaging.png', type: 'imaging', date: '2026-10-15', status: 'encrypted', uploadedBy: 'hospital@example.com', patient: 'Chris Patel', patientEmail: 'chris@example.com' }];
const request = { id: '33333333-3333-4333-8333-333333333333', requester: 'doctor@example.com', role: 'doctor', reason: 'Review laboratory results before our consultation.', scope: 'specific_documents', status: 'pending', documentIds: [id1] };
const metric = (key, value) => ({ key, title: key, value: String(value), hint: 'UI fixture' });
const patient = { metrics: [metric('docs', 2), metric('pending', 1), metric('active', 0), metric('audit', 1)], documents: docs, accessRequests: [request, { ...request, id: 'approved', status: 'approved', requester: 'other@example.com' }], auditEvents: [{ id: 'event', title: 'view_document', time: '2026-11-01 10:30', description: '' }], notifications: [] };
const doctor = { metrics: [metric('grants', 1), metric('pending', 1), metric('emergency', 0), metric('views', 1)], sharedDocuments: docs, requestHistory: [{ id: 'history', patient: 'Jamie Morgan', reason: 'Review records', scope: 'specific_documents', status: 'pending' }], grantedAccess: [], auditEvents: patient.auditEvents, notifications: [] };
const hospital = { metrics: [metric('staff', 0)], uploadQueue: [], staffAccess: [], complianceEvents: [], notifications: [] };
async function check(name, action) { await action(); results.push(name); console.log('PASS', name); }
async function open(role, mode = 200) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (jar.length) await context.addCookies(jar);
  const state = { mode, invalidSchema: false, detailsFail: true, submitted: null };
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url()); let status = 200, body = {};
    if (url.pathname.includes('/dashboard/')) { status = state.mode; body = status === 200 ? state.invalidSchema ? { metrics: [] } : role === 'patient' ? patient : role === 'doctor' ? doctor : hospital : { message: 'Injected service failure' }; }
    else if (url.pathname === '/api/documents/by-ids') { status = state.detailsFail ? 503 : 200; body = status === 200 ? { documents: [{ id: id1, documentName: 'Blood test report.pdf', documentType: 'lab_report', visitDate: '2026-11-01' }] } : { message: 'Injected detail lookup failure' }; }
    else if (url.pathname === '/api/patients/search') body = { patient: { id: 'patient-id', fullName: 'Jamie Morgan' }, documents: docs.map(d => ({ id: d.id, documentName: d.name, documentType: d.type, visitDate: d.date })) };
    else if (url.pathname === '/api/access-requests/documents') { state.submitted = route.request().postDataJSON(); body = { message: 'Request submitted.' }; }
    else if (url.pathname === '/api/vitals') body = { vitals: [{ id: 'vital', measuredAt: new Date().toISOString(), heartRate: 76, systolic: 118, diastolic: 76, glucose: 94, notes: '' }] };
    else if (url.pathname === '/api/appointments') body = { appointments: [{ id: 'appointment', startsAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 30, providerName: 'Dr. Taylor', patientName: 'Jamie Morgan', providerEmail: 'doctor@example.com', patientEmail: 'jamie@example.com', reason: 'Follow-up consultation', location: 'Main clinic', status: 'requested', version: 1 }] };
    else if (url.pathname === '/api/chat/sessions') body = { sessions: [] };
    else if (url.pathname === '/api/notification-preferences') body = { preferences: [] };
    else if (url.pathname === '/api/notifications') body = { notifications: [] };
    await route.fulfill({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify(body) });
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(`${role}: ${e.message}`));
  await page.addInitScript(role => localStorage.setItem('medivault.auth', JSON.stringify({ token: 'ux-fixture', user: { role, email: `${role}@example.com`, profile: { fullName: 'Jamie Morgan', hospitalName: 'Example Hospital' } } })), role);
  await page.goto(base + `/dashboard/${role}`);
  return { page, context, state };
}
async function nav(page, name) {
  if (!await page.locator('.mv-sidebar').isVisible()) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.mv-sidebar').getByRole('button', { name, exact: true }).click();
}
try {
  for (const role of ['patient', 'doctor', 'hospital']) await check(`${role}: failed or incomplete responses recover without false counts; 401 offers sign-in`, async () => {
    const { page, context, state } = await open(role, 503);
    await page.getByRole('heading', { name: 'We couldn’t load your workspace', exact: true }).waitFor(); assert.equal(await page.locator('.mv-stat-tile').count(), 0);
    state.mode = 200; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await page.locator('.mv-overview-heading').waitFor();
    state.invalidSchema = true; await page.reload(); await page.getByRole('heading', { name: 'We couldn’t load your workspace', exact: true }).waitFor(); assert.equal(await page.locator('.mv-stat-tile').count(), 0); state.invalidSchema = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await page.locator('.mv-overview-heading').waitFor();
    state.mode = 401; await page.reload(); await page.getByRole('heading', { name: 'Please sign in again', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Sign in again', exact: true }).getAttribute('href'), `/login/${role}`); await context.close();
  });
  const p = await open('patient'); await p.page.locator('.mv-overview-heading').waitFor();
  await check('Patient overview prioritizes requests, offers booking, and explains appointment state', async () => {
    await p.page.getByRole('heading', { name: '1 access request to review', exact: true }).waitFor();
    await p.page.getByText('Awaiting confirmation', { exact: true }).waitFor(); await p.page.getByText('Document access activity', { exact: true }).waitFor();
    await p.page.getByRole('button', { name: 'Request appointment', exact: true }).click(); await p.page.locator('#participantEmail').waitFor();
    await nav(p.page, 'Overview');
  });
  await check('Patient sees access reasons and can retry a failed document detail lookup', async () => {
    await p.page.getByRole('button', { name: 'Review requests', exact: true }).click(); await p.page.getByText(request.reason, { exact: true }).first().waitFor();
    const card = p.page.getByRole('article', { name: 'Access request from doctor@example.com', exact: true });
    await card.getByRole('button', { name: 'View 1 requested document', exact: true }).click(); await card.getByText('We couldn’t load the document details. Please try again.', { exact: true }).waitFor();
    p.state.detailsFail = false; await card.getByRole('button', { name: 'Try again', exact: true }).click(); await card.getByText('Blood test report.pdf', { exact: true }).waitFor();
    await p.page.getByRole('button', { name: 'Approved 1', exact: true }).click(); assert.equal(await p.page.getByRole('article').count(), 1);
  });
  for (const [role, instance, view] of [['patient', p, 'Storage Vault'], ['doctor', await open('doctor'), 'Shared Documents']]) {
    await check(`${role}: record search, type/date filters, reset, and visible actions`, async () => {
      await instance.page.locator('.mv-topbar-title').waitFor(); await nav(instance.page, view);
      const search = instance.page.getByRole('searchbox', { name: 'Search documents', exact: true }); await search.fill(role === 'patient' ? 'blood' : 'jamie@example.com');
      assert.equal(await instance.page.locator('.mv-record-item').count(), 1); await instance.page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await instance.page.getByLabel('Filter by Type', { exact: true }).selectOption('imaging'); assert.equal(await instance.page.locator('.mv-record-item').count(), 1);
      await instance.page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await instance.page.getByLabel('Filter by Date', { exact: true }).fill('2026-11-01'); assert.equal(await instance.page.locator('.mv-record-item').count(), 1);
      await search.fill('no match'); await instance.page.getByRole('heading', { name: 'No matching records', exact: true }).waitFor(); await instance.page.getByRole('button', { name: 'Reset search', exact: true }).click(); assert.equal(await instance.page.locator('.mv-record-item').count(), 2);
      await instance.page.setViewportSize({ width: 390, height: 844 }); assert.ok(await instance.page.getByRole('button', { name: 'View', exact: true }).first().isVisible()); assert.equal(await instance.page.locator('.mv-record-actions').first().evaluate(e => getComputedStyle(e).opacity), '1');
      await instance.page.setViewportSize({ width: 1440, height: 1000 });
    });
    if (role === 'doctor') {
      await check('Doctor can search with Enter, choose records, give a reason, and submit', async () => {
        await nav(instance.page, 'Request Access'); await instance.page.locator('#patientEmail').fill('jamie@example.com'); await instance.page.locator('#patientEmail').press('Enter');
        await instance.page.getByText('Patient found', { exact: true }).waitFor(); assert.match(await instance.page.locator('li[aria-current="step"]').innerText(), /2\s*Choose records/);
        await instance.page.locator('.mv-role-selection-row input').first().check(); const submit = instance.page.getByRole('button', { name: 'Submit Request', exact: true }); assert.ok(await submit.isDisabled());
        await instance.page.locator('#reason').fill('   '); assert.ok(await submit.isDisabled()); await instance.page.locator('#reason').fill('Review laboratory results'); await submit.click();
        await instance.page.getByText('Access request submitted!', { exact: true }).waitFor(); assert.deepEqual(instance.state.submitted, { patientId: 'patient-id', documentIds: [id1], reason: 'Review laboratory results' });
      });
      await instance.context.close();
    }
  }
  await p.context.close();
  await check('Patient and doctor overviews stay usable with populated data in light/dark and phone/tablet/desktop', async () => {
    for (const role of ['patient', 'doctor']) { const { page, context } = await open(role); await page.locator('.mv-overview-heading').waitFor();
      for (const width of [320,390,768,1024,1440]) { await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${role} ${width}`);
        const clipped = await page.locator('.mv-overview-layout, .mv-heading-actions, .mv-care-metrics, .mv-stat-tile').evaluateAll(es => es.filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.className)); assert.deepEqual(clipped, [], `${role} ${width}`);
        await page.evaluate(() => scrollTo({top:1000,behavior:'instant'}));const topbar=await page.locator('.mv-topbar').boundingBox();assert.ok(topbar.y>=-1 && topbar.y<2, `${role} header not reachable at ${width}`);await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));if ([390,1440].includes(width)) await page.screenshot({ path: `${artifacts}/${role}-${width}-light.png`, fullPage: true });
      }
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click(); await page.screenshot({ path: `${artifacts}/${role}-dark.png`, fullPage: true }); await context.close();
    }
  });
  assert.deepEqual(errors, []);
} catch (error) { errors.push(error.message); console.error(error); process.exitCode = 1; }
finally { await browser.close(); fs.writeFileSync(`${artifacts}/report.json`, JSON.stringify({ base, verifiedAt: new Date().toISOString(), results, errors, scope: 'Controlled UI fixtures cover new interactions and injected service failures. Real workflows are verified by care-driver.mjs.' }, null, 2)); console.log(`Artifacts: ${artifacts}`); }
