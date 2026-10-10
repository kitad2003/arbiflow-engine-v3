'use strict';
const assert=require('node:assert/strict');
const {run}=require('./bundle-pool-verification-v54');
(async()=>{
 const a='0x'+'0'.repeat(39)+'1',b='0x'+'0'.repeat(39)+'2';
 let calls=0;
 const result=await run({
  provider:{getNetwork:async()=>({chainId:1n})},
  cache:{resolve:async(_,pool)=>{calls++;return {verified:pool===a,cacheHit:false,reason:'PAIR_NOT_VERIFIED',trigger:{token0:a,token1:b,venue:'TEST'},alternative:{pool:b,venue:'TEST'}}}},
  monitorImpl:async({onEvent})=>{
   await onEvent({kind:'PENDING_TRANSACTION',swapPools:[a]});
   await onEvent({kind:'BUNDLE',swapPools:[a,b]});
   await onEvent({kind:'BUNDLE',swapPools:[a]});
   return {uniqueEvents:3};
  }
 });
 assert.equal(result.pendingEvents,1);
 assert.equal(result.bundleEvents,2);
 assert.equal(result.pendingWithSwapHints,1);
 assert.equal(result.bundlesWithSwapHints,2);
 assert.equal(result.uniqueBundlePools,2);
 assert.equal(result.verificationAttempts,2);
 assert.equal(result.verifiedCrossVenuePairs,1);
 assert.equal(result.rejectedPools,1);
 assert.equal(calls,2);
 assert.equal(result.bundlesSubmitted,0);
 assert.equal(result.mainnetBroadcast,false);
 assert.equal(result.bundleHashesTreatedAsTransactions,0);
 console.log(JSON.stringify({build:result.build,status:'UNIT_TEST_PASS',assertions:12,readOnly:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
