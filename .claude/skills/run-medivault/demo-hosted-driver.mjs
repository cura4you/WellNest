// Public-user hosted guest checks. All created workspaces are closed in finally.
import {chromium} from 'playwright';import fs from 'node:fs';import assert from 'node:assert/strict';
const base=process.env.DEMO_HOSTED_BASE;assert.ok(base?.startsWith('https://'),'Set DEMO_HOSTED_BASE explicitly.');const live=process.env.DEMO_HOSTED_LIVE_AI==='true';
const artifacts=process.env.DEMO_HOSTED_ARTIFACTS||`/private/tmp/medivault-demo-hosted-${Date.now()}`;fs.mkdirSync(artifacts,{recursive:true,mode:0o700});
const browser=await chromium.launch(),contexts=[],pages=[],results=[],errors=[];let page;
const jar=process.env.DEMO_HOSTED_COOKIE_JAR?fs.readFileSync(process.env.DEMO_HOSTED_COOKIE_JAR,'utf8').split('\n').filter(x=>x.includes('\t')).map(x=>{const v=x.split('\t');return{name:v[5],value:v[6],domain:v[0].replace('#HttpOnly_',''),path:v[2],httpOnly:true,secure:true,sameSite:'None'};}):[];
async function open(){const c=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(c);if(jar.length)await c.addCookies(jar);const p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));return p;}
async function session(p){return p.evaluate(()=>JSON.parse(localStorage.getItem('medivault.auth')||'null'));}
async function call(p,path,body,method=body?'POST':'GET'){const s=await session(p);const r=await p.context().request.fetch(base+path,{method,headers:s?{Authorization:`Bearer ${s.token}`}:{},...(body?{data:body}:{})});return{status:r.status(),headers:r.headers(),data:await r.json().catch(()=>({}))};}
async function nav(p,label){if(!await p.locator('.mv-sidebar').isVisible())await p.getByRole('button',{name:'Open navigation',exact:true}).click();await p.locator('.mv-sidebar').getByRole('button',{name:label,exact:true}).click();}
async function role(p,next){await p.locator('#demo-role-switch').selectOption(next);await p.waitForURL(`**/dashboard/${next}`);await p.locator('.mv-topbar-title').waitFor();}
async function check(name,work){await work();results.push(name);console.log('PASS',name);}
try{
  page=await open();
  await check('Guest connection failures show a recoverable visitor-facing message without provisioning',async()=>{
    await page.route('**/demo/start',r=>r.fulfill({status:502,contentType:'text/html',body:'Temporary gateway error'}));await page.goto(base+'/demo');await page.getByRole('button',{name:'Explore as patient',exact:false}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('alert').innerText(),'The guest demo is temporarily unavailable. Please retry in a moment.');assert.equal(await page.getByRole('button',{name:'Explore as patient',exact:false}).isEnabled(),true);await page.unroute('**/demo/start');
  });
  await check('Public entry starts an isolated populated patient workspace without registration',async()=>{
    await page.goto(base+'/demo');await page.getByRole('button',{name:'Explore as patient',exact:false}).click();await page.waitForURL('**/dashboard/patient',{timeout:45000});await page.locator('#demo-role-switch').waitFor();const s=await session(page);assert.equal(s.user.isGuest,true);assert.equal(s.user.isAdmin,false);assert.equal(s.user.emailVerified,false);
    const dashboard=await call(page,'/api/dashboard/patient');assert.equal(dashboard.status,200);assert.equal(dashboard.data.documents.length,3);assert.match(dashboard.headers['cache-control'],/no-store/);assert.equal(dashboard.data.documents[0].uploadedBy,'Willow Care Hospital');await page.screenshot({path:`${artifacts}/patient.png`,fullPage:true});
  });
  await check('Patient approval becomes visible after switching to doctor, with hospital data available too',async()=>{
    await nav(page,'Access Requests');await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByText('Approved',{exact:false}).first().waitFor();await role(page,'doctor');await nav(page,'Shared Documents');await page.getByText('Sample annual health review.pdf',{exact:true}).waitFor();assert.equal((await call(page,'/api/dashboard/doctor')).data.sharedDocuments.length,3);
    await role(page,'hospital');assert.equal((await call(page,'/api/dashboard/hospital')).data.uploadQueue.length,3);await page.screenshot({path:`${artifacts}/hospital.png`,fullPage:true});await role(page,'patient');
  });
  await check('A second visitor cannot search or download another workspace’s records or use admin actions',async()=>{
    const second=await open();await second.goto(base+'/demo');await second.getByRole('button',{name:'Explore as doctor',exact:false}).click();await second.waitForURL('**/dashboard/doctor',{timeout:45000});await second.locator('#demo-role-switch').waitFor();
    const first=await session(page);assert.equal((await call(second,`/api/patients/search?email=${encodeURIComponent(first.user.email)}`)).status,404);
    const doc=(await call(page,'/api/dashboard/patient')).data.documents[0];assert.equal((await call(second,`/api/documents/${doc.id}/download`)).status,404);assert.equal((await call(second,'/auth/admin/applications')).status,403);
    await second.getByRole('region',{name:'Guest demo controls'}).getByRole('button',{name:'Exit demo',exact:true}).click();await second.waitForURL(base+'/');
  });
  if(live)await check('Hosted AI retrieves the synthetic lab value with a citation and summarizes its PDF',async()=>{
    await nav(page,'AI Chat');await page.locator('.chat-input').fill('What HbA1c value is in my sample laboratory report? Cite the record.');await page.locator('.chat-input-row button').click();
    await page.waitForFunction(()=>/5\.6/.test(document.querySelector('.chat-bubble-assistant')?.textContent||''),{},{timeout:90000});await page.locator('.chat-citation-badge').first().waitFor();await page.screenshot({path:`${artifacts}/ai.png`,fullPage:true});
    for(let i=0;i<40;i++){if((await page.locator('.chat-input-row button').textContent())==='Send')break;await page.waitForTimeout(500);}
    await nav(page,'Storage Vault');await page.getByRole('button',{name:'AI Summary',exact:true}).first().click();await page.locator('.aisummary-result').waitFor({timeout:90000});await page.locator('.aisummary-close').click();
  });
  await check('Reset renews sample accounts while retaining expiry and limits; mobile controls and exit work',async()=>{
    const before=await session(page);await page.getByRole('button',{name:'Reset demo',exact:true}).click();await page.getByRole('button',{name:'Reset my sample data',exact:true}).click();await page.waitForFunction(id=>JSON.parse(localStorage.getItem('medivault.auth')).user.id!==id,before.user.id);await page.locator('#demo-role-switch').waitFor();
    const after=await session(page);assert.equal(after.user.demo.expiresAt,before.user.demo.expiresAt);assert.equal(after.user.demo.usage.resets,1);assert.ok(after.user.demo.usage.aiRequests>=before.user.demo.usage.aiRequests);
    await nav(page,'Access Requests');await page.getByRole('button',{name:'Approve',exact:true}).waitFor();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${artifacts}/mobile.png`,fullPage:true});
    await page.getByRole('region',{name:'Guest demo controls'}).getByRole('button',{name:'Exit demo',exact:true}).click();await page.waitForURL(base+'/');assert.equal(await session(page),null);
  });
  if(process.env.DEMO_CLEANUP_SECRET)await check('Protected cleanup endpoint rejects anonymous requests and accepts its configured secret',async()=>{
    const req=contexts[0].request;const denied=await req.get(base+'/api/internal/demo-cleanup');assert.equal(denied.status(),401);const allowed=await req.get(base+'/api/internal/demo-cleanup',{headers:{Authorization:`Bearer ${process.env.DEMO_CLEANUP_SECRET}`}});assert.equal(allowed.status(),200);assert.ok(typeof(await allowed.json()).removed==='number');
  });
  assert.deepEqual(errors,[]);
}catch(e){process.exitCode=1;console.error('Hosted guest test failed:',e.message);if(page&&!page.isClosed())await page.screenshot({path:`${artifacts}/failure.png`,fullPage:true}).catch(()=>{});}
finally{
  let closed=0;for(const p of pages){if(p.isClosed())continue;const s=await session(p).catch(()=>null);if(s?.user?.isGuest){const r=await p.context().request.post(base+'/demo/end',{headers:{Authorization:`Bearer ${s.token}`},data:{}}).catch(()=>null);if(r?.ok())closed++;}}
  fs.writeFileSync(`${artifacts}/report.json`,JSON.stringify({base,verifiedAt:new Date().toISOString(),results,errors,passed:!process.exitCode,liveAi:live,additionalWorkspacesClosed:closed,scope:'Actual public guest UI/API, isolated visitor workspaces and hosted AI over synthetic records. All owned guest sessions are closed; no ordinary account is modified. Protected cleanup is exercised only if explicitly configured.'},null,2)+'\n');await browser.close();console.log(`Artifacts: ${artifacts}`);
}
