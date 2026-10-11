'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {inspect,run}=require('./multirouter-diagnostics-v7');
class FakeSocket extends EventEmitter{
 constructor(url){super();this.sent=[];this.closed=false;queueMicrotask(()=>this.emit('open'))}
 send(json){
  const m=JSON.parse(json);this.sent.push(m);
  if(m.method==='eth_chainId')queueMicrotask(()=>this.emit('message',JSON.stringify({id:m.id,result:'0x1'})));
  if(m.method==='eth_subscribe')queueMicrotask(()=>{
   this.emit('message',JSON.stringify({id:m.id,result:'sub-1'}));
   for(let i=0;i<12;i++)this.emit('message',JSON.stringify({method:'eth_subscription',params:{subscription:'sub-1',result:'0x'+i.toString(16).padStart(64,'0')}}));
  });
  if(m.method==='eth_getTransactionByHash')queueMicrotask(()=>this.emit('message',JSON.stringify({id:m.id,result:null})));
 }
 close(){this.closed=true}
}
async function main(){
 const r=await run({});
 assert.equal(r.chainCount,15);
 assert.equal(r.results.length,15);
 assert.equal(r.results.filter(x=>x.status==='FEED_NOT_IMPLEMENTED').length,13);
 assert.equal(r.results.filter(x=>x.status==='NOT_CONFIGURED').length,2);
 assert.equal(r.readOnly,true);assert.equal(r.bundlesSubmitted,0);
 const x=await inspect({chain:'ethereum',url:'wss://fixture.invalid',WebSocketImpl:FakeSocket,durationMs:5000,maxLookups:3});
 assert.equal(x.uniqueEvents,12);
 assert.equal(x.lookupsSkippedAtCap,9);
 assert.equal(x.lookupCap,3);
 assert.equal(x.lookupsSent,3);
 assert.equal(x.lookupsNull,3);
 assert.equal(x.queueHighWatermark,3);
 assert.equal(x.queuedAtFinish,0);
 assert.equal(x.executionEligible,false);
 assert.equal(x.universalSwapIntents,0);
 assert.equal(x.universalCompleteIntents,0);
 assert.equal(x.universalPartialIntents,0);
 console.log(JSON.stringify({test:'V7_OFFLINE_DIAGNOSTICS',status:'PASS',chainCount:r.chainCount,unimplemented:13,skipped:x.lookupsSkippedAtCap,lookups:x.lookupsSent}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
