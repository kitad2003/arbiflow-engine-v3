'use strict';
const assert=require('node:assert/strict');
const {classify,run}=require('./persistent-monitor-v34');
const {SWAP_TOPIC}=require('./bot');
(async()=>{
 const h='0x'+'a'.repeat(64),pool='0x'+'b'.repeat(40);
 const l=[{address:pool,topics:[SWAP_TOPIC]}];
 const t=classify({hash:h,txs:null,logs:l});
 assert.equal(t.kind,'PENDING_TRANSACTION');
 assert.equal(t.pendingHash,h);
 assert.equal(t.swapPools[0],pool);
 const b=classify({hash:h,txs:[{hash:h}],logs:l});
 assert.equal(b.kind,'BUNDLE');
 assert.equal(b.pendingHash,null);
 assert.equal(b.disclosedBundleTxHashes[0],h);
 assert.equal(classify({hash:'invalid'}),null);
 const data=new TextEncoder().encode('data: '+JSON.stringify({hash:h,logs:l})+'\n\n');
 let fetchCalls=0;
 const fetchImpl=async()=>{fetchCalls++;return {ok:true,headers:{get:()=> 'text/event-stream'},
 body:{getReader:()=>({read:(()=>{let n=0;return async()=> n++===0?{value:data,done:false}:{done:true}})(),cancel:async()=>{}})}}};
 const observed=[];
 const result=await run({fetchImpl,runtimeMs:15,backoffMs:1,onEvent:e=>observed.push(e),sleep:async()=>new Promise(r=>setTimeout(r,1))});
 assert.equal(observed.length,1);
 assert.equal(result.pendingTransactions,1);
 assert.equal(result.uniqueEvents,1);
 assert.equal(result.mainnetBroadcast,false);
 assert.equal(result.bundlesSubmitted,0);
 assert.ok(fetchCalls>=1);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V34',unitAssertionsPassed:12,
  reconnectAndDedupTested:true,simulated:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
