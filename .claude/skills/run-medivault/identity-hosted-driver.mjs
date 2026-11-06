// Portfolio hosted smoke: actual admin login, synthetic provider accounts, explicit seeded email fixtures.
// Does not send external mail or claim to verify external inbox delivery.
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { deleteFile } from '../../../server/src/storage.js';
const base=process.env.IDENTITY_HOSTED_BASE;assert.ok(base?.startsWith('https://'),'Set IDENTITY_HOSTED_BASE explicitly.');
const credential=JSON.parse(fs.readFileSync(process.env.IDENTITY_ADMIN_CREDENTIALS_FILE,'utf8'));
const url=new URL(process.env.DATABASE_URL);assert.ok(!['localhost','127.0.0.1','[::1]'].includes(url.hostname));url.searchParams.set('sslmode','verify-full');const db=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true}});await db.query('SELECT 1');
const artifacts=process.env.IDENTITY_HOSTED_ARTIFACTS||`/private/tmp/medivault-identity-hosted-${Date.now()}`;fs.mkdirSync(artifacts,{recursive:true,mode:0o700});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}});
if(process.env.IDENTITY_HOSTED_COOKIE_JAR){const jar=fs.readFileSync(process.env.IDENTITY_HOSTED_COOKIE_JAR,'utf8').split('\n').filter(x=>x.includes('\t')).map(x=>{const v=x.split('\t');return{name:v[5],value:v[6],domain:v[0].replace('#HttpOnly_',''),path:v[2],httpOnly:true,secure:true,sameSite:'None'};});await context.addCookies(jar);}
const page=await context.newPage(),request=context.request,stamp=Date.now(),password=crypto.randomBytes(16).toString('hex')+'A1',created=[],results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));let adminToken;
async function call(path,body,token){const r=await request.fetch(base+path,{method:body?'POST':'GET',headers:token?{Authorization:`Bearer ${token}`}:{},...(body?{data:body}:{})});return{status:r.status(),data:await r.json().catch(()=>({}))};}
async function own(token){const r=await call('/auth/account-status',null,token);assert.equal(r.status,200);return r.data;}
try{
  await page.goto(base+'/admin/reviews');await page.waitForURL('**/admin/login');await page.locator('#email').fill(credential.email);await page.locator('#password').fill(credential.password);await page.getByRole('button',{name:'Sign in to review',exact:true}).click();await page.waitForURL('**/admin/reviews');await page.locator('#reviewFilter').waitFor();
  adminToken=await page.evaluate(()=>JSON.parse(localStorage.getItem('medivault.auth')).token);assert.equal((await own(adminToken)).isAdmin,true);results.push('Provisioned administrator signs in through the dedicated review login');
  for(const role of ['doctor','hospital']){
    const r=await call(`/auth/register/${role}`,{email:`identity-${role}-${stamp}@example.com`,password,fullName:'Synthetic Identity Doctor',hospitalName:'Synthetic Identity Hospital',licenseNumber:`IDENTITY-${role}-${stamp}`,specialization:'Cardiology',phone:'2125550199',address:'Synthetic portfolio address'});assert.equal(r.status,201);created.push({id:r.data.user.id,email:r.data.user.email,role,token:r.data.token});
    const before=await own(r.data.token);assert.equal(before.emailVerified,false);assert.equal(before.application.status,'draft');assert.equal(before.approvalRequired,false);assert.equal((await call('/auth/admin/applications',null,r.data.token)).status,403);
    // Explicit test fixture: emails are synthetic; external delivery is not being exercised.
    await db.query('UPDATE users SET email_verified=true WHERE id=$1',[r.data.user.id]);
  }
  results.push('Portfolio mode reports real draft/unverified state and denies ordinary accounts admin access');
  const proof=Buffer.from('%PDF-1.4\nSynthetic portfolio credential evidence\n%%EOF');
  for(const user of created){
    const a=(await own(user.token)).application;
    const uploaded=await request.post(base+'/auth/provider/proof',{headers:{Authorization:`Bearer ${user.token}`},multipart:{revision:String(a.revision),proof:{name:'synthetic-credential.pdf',mimeType:'application/pdf',buffer:proof}}});assert.equal(uploaded.status(),201);
    const next=(await own(user.token)).application;
    assert.match((await db.query('SELECT dek_wrapped FROM provider_proofs WHERE id=$1',[next.proofId])).rows[0].dek_wrapped,/^v1:/);
    const download=await request.get(`${base}/auth/credential-proofs/${next.proofId}/download`,{headers:{Authorization:`Bearer ${adminToken}`}});assert.equal(download.status(),200);assert.deepEqual(await download.body(),proof);
    assert.equal((await call('/auth/provider/submit',{revision:next.revision,note:'Synthetic hosted verification fixture'},user.token)).status,200);
  }
  results.push('Both provider roles upload wrapped evidence, download identical bytes and submit applications');
  const doctor=created.find(u=>u.role==='doctor'),hospital=created.find(u=>u.role==='hospital');
  await page.locator('#reviewFilter').selectOption('all');const card=page.getByRole('article',{name:`Application for ${doctor.email}`,exact:true});await card.waitFor();await card.getByRole('textbox',{name:'Review reason',exact:true}).fill('Reviewed synthetic hosted portfolio credential');await card.getByRole('checkbox').check();await card.getByRole('button',{name:'Approve application',exact:true}).click();await page.getByText('Application approved.',{exact:true}).waitFor();assert.equal((await own(doctor.token)).application.status,'approved');
  results.push('Administrator approves the current synthetic application through the live UI');
  const h=(await own(hospital.token)).application;
  assert.equal((await call(`/auth/admin/applications/${hospital.id}/decision`,{decision:'rejected',revision:h.revision,reason:'Please replace this synthetic proof with a clearer scan'},adminToken)).status,200);
  assert.equal((await own(hospital.token)).application.status,'rejected');assert.equal((await call('/auth/provider/submit',{revision:h.revision},hospital.token)).status,409);
  const current=(await own(hospital.token)).application;
  assert.equal((await call('/auth/provider/submit',{revision:current.revision,note:'Resubmitting synthetic evidence'},hospital.token)).status,200);
  const history=await call(`/auth/admin/applications/${hospital.id}/events`,null,adminToken);assert.equal(history.status,200);assert.ok(history.data.events.some(e=>e.action==='rejected'&&e.licenseNumber));
  results.push('Rejection, stale revision protection, resubmission and historical license evidence persist');
  await page.goto(base+'/account/verification');await page.getByRole('heading',{name:'Your account verification',exact:true}).waitFor();await page.getByText('Email delivery is awaiting configuration or is limited to the portfolio test inbox.',{exact:true}).waitFor();
  assert.equal((await call('/auth/verification/confirm',{token:'invalid-test-token'})).status,400);assert.deepEqual(errors,[]);results.push('Missing email credential is visible and malformed confirmation links fail safely');
  console.log(`PASS ${results.length} hosted identity groups`);
}catch(e){process.exitCode=1;console.error('Hosted identity check failed:',e.message);}
finally{
  if(adminToken)await call('/auth/logout',{},adminToken).catch(()=>{});
  const ids=created.map(u=>u.id);if(ids.length){const objects=await db.query('SELECT object_key FROM provider_proofs WHERE user_id=ANY($1::uuid[])',[ids]);for(const key of new Set(objects.rows.map(o=>o.object_key)))await deleteFile(key);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);}
  fs.writeFileSync(`${artifacts}/report.json`,JSON.stringify({base,verifiedAt:new Date().toISOString(),results,errors,passed:!process.exitCode,syntheticUsersRemoved:created.length,scope:'Actual administrator login and real hosted database/object storage. Provider accounts use explicit seeded synthetic email-verification fixtures; external inbox delivery is not verified. Synthetic accounts/proofs removed; administrator account retained.'},null,2)+'\n');await browser.close();await db.end();console.log(`Artifacts: ${artifacts}`);
}
