'use strict';
const assert=require('node:assert/strict');
const {ReadableStream}=require('node:stream/web');
const {SWAP_TOPIC}=require('./bot');
const {audit,observe}=require('./hint-audit-v14');
const h='0x'+'a'.repeat(64),p='0x'+'b'.repeat(40),other='0x'+'c'.repeat(64);
const first={hash:h,logs:[{address:p,topics:[SWAP_TOPIC]},{address:p,topics:[other]}]};
const bundle={hash:'0x'+'d'.repeat(64),txs:[{}],logs:[]};
const result=audit([first,first,bundle]);
assert.equal(result.received,3);
assert.equal(result.uniqueEvents,2);
assert.equal(result.duplicates,1);
assert.equal(result.transactions,1);
assert.equal(result.bundles,1);
assert.equal(result.eventsWithLogs,1);
assert.equal(result.eventsWithTopics,1);
assert.equal(result.swapHintEvents,1);
assert.equal(result.swapHints,1);
assert.equal(result.uniqueSwapPoolAddresses[0],p);
assert.equal(result.topTopic0.length,2);
assert.equal(result.executionEligible,false);
(async()=>{
 const encoder=new TextEncoder();
 const fetchImpl=async()=>({ok:true,headers:{get:()=> 'text/event-stream'},
  body:new ReadableStream({start(c){c.enqueue(encoder.encode('data: '+JSON.stringify(first)+'\n\n'));c.close()}})});
 const live=await observe({fetchImpl,durationMs:1500});
 assert.equal(live.received,1);
 assert.equal(live.connected,true);
 await assert.rejects(observe({network:'base',fetchImpl}),/ETHEREUM_MEV_SHARE_ONLY/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V14',unitAssertionsPassed:15,
  mockedSSE:true,liveConnectionVerified:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
