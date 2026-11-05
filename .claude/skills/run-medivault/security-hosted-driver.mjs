// Controlled hosted smoke test: synthetic accounts only; requires database/storage cleanup credentials.
import 'dotenv/config';
import { chromium } from 'playwright';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { deleteFile } from '../../../server/src/storage.js';
const base = process.env.SECURITY_HOSTED_BASE;
assert.ok(base?.startsWith('https://'), 'Set SECURITY_HOSTED_BASE explicitly.');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
const artifacts = process.env.SECURITY_HOSTED_ARTIFACTS || `/private/tmp/medivault-security-hosted-${Date.now()}`;
fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
if (process.env.SECURITY_HOSTED_COOKIE_JAR) {
  const jar=fs.readFileSync(process.env.SECURITY_HOSTED_COOKIE_JAR,'utf8').split('\n').filter(x=>x.includes('\t')).map(x=>{const v=x.split('\t');return {name:v[5],value:v[6],domain:v[0].replace('#HttpOnly_',''),path:v[2],httpOnly:true,secure:true,sameSite:'None'};});await context.addCookies(jar);
}
const req = context.request, stamp = Date.now(), users = [], results = [], pageErrors = [];
const traffic = [];
const page = await context.newPage(); page.on('response', r => { if (/auth\/login/.test(r.url())) traffic.push({ status: r.status(), host: new URL(r.url()).host }); }); page.on('pageerror', e => pageErrors.push(e.message));
const pass = crypto.randomBytes(16).toString('hex')+'A1';
async function call(path, body, token) {
  const r=await req.fetch(`${base}${path}`,{method:body?'POST':'GET',headers:token?{Authorization:`Bearer ${token}`}:{},...(body?{data:body}:{})});
  return { status:r.status(), data:await r.json().catch(()=>({})) };
}
try {
  assert.equal((await call('/health')).status,200);
  for(const role of ['patient','doctor','hospital']) {
    const email=`security-${role}-${stamp}@example.com`;
    const data={email,password:pass,fullName:'Synthetic Security Test',dateOfBirth:'1990-01-01',bloodGroup:'O+',gender:'Female',licenseNumber:`SEC-${role}-${stamp}`,specialization:'Cardiology',hospitalName:'Synthetic Security Hospital',phone:'2125550199',address:'Synthetic test address'};
    const created=await call(`/auth/register/${role}`,data);assert.equal(created.status,201);users.push(created.data.user);
    const token=created.data.token;
    await page.goto(`${base}/login/${role}`);await page.locator('#email').fill(email);await page.locator('#password').fill(pass);await page.getByRole('button',{name:`Login as ${role[0].toUpperCase()+role.slice(1)}`,exact:true}).click();await page.waitForURL(`**/dashboard/${role}`);await page.locator('.mv-topbar-title').waitFor();
    await page.getByRole('link',{name:'Account security',exact:true}).click();await page.locator('#currentPassword').waitFor();
    assert.equal((await call('/auth/logout',{},token)).status,200);assert.equal((await call('/auth/session',null,token)).status,401);
    results.push(`${role}: real registration, browser login, security screen and token revocation`);
  }
  const patient=users.find(u=>u.role==='patient'),doctor=users.find(u=>u.role==='doctor');
  const d=(await call('/auth/login',{role:'doctor',email:doctor.email,password:pass})).data.token;
  const p=(await call('/auth/login',{role:'patient',email:patient.email,password:pass})).data.token;
  const content=Buffer.from('Synthetic security verification record. No patient information.');
  const upload=await req.post(`${base}/api/documents/upload`,{headers:{Authorization:`Bearer ${d}`},multipart:{patientId:patient.email,documentType:'lab_report',file:{name:'security-verification.txt',mimeType:'text/plain',buffer:content}}});assert.equal(upload.status(),201);
  const docId=(await upload.json()).documentId;
  const doc=(await db.query('SELECT dek_wrapped FROM documents WHERE id=$1',[docId])).rows[0];assert.match(doc.dek_wrapped,/^v1:/);
  const download=await req.get(`${base}/api/documents/${docId}/download`,{headers:{Authorization:`Bearer ${p}`}});assert.equal(download.status(),200);assert.deepEqual(await download.body(),content);
  results.push('Hosted encrypted upload/download uses a wrapped key and returns identical bytes');
  const changed=await call('/auth/change-password',{currentPassword:pass,password:`New${pass}`},p);assert.equal(changed.status,200);assert.equal((await call('/auth/session',null,p)).status,401);
  const fresh=await call('/auth/login',{role:'patient',email:patient.email,password:`New${pass}`});assert.equal(fresh.status,200);
  assert.equal((await call('/auth/logout-all',{},fresh.data.token)).status,200);assert.equal((await call('/auth/session',null,fresh.data.token)).status,401);
  results.push('Password change and sign-out-all invalidate hosted sessions');
  await page.goto(`${base}/forgot-password?role=patient`);await page.locator('#email').waitFor();await page.locator('#email').fill(patient.email);await page.getByRole('button',{name:'Send reset link',exact:true}).click();
  if(process.env.SECURITY_EXPECT_EMAIL_UNCONFIGURED==='true') {await page.getByText('Password recovery email is not available yet.',{exact:false}).waitFor();results.push('Unconfigured recovery email fails visibly without exposing a reset token');}
  await page.screenshot({path:`${artifacts}/recovery.png`,fullPage:true});
  assert.deepEqual(pageErrors,[]);
  console.log(`PASS ${results.length} hosted security groups`);
} catch(e) {process.exitCode=1;console.error('Hosted security check failed:',e.message);console.error('Login responses', JSON.stringify(traffic));console.error('Visible error', await page.locator('.auth-error-banner').allTextContents());await page.screenshot({path:`${artifacts}/failure.png`,fullPage:true});}
finally {
  // Let upload background indexing finish before removing its synthetic rows.
  await new Promise(r=>setTimeout(r,3000));
  const ids=users.map(u=>u.id);
  if(ids.length){
    const objects=await db.query('SELECT appwrite_file_id FROM documents WHERE uploaded_by_user_id=ANY($1::uuid[])',[ids]);
    for(const o of objects.rows)if(o.appwrite_file_id)await deleteFile(o.appwrite_file_id);
    // Audit foreign keys do not cascade on actors; remove only these synthetic actors/documents.
    await db.query('DELETE FROM audit_logs WHERE actor_user_id=ANY($1::uuid[]) OR document_id IN (SELECT id FROM documents WHERE uploaded_by_user_id=ANY($1::uuid[]))',[ids]);
    await db.query('DELETE FROM documents WHERE uploaded_by_user_id=ANY($1::uuid[])',[ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  }
  fs.writeFileSync(`${artifacts}/report.json`,JSON.stringify({base,verifiedAt:new Date().toISOString(),results,errors:pageErrors,passed:!process.exitCode,emailDelivery:'Not tested without provider credentials',syntheticUsersRemoved:users.length},null,2)+'\n');
  await browser.close();await db.end();console.log(`Artifacts: ${artifacts}`);
}
