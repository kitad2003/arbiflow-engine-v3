'use strict';
const assert=require('node:assert/strict');
const {classify,investigate,run}=require('./event-classifier-v32');
const {SWAP_TOPIC}=require('./bot');
(async()=>{
 const a='0x'+'a'.repeat(64),b='0x'+'b'.repeat(64),c='0x'+'c'.repeat(64),pool='0x'+'d'.repeat(40);
 const events=[{hash:a,txs:[{hash:b}],logs:[{address:pool,topics:[SWAP_TOPIC]}]},
  {hash:a,txs:[{hash:b}]},
  {hash:c,txs:[{},{}],logs:[{address:pool,topics:[SWAP_TOPIC]}]},
  {hash:b,txs:[{}],logs:[]}];
 const x=classify(events);
 assert.equal(x.uniqueEvents,3);
 assert.equal(x.duplicates,1);
 assert.equal(x.records[0].eventHashIsTarget,false);
 assert.equal(x.records[0].referenceCandidate,b);
 assert.equal(x.records[0].simulationReady,false);
 assert.equal(x.records[1].referenceCandidate,null);
 assert.equal(x.records[1].logsAttributedToSpecificTx,false);
 assert.equal(x.records[2].referenceCandidate,null);
 const provider={getNetwork:async()=>({chainId:1n})};
 const y=await investigate(events,{provider,discoverImpl:async()=>({verifiedCrossVenuePair:true,
  identity:{token0:pool,token1:pool},alternative:{found:true,pool}})});
 assert.equal(y.factoryChecksPerformed,1);
 assert.equal(y.eventHashesPromotedToTxTargets,0);
 assert.equal(y.simulationReadyCandidates,0);
 const z=await run({provider,listenImpl:async()=>({events,connected:true,malformed:0}),discoverImpl:async()=>({verifiedCrossVenuePair:false})});
 assert.equal(z.connected,true);
 assert.equal(z.mainnetBroadcast,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V32',unitAssertionsPassed:13,
  doubleHashSafetyVerified:true,mockedDiscovery:true,simulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
