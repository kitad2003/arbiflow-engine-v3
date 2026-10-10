'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('events');
const {run,classify}=require('./pending-classification-v2');
assert.equal(classify({to:'0x7a250d5630b4cf539739df2c5dacab4c659f2488',input:'0x38ed1739'}).classification,'KNOWN_ROUTER_KNOWN_SELECTOR');
assert.equal(classify({to:'0x0000000000000000000000000000000000000001',input:'0x38ed1739'}).classification,'UNVERIFIED_DESTINATION');
class FakeSocket extends EventEmitter{
 constructor(){super();queueMicrotask(()=>this.emit('open'))}
 send(raw){const m=JSON.parse(raw);if(m.method==='eth_subscribe')queueMicrotask(()=>{this.emit('message',JSON.stringify({id:m.id,result:'0xsubscription'}));this.emit('message',JSON.stringify({method:'eth_subscription',params:{result:'0x'+'a'.repeat(64)}}))});if(m.method==='eth_getTransactionByHash')queueMicrotask(()=>this.emit('message',JSON.stringify({id:m.id,result:{hash:m.params[0],to:'0x7a250d5630b4cf539739df2c5dacab4c659f2488',input:'0x38ed1739'}})))}
 close(){this.emit('close')}
}
(async()=>{const s=await run({url:'wss://example.invalid',durationMs:5000,maxLookups:1,lookupIntervalMs:100,WebSocketImpl:FakeSocket});assert.equal(s.acknowledged,true);assert.equal(s.lookupsResolved,1);assert.equal(s.knownRouterKnownSelector,1);assert.equal(s.mainnetBroadcast,false);console.log('PENDING_V2_TEST_PASS')})().catch(e=>{console.error(e);process.exitCode=1});
