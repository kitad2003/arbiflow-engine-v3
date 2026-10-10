'use strict';
const assert=require('node:assert/strict');
const {investigate}=require('./live-target-matching-v58');
const hash='0x'+'a'.repeat(64),pool='0x'+'b'.repeat(40);
const provider={getBlock:async()=>({number:123,hash})};
(async()=>{
 const privateTx=await investigate(provider,{kind:'PENDING_TRANSACTION',eventHash:hash,pendingHash:hash,swapPools:[]},{lookup:async()=>null});
 assert.equal(privateTx.publicTxStatus,'NOT_FOUND_ON_PUBLIC_RPC_PRIVATE_POSSIBLE');
 assert.equal(privateTx.publicTxMatch,false);
 const publicTx=await investigate(provider,{kind:'PENDING_TRANSACTION',eventHash:hash,pendingHash:hash,swapPools:[]},{lookup:async()=>({hash,blockNumber:null,to:null})});
 assert.equal(publicTx.publicTxMatch,true);
 const bundle=await investigate(provider,{kind:'BUNDLE',eventHash:hash,swapPools:[pool]},{verify:async()=>({verified:false,reason:'UNRECOGNIZED_FACTORY'})});
 assert.equal(bundle.publicTxStatus,'BUNDLE_HASH_NOT_PUBLIC_TX_LOOKUP');
 assert.equal(bundle.pools[0].reason,'UNRECOGNIZED_FACTORY');
 assert.equal(bundle.targetFirstSimulationAttempted,false);
 assert.equal(bundle.executionEligible,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V58',status:'UNIT_TEST_PASS',assertions:7}));
})().catch(e=>{console.error(e);process.exitCode=1});
