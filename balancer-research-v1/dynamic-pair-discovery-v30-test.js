'use strict';
const assert=require('node:assert/strict');
const {investigate,run}=require('./dynamic-pair-discovery-v30');
const {SWAP_TOPIC}=require('./bot');
(async()=>{
 const hash='0x'+'a'.repeat(64),bundle='0x'+'b'.repeat(64);
 const pool='0x'+'c'.repeat(40),other='0x'+'d'.repeat(40);
 const events=[{hash,logs:[{address:pool,topics:[SWAP_TOPIC]}]},
  {hash,logs:[{address:pool,topics:[SWAP_TOPIC]}]},
  {hash:bundle,txs:[{hash}],logs:[{address:pool,topics:[SWAP_TOPIC]}]}];
 const provider={getNetwork:async()=>({chainId:1n})};let checks=0;
 const discoverImpl=async()=>{checks++;return {verifiedCrossVenuePair:true,
  blockNumber:123,identity:{verified:true,venue:'UNISWAP_V2',
   factory:'0x'+'1'.repeat(40),token0:'0x'+'2'.repeat(40),token1:'0x'+'3'.repeat(40)},
  alternative:{found:true,pool:other,venue:'SUSHISWAP_V2',factory:'0x'+'4'.repeat(40)}}};
 const x=await investigate(events,{provider,discoverImpl});
 assert.equal(x.transactionEventsSeen,1);
 assert.equal(x.duplicateTransactions,1);
 assert.equal(x.bundleEventsExcluded,1);
 assert.equal(x.swapHintLogs,1);
 assert.equal(x.factoryVerifiedPairs,1);
 assert.equal(x.observations[0].alternatePool,other);
 assert.equal(checks,1);
 const y=await run({provider,discoverImpl,listenImpl:async()=>({connected:true,malformed:0,events})});
 assert.equal(y.connected,true);
 assert.equal(y.simulationAttempted,false);
 assert.equal(y.profitVerified,false);
 assert.equal(y.mainnetBroadcast,false);
 await assert.rejects(investigate(events,{provider:{getNetwork:async()=>({chainId:8453n})}}),/ETHEREUM_MAINNET_REQUIRED/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V30',unitAssertionsPassed:12,
  mockedFactoryDiscovery:true,liveProfitVerified:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
