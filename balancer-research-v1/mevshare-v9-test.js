'use strict';
const assert=require('node:assert/strict');
const {parseSSE,inspectEvent,observe,ENDPOINT}=require('./mevshare-v9');
const {SWAP_TOPIC}=require('./bot');
const hash='0x'+'b'.repeat(64),addr='0x'+'c'.repeat(40);
const sample={hash,txs:null,logs:[{address:addr,topics:[SWAP_TOPIC]}]};
assert.deepEqual(parseSSE('data: '+JSON.stringify(sample)+'\n\n'),[sample]);
assert.equal(inspectEvent(sample).swapHints,1);
assert.equal(inspectEvent(sample).candidateCount,0);
assert.equal(inspectEvent({...sample,txs:[{}]}).type,'BUNDLE');
assert.equal(inspectEvent({hash,logs:null}).accepted,false);
assert.equal(parseSSE('data: bad-json\n\n')[0].invalidJSON,true);
assert.equal(ENDPOINT,'https://mev-share.flashbots.net');
(async()=>{
 await assert.rejects(observe({network:'base',fetchImpl:()=>{throw Error('SHOULD_NOT_FETCH')}}),/ETHEREUM_ONLY/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V9',unitAssertionsPassed:8,network:'ethereum-mainnet',
  liveConnectionAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
