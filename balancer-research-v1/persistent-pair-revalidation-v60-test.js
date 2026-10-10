'use strict';
const assert=require('node:assert/strict');
const {merge,run}=require('./persistent-pair-revalidation-v60');
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40);
(async()=>{
 const merged=merge([{a,b,source:'V58'}],[{triggerPool:b,alternativePool:a}]);
 assert.equal(merged.length,1);assert.deepEqual(merged[0].sources,['V58','LIVE_V59']);
 const result=await run({provider:{getNetwork:async()=>({chainId:1n})},seedPairs:[{a,b,source:'V58'}],
  liveImpl:async()=>({uniqueCrossVenuePairs:[{triggerPool:b,alternativePool:a}],uniqueCrossVenuePairCount:1,pendingEvents:1,bundleEvents:2}),
  evaluateImpl:async()=>({blockNumber:123,token0:a,token1:b,reserves:{poolA:{r0:'10',r1:'20'},poolB:{r0:'20',r1:'10'}},quotes:[],positiveGrossCount:0})});
 assert.equal(result.checkedPairs,1);assert.equal(result.confirmedPairs,1);assert.equal(result.bundlesSubmitted,0);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V60',status:'UNIT_TEST_PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1});
