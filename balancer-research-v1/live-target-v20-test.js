'use strict';
const assert=require('node:assert/strict');
const {ReadableStream}=require('node:stream/web');
const {SWAP_TOPIC}=require('./bot');
const {select,run}=require('./live-target-v20');
const pool='0x'+'a'.repeat(40),hash='0x'+'b'.repeat(64),bundleHash='0x'+'c'.repeat(64);
const logs=[{address:pool,topics:[SWAP_TOPIC]}];
const events=[{hash,logs},{hash,logs},{hash:bundleHash,txs:[{hash}],logs}];
const r=select(events,{verifiedPools:[pool]});
assert.equal(r.candidates.length,1);
assert.equal(r.candidates[0].targetHash,hash);
assert.equal(r.duplicates,1);
assert.equal(r.bundlesExcluded,1);
assert.equal(r.eventsWithSwapHints,1);
assert.equal(select(events).candidates.length,0);
(async()=>{
 const encode=new TextEncoder(),fetchImpl=async()=>({ok:true,
  headers:{get:()=> 'text/event-stream'},
  body:new ReadableStream({start(c){c.enqueue(encode.encode(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')));c.close()}})});
 const out=await run({fetchImpl,verifiedPools:[pool],durationMs:1500});
 assert.equal(out.connected,true);
 assert.equal(out.selectedTargetHash,hash);
 assert.equal(out.simulationGateReady,false);
 assert.equal(out.gateReason,'DEPLOYED_BALANCER_BACKRUN_CONTRACT_REQUIRED');
 assert.equal(out.simulationAttempted,false);
 assert.equal(out.mainnetBroadcast,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V20',unitAssertionsPassed:12,
  mockedEventStream:true,realSimulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
