'use strict';
const assert=require('node:assert/strict');
const {TOKENS,candidates,pairKey,run}=require('./expanded-discovery-v62');
assert.equal(candidates().length,78);
assert.ok(TOKENS.USDT);
assert.equal(pairKey(TOKENS.USDT,TOKENS.WETH),pairKey(TOKENS.WETH,TOKENS.USDT));
(async()=>{
 const r=await run({provider:{getNetwork:async()=>({chainId:1n})},
 discoverImpl:async()=>({tokenPairsChecked:78,crossVenueCandidates:[],errors:[]}),
 liveImpl:async()=>({uniqueCrossVenuePairs:[],uniqueCrossVenuePairCount:0}),
 evaluateImpl:async()=>{throw Error('MOCK_REVALIDATION_FAILURE')},
 monitorMs:0,maxEvaluate:1});
 assert.equal(r.qualified,0);assert.equal(r.mainnetBroadcast,false);assert.equal(r.evaluated,1);
 assert.equal(r.failed,1);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V62',unitAssertionsPassed:7}));
})().catch(e=>{console.error(e);process.exitCode=1});
