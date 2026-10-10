'use strict';
const assert=require('node:assert/strict');
const {evaluate,run}=require('./pending-gross-gate-v35');
(async()=>{
 const h='0x'+'a'.repeat(64),pool='0x'+'b'.repeat(40),other='0x'+'c'.repeat(40);
 const event={kind:'PENDING_TRANSACTION',pendingHash:h,swapPools:[pool]};
 assert.equal((await evaluate({...event,kind:'BUNDLE'})).reason,'NOT_PENDING_TRANSACTION');
 assert.equal((await evaluate({...event,swapPools:[]})).reason,'NO_SWAP_HINT');
 assert.equal((await evaluate(event)).reason,'ETHEREUM_RPC_REQUIRED');
 const discoverImpl=async()=>({verifiedCrossVenuePair:true,blockNumber:123,
  identity:{verified:true,pool,token0:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',token1:'0xec67005c4E498Ec7f55E092bd1d35cbC47C91892'},
  alternative:{found:true,pool:other}});
 const reserveImpl=async addr=>addr===pool?[1000000000n,1000000000n]:[1000000000n,1000000000n];
 const q=await evaluate(event,{provider:{},discoverImpl,reserveImpl});
 assert.equal(q.state,'CONFIRMED_RESERVE_QUOTE_ONLY');
 assert.equal(q.v26TokenCompatible,true);
 assert.equal(q.allQuotes.length,4);
 assert.equal(q.bestGrossQuote.grossPositive,false);
 assert.equal(q.candidateForTargetSimulation,false);
 const result=await run({provider:{},monitorImpl:async({onEvent})=>{
  await onEvent(event);await onEvent({...event,kind:'BUNDLE'});
  return {uniqueEvents:2,mainnetBroadcast:false};
 },evaluateImpl:async()=>q});
 assert.equal(result.pendingSwapEvents,1);
 assert.equal(result.verifiedQuotes,1);
 assert.equal(result.simulationCandidates,0);
 assert.equal(result.mainnetBroadcast,false);
 assert.equal(result.executionEligible,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V35',unitAssertionsPassed:12,
  mockedGate:true,liveSimulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
