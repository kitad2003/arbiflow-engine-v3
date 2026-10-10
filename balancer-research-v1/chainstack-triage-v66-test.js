'use strict';
const assert=require('node:assert/strict');
const {isThrottle,pacedEvaluate,research}=require('./chainstack-triage-v66');
assert(isThrottle(Error('429 compute units per second')));
assert(!isThrottle(Error('POOL_IDENTITY_NOT_VERIFIED')));
(async()=>{
 let tries=0;
 const fn=pacedEvaluate(async()=>{tries++;if(tries===1)throw Error('429');return {ok:true}},{delayMs:0,retries:2,waitImpl:async()=>{}});
 assert.equal((await fn(null,'a','b')).ok,true);assert.equal(tries,2);
 let noRetry=0;const bad=pacedEvaluate(async()=>{noRetry++;throw Error('POOL_IDENTITY_NOT_VERIFIED')},{delayMs:0,waitImpl:async()=>{}});
 await assert.rejects(bad(null,'a','b'),/POOL_IDENTITY/);assert.equal(noRetry,1);
 const q={token0:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',token1:'0xdAC17F958D2ee523a2206206994597C13D831ec7',reserves:{poolA:{r0:'100000000000000000000',r1:'100000000'},poolB:{r0:'100000000000000000000',r1:'100000000'}},quotes:[{inputToken:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',sizeRaw:'1000000000000000000',returnedRaw:'1100000000000000000'}]};
 const r=await research({provider:{},evaluateImpl:async()=>q,paceOptions:{delayMs:0,waitImpl:async()=>{}},runImpl:async({evaluateImpl})=>{await evaluateImpl(null,'a','b');return {results:[{status:'VERIFIED_GROSS_ONLY',poolA:'a',poolB:'b'}],limitations:[]}}});
 assert.equal(r.v64Triage.grossScreened,1);assert.equal(r.v64Triage.missingGas,1);assert.equal(r.qualified,0);assert.equal(r.executionEligible,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V66',unitAssertionsPassed:9}));
})().catch(e=>{console.error(e);process.exitCode=1});
