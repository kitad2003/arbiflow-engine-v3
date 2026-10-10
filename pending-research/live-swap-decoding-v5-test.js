'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('events');
const {inspect}=require('./live-swap-decoding-v5');
const {V2}=require('./swap-decoder-v4');
const hash='0x'+'a'.repeat(64),router='0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const path=['0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002'];
class FakeWS extends EventEmitter{
 constructor(){super();queueMicrotask(()=>this.emit('open'))}
 send(raw){const m=JSON.parse(raw);let result;
 if(m.method==='eth_chainId')result='0x1';
 if(m.method==='eth_subscribe')result='0xsub';
 if(m.method==='eth_getTransactionByHash')result={hash,to:router,input:V2.encodeFunctionData('swapExactETHForTokens',[100n,path,path[1],999999n]),value:'0x10'};
 if(m.method==='eth_getCode')result='0x6000';
 queueMicrotask(()=>{this.emit('message',JSON.stringify({jsonrpc:'2.0',id:m.id,result}));if(m.method==='eth_subscribe')this.emit('message',JSON.stringify({method:'eth_subscription',params:{subscription:'0xsub',result:hash}}))});
 }
 close(){this.emit('close')}
}
(async()=>{const s=await inspect({chain:'ethereum',url:'wss://fake',WebSocketImpl:FakeWS,durationMs:5000,maxLookups:1});
assert.equal(s.chainIdVerified,true);assert.equal(s.decodedSwaps,1);assert.equal(s.codePresent,1);assert.equal(s.profitVerified,0);console.log('LIVE_SWAP_DECODING_V5_TEST_PASS')})().catch(e=>{console.error(e);process.exitCode=1});
