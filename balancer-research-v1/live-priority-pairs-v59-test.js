'use strict';
const assert=require('node:assert/strict');
const {collector,pairKey,run}=require('./live-priority-pairs-v59');
const h='0x'+'a'.repeat(64),a='0x'+'b'.repeat(40),b='0x'+'c'.repeat(40),c='0x'+'d'.repeat(40),d='0x'+'e'.repeat(40);
(async()=>{
 const q=collector({pendingLimit:2,bundleLimit:1});
 for(let i=0;i<4;i++)q.observe({kind:'BUNDLE',eventHash:h,swapPools:[a]});
 for(let i=0;i<3;i++)q.observe({kind:'PENDING_TRANSACTION',eventHash:h,pendingHash:h,swapPools:[a]});
 assert.equal(q.pending.length,2);assert.equal(q.bundles.length,1);assert.equal(q.counts.pendingSamplesDropped,1);
 const p={verified:true,crossVenueVerified:true,token0:a,token1:b,pool:c,alternativePool:d};
 assert.equal(pairKey(p),pairKey({...p,token0:b,token1:a,pool:d,alternativePool:c}));
 const output=await run({provider:{getNetwork:async()=>({chainId:1n})},
  monitorImpl:async({onEvent})=>{await onEvent({kind:'BUNDLE',eventHash:h,swapPools:[a]});await onEvent({kind:'PENDING_TRANSACTION',eventHash:h,pendingHash:h,swapPools:[a]});return {uniqueEvents:2}},
  investigateImpl:async(_,e)=>({kind:e.kind,publicTxStatus:'NOT_FOUND_ON_PUBLIC_RPC_PRIVATE_POSSIBLE',pools:[p]}),pendingLimit:2,bundleLimit:2});
 assert.equal(output.selectedPending,1);assert.equal(output.selectedBundles,1);
 assert.equal(output.uniqueCrossVenuePairCount,1);assert.equal(output.publicTxNotFound,1);
 assert.equal(output.bundlesSubmitted,0);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V59',status:'UNIT_TEST_PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1});
