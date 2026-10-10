'use strict';
const assert=require('node:assert/strict');
const {inspect,run}=require('./pending-target-bridge-v38');
(async()=>{
 const pending={kind:'PENDING_TRANSACTION',pendingHash:'0x'+'a'.repeat(64),swapPools:['0x'+'b'.repeat(40)]};
 assert.equal(inspect(pending).reason,'SIGNED_COMPATIBLE_BACKRUN_REQUIRED');
 assert.equal(inspect(pending).targetBytesRequired,false);
 assert.equal(inspect({...pending,kind:'BUNDLE'}).reason,'INDIVIDUAL_PENDING_TRANSACTION_HASH_REQUIRED');
 assert.equal(inspect({...pending,swapPools:[]}).reason,'NO_DISCLOSED_SWAP_POOL');
 const output=await run({monitorImpl:async ({onEvent})=>{
  await onEvent(pending);
  await onEvent(pending);
  await onEvent({...pending,kind:'BUNDLE'});
  return {uniqueEvents:3};
 }});
 assert.equal(output.pendingWithSwapHint,1);
 assert.equal(output.blockedMissingSignedBackrun,1);
 assert.equal(output.bundleSwapHintsExcluded,1);
 assert.equal(output.mainnetBroadcast,false);
 assert.equal(output.simulationAttempted,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V38',unitAssertionsPassed:9,readOnly:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
