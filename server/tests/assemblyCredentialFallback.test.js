const {test}=require('node:test'),assert=require('node:assert/strict');
const {runWithAssemblyCredentials}=require('../services/assemblyCredentialFallback');
const exhausted=()=>Object.assign(new Error('Your current account balance is negative. Please top up'),{response:{status:400}});
function store(){let value={};return {read:()=>value,write:v=>{value=v}};}
test('primary stays preferred; exhaustion selects fallback and remembers it across calls',async()=>{
 const options={keys:['primary-test','fallback-test'],...store()};const calls=[];
 const run=k=>{calls.push(k);if(k==='primary-test')throw exhausted();return 'ok'};
 assert.equal(await runWithAssemblyCredentials(run,options),'ok');
 assert.equal(await runWithAssemblyCredentials(run,options),'ok');
 assert.deepEqual(calls,['primary-test','fallback-test','fallback-test']);
 assert(!JSON.stringify(options.read()).includes('primary-test'));
});
test('auth, rate-limit and network failures never switch keys',async()=>{
 for(const status of [401,403,429,undefined]){const calls=[];const e=Object.assign(new Error('request failed'),{response:{status}});
 await assert.rejects(runWithAssemblyCredentials(k=>{calls.push(k);throw e},{keys:['a','b'],...store()}));assert.deepEqual(calls,['a']);}
});
test('both exhausted blocks subsequent uploads and preserves unrelated metadata',async()=>{
 const options={keys:['a','b'],...store()};options.write({other:{retained:true}});let calls=0;
 await assert.rejects(runWithAssemblyCredentials(()=>{calls++;throw exhausted()},options),e=>e.code==='PROVIDER_NEEDS_ATTENTION');
 assert.equal(calls,2);assert.equal(options.read().other.retained,true);
 await assert.rejects(runWithAssemblyCredentials(()=>{calls++},options),e=>e.code==='PROVIDER_BILLING_BLOCKED');assert.equal(calls,2);
});
test('successful primary does not use fallback',async()=>{
 const calls=[];await runWithAssemblyCredentials(k=>{calls.push(k);return 'ok'},{keys:['a','b'],...store()});assert.deepEqual(calls,['a']);
});
