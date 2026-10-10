'use strict';
const assert=require('node:assert/strict');
const {ReadableStream}=require('node:stream/web');
const {observe}=require('./mevshare-v11');
const {SWAP_TOPIC}=require('./bot');
const hash='0x'+'a'.repeat(64),pool='0x'+'b'.repeat(40);
const frames=[
 {hash,logs:[{address:pool,topics:[SWAP_TOPIC]}]},
 {hash,logs:[{address:pool,topics:[SWAP_TOPIC]}]},
 {hash:'0x'+'c'.repeat(64),txs:[{logs:[{address:pool,topics:[SWAP_TOPIC]}]}]},
];
const encoder=new TextEncoder();
const fetchImpl=async()=>({
 ok:true,headers:{get:()=> 'text/event-stream'},
 body:new ReadableStream({start(controller){
  controller.enqueue(encoder.encode(frames.map(f=>'data: '+JSON.stringify(f)+'\n\n').join('')));
  controller.close();
 }})
});
(async()=>{
 const out=await observe({fetchImpl,durationMs:1500});
 assert.equal(out.connected,true);
 assert.equal(out.received,3);
 assert.equal(out.uniqueEvents,2);
 assert.equal(out.duplicates,1);
 assert.equal(out.transactions,1);
 assert.equal(out.bundles,1);
 assert.equal(out.swapsInEventHints,1);
 assert.equal(out.swapsInBundleTxHints,1);
 assert.equal(out.verifiedVenueCandidates,0);
 assert.equal(out.executionEligible,false);
 assert.equal(out.mainnetBroadcast,false);
 await assert.rejects(observe({network:'base',fetchImpl}),/ETHEREUM_MEV_SHARE_ONLY/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V11',unitAssertionsPassed:11,
  mockedStream:true,liveFeedConnected:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
