'use strict';
const assert=require('node:assert/strict');
const {createDiagnostics}=require('./event-disclosure-v53');
(async()=>{
 const d=createDiagnostics({resolvePool:async pool=>({verified:pool.endsWith('1'),cacheHit:false,reason:'PAIR_NOT_VERIFIED'})});
 const a='0x'+'0'.repeat(39)+'1',b='0x'+'0'.repeat(39)+'2';
 await d.observe({kind:'BUNDLE',swapPools:[a,b]});
 await d.observe({kind:'PENDING_TRANSACTION',swapPools:[]});
 await d.observe({kind:'PENDING_TRANSACTION',swapPools:[a,b]});
 const s=d.snapshot();
 assert.equal(s.bundleEvents,1);assert.equal(s.pendingEvents,2);
 assert.equal(s.bundlesWithSwapHints,1);assert.equal(s.pendingWithSwapHints,1);
 assert.equal(s.uniqueDisclosedPools,2);assert.equal(s.verificationAttempts,2);
 assert.equal(s.verifiedPairs,1);assert.equal(s.rejectedPools,1);
 assert.equal(s.bundlesSubmitted,0);assert.equal(s.mainnetBroadcast,false);
 console.log(JSON.stringify({build:s.build,status:'UNIT_TEST_PASS',assertions:10,readOnly:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
