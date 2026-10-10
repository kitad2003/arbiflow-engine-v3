'use strict';
const assert=require('node:assert/strict');
const {rateBps,screen,run}=require('./economic-screen-v61');
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40);
(async()=>{
 assert.equal(rateBps({sizeRaw:'10000',returnedRaw:'10051'}),'51');
 assert.equal(rateBps({sizeRaw:'10000',returnedRaw:'10050'}),'50');
 assert.equal(screen([{sizeRaw:'10000',returnedRaw:'10051',grossDeltaRaw:'51'}])[0].passesGrossSpread,true);
 assert.equal(screen([{sizeRaw:'10000',returnedRaw:'10050',grossDeltaRaw:'50'}])[0].passesGrossSpread,false);
 const r=await run({provider:{getNetwork:async()=>({chainId:1n})},seedPairs:[{a,b,source:'TEST'}],
 liveImpl:async()=>({uniqueCrossVenuePairs:[],uniqueCrossVenuePairCount:0}),
 metadataImpl:async(_,address)=>({address,decimals:18,verified:true}),
 evaluateImpl:async()=>({blockNumber:1,token0:a,token1:b,reserves:{poolA:{r0:'1',r1:'2'},poolB:{r0:'2',r1:'1'}},
 quotes:[{inputToken:a,sizeRaw:'10000',returnedRaw:'10051',grossDeltaRaw:'51'}]})});
 assert.equal(r.grossSpreadAboveHalfPercent,1);assert.equal(r.netProfitVerified,false);assert.equal(r.results[0].bestGross.grossDeltaFormatted,'0.000000000000000051');
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V61',status:'UNIT_TEST_PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1});
