'use strict';
const assert=require('node:assert/strict');
const {costs,run}=require('./positive-evidence-v36');
(async()=>{
 const q={bestGrossQuote:{grossPositive:true,grossWei:'1000000',borrowWei:'10000000',direction:'ORIGIN_TO_ALTERNATE'},v26TokenCompatible:false};
 assert.equal(costs({}).status,'NOT_POSITIVE');
 assert.equal(costs(q,{gasPriceWei:2n,gasUnits:100n,flashFeeBps:100n}).assumedFlashFeeWei,'100000');
 assert.equal(costs(q,{gasPriceWei:2n,gasUnits:100n,flashFeeBps:100n}).assumedNetWei,'899800');
 assert.equal(costs(q,{gasPriceWei:2n,gasUnits:100n,flashFeeBps:100n}).netVerified,false);
 assert.equal(costs(q,{gasPriceWei:2n,gasUnits:100n,flashFeeBps:100n}).contractCompatible,false);
 assert.equal(costs(q,{gasPriceWei:0n}).gasPriceKnown,false);
 const e={kind:'PENDING_TRANSACTION',pendingHash:'0x'+'a'.repeat(64),swapPools:['0x'+'b'.repeat(40)]};
 const out=await run({provider:{getFeeData:async()=>({gasPrice:2n})},
 monitorImpl:async({onEvent})=>{await onEvent(e);return {uniqueEvents:1}},
 evaluateImpl:async()=>({...q,pool:e.swapPools[0],alternativePool:'0x'+'c'.repeat(40),
 token0:'0x'+'d'.repeat(40),token1:'0x'+'e'.repeat(40),verifiedBlock:1})});
 assert.equal(out.positiveGrossCount,1);
 assert.equal(out.positiveRecords.length,1);
 assert.equal(out.positiveRecords[0].targetHash,e.pendingHash);
 assert.equal(out.compatiblePositive,0);
 assert.equal(out.simulationAttempted,false);
 assert.equal(out.mainnetBroadcast,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V36',unitAssertionsPassed:12,mockedPositiveRetention:true,liveNetProfitVerified:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});