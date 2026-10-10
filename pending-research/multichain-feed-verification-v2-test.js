'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('events');
const {run,probe}=require('./multichain-feed-verification-v2');
class FakeSocket extends EventEmitter{
 constructor(){super();queueMicrotask(()=>this.emit('open'))}
 send(raw){const m=JSON.parse(raw);assert.equal(m.method,'eth_subscribe');queueMicrotask(()=>{this.emit('message',JSON.stringify({id:88001,result:'0xfeed'}));this.emit('message',JSON.stringify({method:'eth_subscription',params:{subscription:'0xfeed',result:'0x'+'a'.repeat(64)}}))})}
 close(){this.emit('close')}
}
(async()=>{
 const r=await run({env:{ETHEREUM_WSS_URL:'wss://fake'},probeImpl:async()=>({acknowledged:true,events:2})});
 assert.equal(r.chainCount,15);assert.equal(r.summary.configured,1);assert.equal(r.results[1].status,'NOT_CONFIGURED');
 const p=await probe({mode:'base',url:'wss://fake',WebSocketImpl:FakeSocket,durationMs:5000});
 assert.equal(p.acknowledged,true);assert.equal(p.events,1);assert.equal(p.eventMeaning,'SEQUENCER_PRECONFIRMED_TRANSACTION');assert.equal(p.mainnetBroadcast,false);
 console.log('MULTICHAIN_FEED_VERIFICATION_V2_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
