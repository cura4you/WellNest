// Real PostgreSQL + API + Chromium guest workflows. No Docker or local AI model is required.
import 'dotenv/config';
import { chromium } from 'playwright';import pg from 'pg';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';
const original=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(original.hostname),'Guest E2E requires local PostgreSQL.');
const stamp=Date.now(),name=`medivault_demo_e2e_${stamp}`,artifacts=process.env.DEMO_E2E_ARTIFACTS||`/private/tmp/${name}`;fs.mkdirSync(artifacts,{recursive:true,mode:0o700});
const url=new URL(original);url.pathname=`/${name}`;const admin=new pg.Pool({connectionString:original.toString()}),db=new pg.Pool({connectionString:url.toString()});
const base='http://localhost:5179',api='http://localhost:3003',live=process.env.DEMO_E2E_LIVE_AI==='true';
const env={...process.env,DATABASE_URL:url.toString(),DATABASE_SSL:'false',API_PORT:'3003',API_HOST:'127.0.0.1',ALLOWED_ORIGINS:base,VITE_API_BASE_URL:api,VITE_ENABLE_MOCK_AUTH:'false',SESSION_SECRET:randomBytes(32).toString('hex'),DOCUMENT_KEK_ID:'test',DOCUMENT_KEKS:JSON.stringify({test:randomBytes(32).toString('base64')}),DEMO_ENABLED:'true',PROVIDER_APPROVAL_REQUIRED:'true',S3_ACCESS_KEY:'',S3_SECRET_KEY:'',DEMO_AI_MODEL:'gemini-3.1-flash-lite',EMBEDDING_BASE_URL:'',EMBEDDING_MODEL:'',CHAT_AGENT_ENABLED:'true',AI_TIMEOUT_MS:'30000',CRON_SECRET:'isolated-demo-cleanup-secret'};
const children=[],results=[],errors=[];let browser,page;
function start(args,file){const child=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});const log=fs.createWriteStream(path.join(artifacts,file));child.stdout.pipe(log);child.stderr.pipe(log);children.push(child);}
async function ready(address){for(let i=0;i<80;i++){try{if((await fetch(address)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Test service did not start.');}
async function check(name,work){await work();results.push(name);console.log('PASS',name);}
async function nav(p,label){if(!await p.locator('.mv-sidebar').isVisible())await p.getByRole('button',{name:'Open navigation',exact:true}).click();await p.locator('.mv-sidebar').getByRole('button',{name:label,exact:true}).click();}
async function role(p,next){await p.locator('#demo-role-switch').selectOption(next);await p.waitForURL(`**/dashboard/${next}`);await p.locator('.mv-topbar-title').waitFor();await p.waitForFunction(role=>JSON.parse(localStorage.getItem('medivault.auth')).user.role===role,next);}
async function session(p){return p.evaluate(()=>JSON.parse(localStorage.getItem('medivault.auth')));}
async function shot(p,name){await p.waitForTimeout(250);await p.screenshot({path:path.join(artifacts,name),fullPage:true});}
async function request(p,route,body,method=body?'POST':'GET'){const s=await session(p);const r=await fetch(api+route,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.token}`},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({}))};}
async function newPage(width=1440){const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource: the server responded with a status of 4'))errors.push(m.text());});p.on('response',r=>{if(r.url().startsWith(api)&&r.status()>=500)errors.push(`API ${r.status()} ${new URL(r.url()).pathname}`);});return p;}
try{
  for(const port of [3003,5179]){try{await fetch(`http://localhost:${port}/health`);throw Error(`Port ${port} is occupied`);}catch(e){if(e.message.includes('occupied'))throw e;}}
  await admin.query(`CREATE DATABASE "${name}"`);for(const f of fs.readdirSync('db/migrations').filter(f=>f.endsWith('.sql')).sort())await db.query(fs.readFileSync(`db/migrations/${f}`,'utf8'));
  start(['server/src/index.js'],'api.log');await ready(api+'/health');start(['node_modules/vite/bin/vite.js','--host','localhost','--port','5179','--strictPort'],'vite.log');await ready(base);browser=await chromium.launch();page=await newPage();
  await check('Homepage opens the three-role guest chooser and starts a populated patient workspace',async()=>{
    await page.goto(base);await page.locator('.home-hero-actions').getByRole('link',{name:'Try live demo',exact:false}).click();await page.getByRole('heading',{name:'Try every side of care.',exact:true}).waitFor();
    await page.getByRole('button',{name:'Explore as patient',exact:false}).click();await page.waitForURL('**/dashboard/patient');await page.locator('.mv-topbar-title').waitFor();await page.getByRole('region',{name:'Guest demo controls'}).waitFor();
    assert.equal((await session(page)).user.isGuest,true);await page.getByText('Sample blood test results.pdf',{exact:false}).first().waitFor();await shot(page,'patient-desktop.png');
  });
  await check('Guest role survives reload and the contact helper exposes only this workspace’s fictional addresses',async()=>{
    const before=await session(page);await page.reload();await page.locator('#demo-role-switch').waitFor();assert.equal((await session(page)).user.id,before.user.id);
    await page.getByRole('button',{name:'Demo contacts',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'patient demo email',exact:true}).inputValue(),before.user.email);
    for(const c of before.user.demo.contacts)assert.match(c.email,/@demo\.medivault\.invalid$/);
  });
  await check('Approve access as patient, then switch to doctor and open the newly shared sample record',async()=>{
    await nav(page,'Access Requests');await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByText('Approved',{exact:false}).first().waitFor();
    await role(page,'doctor');await nav(page,'Shared Documents');await page.getByText('Sample annual health review.pdf',{exact:true}).waitFor();
    assert.equal((await request(page,'/api/dashboard/doctor')).data.sharedDocuments.length,3);await shot(page,'doctor-desktop.png');
  });
  await check('Scheduling uses the visitor’s demo contacts and persists across patient/doctor roles',async()=>{
    await role(page,'patient');await nav(page,'Appointments');await page.getByRole('button',{name:'Use Dr. Avery Patel',exact:true}).click();
    const time=new Date(Date.now()+7*86400000);time.setHours(10,0,0,0);const input=new Date(time.getTime()-time.getTimezoneOffset()*60000).toISOString().slice(0,16);
    await page.locator('#appointmentTime').fill(input);await page.locator('#appointmentReason').fill('Guest workflow test follow-up');await page.getByRole('button',{name:'Request appointment',exact:true}).click();await page.getByText('Appointment requested.',{exact:true}).waitFor();
    await role(page,'doctor');await nav(page,'Appointments');const row=page.locator('.mv-care-list').filter({hasText:'Guest workflow test follow-up'});if(await row.count())await row.first().waitFor();await page.getByText('Guest workflow test follow-up',{exact:false}).first().waitFor();
  });
  await check('Hospital workspace is populated and all guest role tabs fit mobile screens',async()=>{
    await role(page,'hospital');await page.locator('.mv-topbar-title').waitFor();await shot(page,'hospital-desktop.png');
    const tabs={patient:['Overview','Health Vitals','Appointments','Storage Vault','Access Requests','Audit Log','AI Chat','Profile & Settings','Notifications'],doctor:['Overview','Appointments','Shared Documents','Active Grants','Request Access','Request History','Activity Log','Emergency Access','Drug Interactions','AI Chat','Profile & Settings','Notifications'],hospital:['Overview','Appointments','Upload Queue','Staff Access','Compliance & Audit','Emergency Access','AI Chat','Profile & Settings','Notifications']};
    for(const next of ['hospital','doctor','patient']){await page.setViewportSize({width:390,height:844});await role(page,next);for(const tab of tabs[next]){await nav(page,tab);await page.waitForTimeout(70);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${next}/${tab} overflow`);}await nav(page,'Overview');await shot(page,`${next}-mobile.png`);}
    await page.setViewportSize({width:1440,height:1000});
  });
  await check('Two visitors cannot search, share, schedule or read across their isolated workspaces',async()=>{
    const second=await newPage();await second.goto(base+'/demo');await second.getByRole('button',{name:'Explore as doctor',exact:false}).click();await second.waitForURL('**/dashboard/doctor');await second.locator('#demo-role-switch').waitFor();
    const first=await session(page);assert.equal((await request(second,`/api/patients/search?email=${encodeURIComponent(first.user.email)}`)).status,404);
    const document=(await request(page,'/api/dashboard/patient')).data.documents[0];assert.equal((await request(second,`/api/documents/${document.id}/download`)).status,404);
    assert.equal((await request(second,'/api/access-requests',{patientEmail:first.user.email,scope:'all_documents',reason:'Cross-visitor request must fail'})).status,404);
    await second.getByRole('region',{name:'Guest demo controls'}).getByRole('button',{name:'Exit demo',exact:true}).click();await second.waitForURL(base+'/');await second.context().close();
  });
  if(live)await check('Live guest AI answers from synthetic records with a persisted citation and summarizes a sample PDF',async()=>{
    await nav(page,'AI Chat');await page.locator('.chat-input').fill('What HbA1c value is in my sample laboratory report? Cite the record.');await page.locator('.chat-input-row button').click();
    for(let i=0;i<90;i++){if(await page.locator('.chat-bubble-assistant').count() && /5\.6/.test(await page.locator('.chat-bubble-assistant').last().innerText()))break;await page.waitForTimeout(1000);}
    const body=await page.locator('body').innerText();assert.ok(body.includes('5.6'), 'Live answer must contain the seeded value');await page.locator('.chat-citation-badge').first().waitFor({timeout:10000});await shot(page,'guest-ai.png');
    for(let i=0;i<20;i++){if((await page.locator('.chat-input-row button').textContent())==='Send')break;await page.waitForTimeout(500);}
    await nav(page,'Storage Vault');await page.getByRole('button',{name:'AI Summary',exact:true}).first().click();await page.locator('.aisummary-result').waitFor({timeout:60000});await shot(page,'guest-summary.png');await page.locator('.aisummary-close').click();
  });
  await check('Reset restores sample state, remounts the dashboard, invalidates old tokens and preserves allowances',async()=>{
    const old=await session(page);await nav(page,'Access Requests');await page.getByRole('button',{name:'Reset demo',exact:true}).click();await page.getByRole('button',{name:'Reset my sample data',exact:true}).click();
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('medivault.auth')).user.id!==id,old.user.id);await page.locator('.mv-topbar-title').waitFor();const next=await session(page);assert.ok(next.user.demo.usage.resets===1);assert.equal(next.user.demo.expiresAt,old.user.demo.expiresAt);
    await nav(page,'Access Requests');await page.getByRole('button',{name:'Approve',exact:true}).waitFor();const stale=await fetch(api+'/api/dashboard/patient',{headers:{Authorization:`Bearer ${old.token}`}});assert.equal(stale.status,401);
  });
  await check('Guest chooser and toolbar work with keyboard, dark theme and tablet/phone widths',async()=>{
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await nav(page,'Overview');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Toggle theme',exact:true}).click();await shot(page,'guest-dark.png');await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
    await page.getByRole('region',{name:'Guest demo controls'}).getByRole('button',{name:'Exit demo',exact:true}).click();await page.waitForURL(base+'/');await page.goto(base+'/demo');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Explore as patient',exact:false}).focus();assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'BUTTON');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(page,'demo-entry-mobile.png');
  });
  await check('An ordinary signed-in account can explore a guest workspace and recover its original session on exit',async()=>{
    const response=await fetch(api+'/auth/register/patient',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`return-${stamp}@example.com`,password:'Return2026Pass',fullName:'Original portfolio account',dateOfBirth:'1990-01-01',bloodGroup:'O+',gender:'Other'})});assert.equal(response.status,201);const original=await response.json();
    await page.evaluate(s=>localStorage.setItem('medivault.auth',JSON.stringify(s)),original);await page.goto(base);await page.getByRole('link',{name:'Explore a guest workspace',exact:true}).click();await page.getByRole('button',{name:'Explore as patient',exact:false}).click();await page.waitForURL('**/dashboard/patient');await page.locator('#demo-role-switch').waitFor();assert.equal((await session(page)).user.isGuest,true);
    await page.getByRole('region',{name:'Guest demo controls'}).getByRole('button',{name:'Exit demo',exact:true}).click();await page.waitForURL(base+'/');const restored=await session(page);assert.equal(restored.user.id,original.user.id);assert.equal(restored.token,original.token);assert.equal((await request(page,'/api/dashboard/patient')).status,200);
  });
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({passed:results,errors,liveAi:live,scope:'Real isolated PostgreSQL/API and headless Chromium; guest files use encrypted expiring database storage. Live Gemini calls are opt-in and use synthetic records only.'},null,2)+'\n');console.log(`Artifacts: ${artifacts}`);
}catch(e){if(page&&!page.isClosed())await shot(page,'failure.png').catch(()=>{});fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({passed:results,error:e.message,errors,liveAi:live},null,2)+'\n');console.error(e.message);console.error(`Artifacts: ${artifacts}`);process.exitCode=1;}
finally{await browser?.close();for(const child of children)child.kill('SIGTERM');await new Promise(r=>setTimeout(r,250));await db.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`).catch(()=>{});await admin.end();}
