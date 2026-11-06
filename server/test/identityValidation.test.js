import test from 'node:test';
import assert from 'node:assert/strict';
import { proofMime,revisionValue,reviewDecision } from '../src/identityValidation.js';
test('credential proof detection follows bytes instead of claimed file extensions',()=>{
  assert.equal(proofMime(Buffer.from('%PDF-1.4\nsynthetic')),'application/pdf');
  assert.equal(proofMime(Buffer.from([137,80,78,71,13,10,26,10,1])),'image/png');
  assert.equal(proofMime(Buffer.from([255,216,255,1])),'image/jpeg');
  for(const value of [Buffer.from('<script>fake.png</script>'),Buffer.alloc(0),'not a buffer'])assert.throws(()=>proofMime(value));
});
test('review revisions reject absent, fractional, negative and unsafe values',()=>{
  assert.equal(revisionValue('3'),3);assert.equal(revisionValue(0),0);
  for(const value of [undefined,null,'',-1,1.5,'1e2','9007199254740992'])assert.throws(()=>revisionValue(value));
});
test('review decisions require an explicit action, bounded reason and current revision',()=>{
  assert.deepEqual(reviewDecision({decision:'approved',reason:'  Evidence reviewed  ',revision:2}),{decision:'approved',reason:'Evidence reviewed',revision:2});
  for(const body of [{decision:'admin',reason:'reviewed',revision:1},{decision:'approved',reason:'',revision:1},{decision:'rejected',reason:'x'.repeat(2001),revision:1}])assert.throws(()=>reviewDecision(body));
});
