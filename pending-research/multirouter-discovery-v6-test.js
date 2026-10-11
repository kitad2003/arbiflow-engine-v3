'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('events');
const {inspect}=require('./multirouter-discovery-v6');
const hash='0x'+'a'.repeat(64),to='0xdac17f958d2ee523a2206206994597c13d831ec7';
class FakeWS extends EventEmitter{
 constructor(){super();queueMicrotask(()=>this.emit('open'))}
 send(raw){const m=JSON.parse(raw);let result;
 if(m.method==='eth_chainId')result='0x1';
 if(m.method==='eth_subscribe')result='0xsub';
 if(m.method==='eth_getTransactionByHash')result={hash,to,input:'0xa9059cbb'+'0'.repeat(128),value:'0x0'};
 queueMicrotask(()=>{this.emit('message',JSON.stringify({id:m.id,result}));if(m.method==='eth_subscribe')this.emit('message',JSON.stringify({method:'eth_subscription',params:{subscription:'0xsub',result:hash}}))});
 }
 close(){this.emit('close')}
}
(async()=>{const s=await inspect({chain:'ethereum',url:'wss://fake',WebSocketImpl:FakeWS,durationMs:5000,maxLookups:1});assert.equal(s.chainIdVerified,true);assert.equal(s.lookupsResolved,1);assert.equal(s.classificationCounts.ERC20_TRANSFER_SELECTOR,1);assert.equal(s.topSelectors[0].value,'0xa9059cbb');assert.equal(s.topDestinations[0].value,to);assert.equal(s.profitVerified,0);console.log('MULTIROUTER_DISCOVERY_V6_TEST_PASS')})().catch(e=>{console.error(e);process.exitCode=1});
