// Fast real PostgreSQL + HTTP integration tests. Never touches a hosted database or AI provider.
import 'dotenv/config';
import pg from 'pg';import fs from 'node:fs';import assert from 'node:assert/strict';
const original=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(original.hostname),'Use a local database for guest integration tests.');
const name=`medivault_demo_api_${Date.now()}`,admin=new pg.Pool({connectionString:original.toString()});await admin.query(`CREATE DATABASE "${name}"`);original.pathname=`/${name}`;process.env.DATABASE_URL=original.toString();process.env.DEMO_ENABLED='true';process.env.PROVIDER_APPROVAL_REQUIRED='true';process.env.CRON_SECRET='isolated-demo-test-secret';
const {pool}=await import('../src/db.js');let server;const results=[];
async function check(label,work){await work();results.push(label);console.log('PASS',label);}
try{
  for(const f of fs.readdirSync('db/migrations').filter(f=>f.endsWith('.sql')).sort())await pool.query(fs.readFileSync(`db/migrations/${f}`,'utf8'));
  const {default:app}=await import('../src/app.js');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,body,token,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({}))};}
  let a,b,doctor,hospital,regular;
  await check('Start creates three populated roles without verified identity or administrator privilege',async()=>{
    const r=await call('/demo/start',{role:'patient'});assert.equal(r.status,201,JSON.stringify(r.data));a=r.data;assert.equal(a.user.isGuest,true);assert.equal(a.user.isAdmin,false);assert.equal(a.user.emailVerified,false);assert.equal(a.user.demo.contacts.length,3);
    doctor=(await call('/demo/switch',{role:'doctor'},a.token)).data;hospital=(await call('/demo/switch',{role:'hospital'},a.token)).data;
    const headers=await fetch(base+'/api/dashboard/patient',{headers:{Authorization:`Bearer ${a.token}`}});assert.equal(headers.headers.get('cache-control'),'no-store');
    for(const s of [a,doctor,hospital])assert.equal((await call(`/api/dashboard/${s.user.role}`,null,s.token)).status,200);
    const data=(await call('/api/dashboard/patient',null,a.token)).data;assert.equal(data.documents.length,3);assert.equal(data.accessRequests.length,1);
    b=(await call('/demo/start',{role:'patient'})).data;assert.notEqual(a.user.email,b.user.email);
  });
  await check('Visitors cannot target another workspace or ordinary accounts by email or UUID',async()=>{
    const r=await call('/auth/register/patient',{email:'ordinary@example.com',password:'Ordinary2026',fullName:'Ordinary fixture',dateOfBirth:'1990-01-01',bloodGroup:'O+',gender:'Other'});assert.equal(r.status,201);regular=r.data;
    for(const target of [b.user.email,regular.user.email])assert.equal((await call(`/api/patients/search?email=${encodeURIComponent(target)}`,null,doctor.token)).status,404);
    const doc=(await call('/api/dashboard/patient',null,a.token)).data.documents[0];assert.equal((await call(`/api/documents/${doc.id}/download`,null,b.token)).status,404);assert.equal((await call(`/api/documents/${doc.id}/download`,null,regular.token)).status,404);
    assert.equal((await call('/api/appointments',{participantEmail:b.user.email,startsAt:new Date(Date.now()+86400000).toISOString(),durationMinutes:30,reason:'Must be denied',location:'Demo'},doctor.token)).status,404);
    assert.equal((await call(`/api/patients/search?email=${encodeURIComponent(a.user.email)}`,null,doctor.token)).status,200);
  });
  await check('Guest identity, privileged actions, arbitrary roles and unsupported routes stay closed',async()=>{
    for(const [path,body]of [['/auth/admin/applications',null],['/auth/change-password',{currentPassword:'x',password:'New2026Pass'}],['/auth/verification/send',{}],['/api/documents/11111111-1111-4111-8111-111111111111/reindex',{}]])assert.equal((await call(path,body,a.token)).status,403);
    assert.equal((await call('/demo/switch',{role:'admin'},a.token)).status,400);assert.equal((await call('/demo/reset',{},regular.token)).status,403);
    const state=await call('/auth/account-status',null,a.token);assert.equal(state.data.demo,true);assert.equal(state.data.emailVerified,false);assert.equal(state.data.isAdmin,false);
    assert.equal((await call('/auth/login',{role:'patient',email:a.user.email,password:'guest-session-only'})).status,401);
  });
  await check('Sharing works across the visitor’s own patient and doctor roles',async()=>{
    const request=(await call('/api/dashboard/patient',null,a.token)).data.accessRequests[0];assert.equal((await call(`/api/access-requests/${request.id}`,{action:'approve'},a.token,'PATCH')).status,200);
    const docs=(await call('/api/dashboard/doctor',null,doctor.token)).data.sharedDocuments;assert.equal(docs.length,3);assert.equal((await call('/api/dashboard/patient',null,b.token)).data.accessRequests[0].status,'pending');
    const r=await fetch(base+`/api/documents/${docs[0].id}/download`,{headers:{Authorization:`Bearer ${doctor.token}`}});assert.equal(r.status,200);assert.ok((await r.text()).includes('FICTIONAL PORTFOLIO RECORD'));
  });
  await check('Multipart upload targets are scoped after parsing and files stay in encrypted expiring storage',async()=>{
    const form=new FormData();form.set('file',new Blob(['Synthetic upload'],{type:'text/plain'}),'sample.txt');form.set('documentType','lab_report');form.set('patientId',b.user.email);
    let r=await fetch(base+'/api/documents/upload',{method:'POST',headers:{Authorization:`Bearer ${doctor.token}`},body:form});assert.equal(r.status,404);
    form.set('patientId',a.user.email);r=await fetch(base+'/api/documents/upload',{method:'POST',headers:{Authorization:`Bearer ${doctor.token}`},body:form});assert.equal(r.status,201);
    const id=(await r.json()).documentId;const row=(await pool.query('SELECT appwrite_file_id,dek_wrapped FROM documents WHERE id=$1',[id])).rows[0];assert.match(row.appwrite_file_id,/^demo\//);assert.match(row.dek_wrapped,/^v1:/);
    const cipher=(await pool.query('SELECT ciphertext FROM demo_files WHERE object_key=$1',[row.appwrite_file_id])).rows[0].ciphertext;assert.equal(cipher.includes(Buffer.from('Synthetic upload')),false);
  });
  await check('Reset restores samples, revokes old role tokens and preserves AI/upload budgets',async()=>{
    const workspace=(await pool.query('SELECT demo_workspace_id FROM users WHERE id=$1',[a.user.id])).rows[0].demo_workspace_id;
    await pool.query('UPDATE demo_workspaces SET ai_requests_used=4 WHERE id=$1',[workspace]);
    const r=await call('/demo/reset',{},a.token);assert.equal(r.status,200,JSON.stringify(r.data));const old=a;a=r.data;
    assert.notEqual(a.user.email,old.user.email);assert.equal((await call('/api/dashboard/doctor',null,doctor.token)).status,401);assert.equal((await call('/api/dashboard/hospital',null,hospital.token)).status,401);
    assert.equal((await call('/api/dashboard/patient',null,a.token)).data.documents.length,3);assert.equal(a.user.demo.usage.aiRequests,4);assert.equal(a.user.demo.usage.uploads,1);assert.equal((await call('/api/chat',{message:'What is the sample HbA1c?'},a.token)).status,429);
    assert.equal((await call('/api/dashboard/patient',null,b.token)).status,200);
    const next=await call('/demo/reset',{},a.token);assert.equal(next.status,200);a=next.data;assert.equal((await call('/demo/reset',{},a.token)).status,429);
  });
  await check('Workspace request, daily capacity and provider-call caps fail closed without spending on AI',async()=>{
    const workspace=(await pool.query('SELECT demo_workspace_id FROM users WHERE id=$1',[a.user.id])).rows[0].demo_workspace_id;
    await pool.query('UPDATE demo_workspaces SET api_calls_used=499 WHERE id=$1',[workspace]);assert.equal((await call('/api/dashboard/patient',null,a.token)).status,200);assert.equal((await call('/demo/switch',{role:'doctor'},a.token)).status,429);
    await pool.query('UPDATE demo_daily_usage SET workspaces_created=100,provider_calls=79 WHERE day=current_date');assert.equal((await call('/demo/start',{role:'patient'})).status,429);
    const {consumeDemoProviderCall}=await import('../src/demoAccess.js');await consumeDemoProviderCall();await assert.rejects(consumeDemoProviderCall(),e=>e.status===429);
  });
  await check('Expiry immediately blocks sessions; authenticated cleanup and exit remove only guest data',async()=>{
    await pool.query('UPDATE demo_workspaces SET expires_at=now()-interval \'1 second\' WHERE id=(SELECT demo_workspace_id FROM users WHERE id=$1)',[b.user.id]);
    assert.equal((await call('/api/dashboard/patient',null,b.token)).status,401);assert.equal((await call('/api/internal/demo-cleanup',null,'wrong')).status,401);
    const cleaned=await call('/api/internal/demo-cleanup',null,process.env.CRON_SECRET);assert.equal(cleaned.status,200);assert.equal(cleaned.data.removed,1);
    assert.equal((await call('/demo/end',{},a.token)).status,200);assert.equal((await call('/api/dashboard/patient',null,a.token)).status,401);
    assert.equal((await pool.query('SELECT count(*)::int AS c FROM demo_files')).rows[0].c,0);assert.equal((await pool.query('SELECT count(*)::int AS c FROM users WHERE demo_workspace_id IS NOT NULL')).rows[0].c,0);assert.equal((await call('/api/dashboard/patient',null,regular.token)).status,200);
  });
  console.log(JSON.stringify({passed:results,scope:'Isolated real PostgreSQL and HTTP. No hosted database, external AI call or permanent object storage used.'}));
}finally{if(server)await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP DATABASE "${name}" WITH(FORCE)`);await admin.end();}
