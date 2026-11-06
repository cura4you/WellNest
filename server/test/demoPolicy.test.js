import test from 'node:test';import assert from 'node:assert/strict';
import { demoRole, identifiers, guestPathAllowed, DEMO_LIMITS } from '../src/demoPolicy.js';
import { runDemoContext,getDemoContext } from '../src/demoContext.js';
test('guest roles exclude administrator and all arbitrary role values',()=>{assert.equal(demoRole('doctor'),'doctor');for(const value of ['admin','',null,'Doctor'])assert.throws(()=>demoRole(value));});
test('guest route policy explicitly excludes identity, privilege and reindex operations',()=>{
  assert.equal(guestPathAllowed('POST','/api/appointments'),true);assert.equal(guestPathAllowed('GET','/api/documents/abc/download'),true);
  for(const [method,path]of [['GET','/auth/admin/applications'],['POST','/auth/change-password'],['POST','/auth/verification/send'],['POST','/api/documents/abc/reindex'],['POST','/api/new-endpoint']])assert.equal(guestPathAllowed(method,path),false);
});
test('identifier collection handles nested arrays and canonicalizes exact emails/UUIDs',()=>{const id='11111111-1111-4111-8111-111111111111';assert.deepEqual(identifiers({selectedDocs:[id,id],patientEmail:' SAMPLE@EXAMPLE.COM ',reason:'Synthetic record review'}),{ids:[id],emails:['sample@example.com']});assert.throws(()=>identifiers(Array.from({length:101},(_,i)=>`person${i}@example.com`)));});
test('guest async contexts stay isolated during concurrent requests',async()=>{
  const values=await Promise.all(['one','two'].map(workspaceId=>runDemoContext({workspaceId},async()=>{await new Promise(r=>setTimeout(r,5));return getDemoContext().workspaceId;})));
  assert.deepEqual(values,['one','two']);assert.equal(getDemoContext(),null);assert.ok(DEMO_LIMITS.uploadBytes<=1024*1024);
});
