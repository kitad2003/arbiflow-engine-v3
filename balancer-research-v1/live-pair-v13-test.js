'use strict';
const assert=require('node:assert/strict');
const {swapPoolAddresses,investigate,observe}=require('./live-pair-v13');
const {SWAP_TOPIC}=require('./bot');
const pool='0x'+'a'.repeat(40),hash='0x'+'b'.repeat(64);
const event={hash,txs:null,logs:[{address:pool,topics:[SWAP_TOPIC]},{address:pool,topics:[SWAP_TOPIC]}]};
const calls=[];
const provider={getNetwork:async()=>({chainId:1n})};
const discoverImpl=async(_p,log)=>{calls.push(log.address);return {recognized:true,identity:{verified:true,venue:'UNISWAP_V2'},alternative:{found:true,venue:'SUSHISWAP_V2',pool:'0x'+'c'.repeat(40)},verifiedCrossVenuePair:true}};
(async()=>{
 assert.equal(swapPoolAddresses(event).length,1);
 assert.equal(swapPoolAddresses({...event,logs:[]}).length,0);
 const result=await investigate([event,event,{hash:'0x'+'d'.repeat(64),txs:[{}],logs:event.logs}],provider,{discoverImpl});
 assert.equal(result.eventsReceived,3);
 assert.equal(result.duplicates,1);
 assert.equal(result.transactionEvents,1);
 assert.equal(result.bundleEvents,1);
 assert.equal(result.uniquePoolsInvestigated,1);
 assert.equal(calls.length,1);
 assert.equal(result.verifiedCrossVenuePools,1);
 assert.equal(result.executionEligible,false);
 await assert.rejects(investigate([event],{getNetwork:async()=>({chainId:8453n})}),/ETHEREUM_MAINNET_REQUIRED/);
 await assert.rejects(observe({network:'base',provider}),/ETHEREUM_MEV_SHARE_ONLY/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V13',unitAssertionsPassed:12,
  mockedDiscovery:true,liveRPCVerified:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
