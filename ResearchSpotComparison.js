'use strict';
// Research-only cross-pool price observations. Not an executable arbitrage signal.
// Compare ONLY events carrying identical non-null block identifiers; provider ordering is not guaranteed.
const ZERO_HASH='0x'+'0'.repeat(64);
function validBlockHash(hash){return typeof hash==='string'&&/^0x[0-9a-f]{64}$/i.test(hash)&&hash.toLowerCase()!==ZERO_HASH}
function summarize(events){
 const valid=(events||[]).filter(x=>x?.postSwapSpot?.available===true&&x.tokenAddressesVerified===true&&x?.tokens?.token0?.address&&x?.tokens?.token1?.address&&validBlockHash(x.blockHash));
 const grouped=new Map();
 for(const e of valid){
  const a=e.tokens.token0.address.toLowerCase(),b=e.tokens.token1.address.toLowerCase();
  const key=e.blockHash.toLowerCase()+':'+a+':'+b;
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(e);
 }
 const comparisons=[];
 for(const [key,items] of grouped){
  const latest=new Map();
  for(const e of items){const k=e.pool.toLowerCase();const n=e.logIndex==null?null:Number(BigInt(e.logIndex));
   if(!latest.has(k)||(n!==null&&(latest.get(k).index===null||n>latest.get(k).index)))latest.set(k,{pool:e.pool,price:e.postSwapSpot.token1PerToken0,index:n});}
  const poolStates=[...latest.values()];
  if(poolStates.length<2)continue;
  for(let i=0;i<poolStates.length;i++)for(let j=i+1;j<poolStates.length;j++){
   const a=poolStates[i],b=poolStates[j];
   const pa=Number(a.price),pb=Number(b.price);
   if(!Number.isFinite(pa)||!Number.isFinite(pb)||pa<=0||pb<=0)continue;
   const differenceBps=Math.abs(pa-pb)/Math.min(pa,pb)*10000;
   comparisons.push({blockHash:key.slice(0,66),poolA:a.pool,poolB:b.pool,
     poolASpot:a.price,poolBSpot:b.price,observedSpotDifferenceBps:Number(differenceBps.toFixed(4)),
     samePreconfirmationBlock:true,sameExecutionInstantVerified:false,
     executableQuotesVerified:false,feesVerified:false,profitVerified:false,qualified:false,executionEligible:false});
  }
 }
 return {build:'RESEARCH_ONLY_8',mode:'VALID_HASH_GROUPED_CROSS_POOL_SPOT_OBSERVATION',eligibleObservations:valid.length,unresolvedBlockHashObservations:(events||[]).filter(x=>x?.postSwapSpot?.available===true&&!validBlockHash(x.blockHash)).length,
  comparablePairs:comparisons.length,comparisons:comparisons.slice(0,40),alerts:[],executionEligible:false,
  limitations:['ZERO_OR_UNRESOLVED_BLOCK_HASH_EXCLUDED','ONLY_IDENTICAL_NONZERO_BLOCK_HASH_GROUPS','FINAL_STATE_AND_EVENT_ORDER_NOT_RECONSTRUCTED','V3_SPOT_NOT_EXECUTABLE_QUOTE','NO_ATOMIC_FORK_SIMULATION','NO_TRANSACTION_SUBMISSION']};
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const tok={token0:{address:'0x'+'1'.repeat(40)},token1:{address:'0x'+'2'.repeat(40)}};
 const block='0x'+'a'.repeat(64);
 function e(pool,price,hash=block){return {pool,blockHash:hash,logIndex:'0x1',tokens:tok,tokenAddressesVerified:true,postSwapSpot:{available:true,token1PerToken0:String(price)}}}
 const a='0x'+'3'.repeat(40),b='0x'+'4'.repeat(40);
 assert.equal(summarize([e(a,2500),e(b,2501)]).comparablePairs,1);
 assert.equal(summarize([e(a,2500),e(b,2501,'0x'+'b'.repeat(64))]).comparablePairs,0);
 assert.equal(summarize([e(a,2500),e(b,2501)]).executionEligible,false);
 assert.equal(summarize([e(a,2500,ZERO_HASH),e(b,2501,ZERO_HASH)]).comparablePairs,0);
 assert.equal(summarize([e(a,2500,ZERO_HASH),e(b,2501,ZERO_HASH)]).unresolvedBlockHashObservations,2);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_8',unitAssertionsPassed:5}));
}
module.exports={summarize};
