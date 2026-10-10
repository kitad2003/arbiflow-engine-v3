'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('events');
const {run}=require('./pending-visibility-v1');
class FakeSocket extends EventEmitter {
 constructor(){super();queueMicrotask(()=>this.emit('open'))}
 send(s){assert.equal(JSON.parse(s).params[0],'newPendingTransactions');queueMicrotask(()=>{
  this.emit('message',JSON.stringify({id:61001,result:'0xsub'}));
  const h='0x'+'a'.repeat(64);
  this.emit('message',JSON.stringify({method:'eth_subscription',params:{result:h}}));
  this.emit('message',JSON.stringify({method:'eth_subscription',params:{result:h}}));
 })}
 close(){this.emit('close')}
}
(async()=>{
 const r=await run({url:'wss://test.invalid',durationMs:5000,maxEvents:2,WebSocketImpl:FakeSocket});
 assert.equal(r.acknowledged,true);assert.equal(r.events,2);assert.equal(r.uniqueHashes,1);assert.equal(r.duplicates,1);assert.equal(r.mainnetBroadcast,false);assert.equal(r.stoppedBy,'EVENT_LIMIT_REACHED');console.log('PENDING_VISIBILITY_V1_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
