'use strict';
// Research-only pending-transaction intelligence foundation. No old route, loan, or venue assumptions.
// Input: event/transaction observations supplied by a supported feed.
// Output: prioritized pool-change investigation candidates; never execution signals.
const fs=require('node:fs');
function assess(observations){
 if(!Array.isArray(observations))throw Error('OBSERVATIONS_ARRAY_REQUIRED');
 const out=[],seen=new Set();
 for(const x of observations){
  if(!x||typeof x!=='object')continue;
  const hash=typeof x.txHash==='string'&&/^0x[0-9a-f]{64}$/i.test(x.txHash)?x.txHash.toLowerCase():null;
  const pool=typeof x.pool==='string'&&/^0x[0-9a-f]{40}$/i.test(x.pool)?x.pool.toLowerCase():null;
  if(!hash||!pool||!['PENDING','PRECONFIRMED'].includes(x.phase))continue;
  const key=hash+':'+pool;if(seen.has(key))continue;seen.add(key);
  out.push({txHash:hash,pool,phase:x.phase,chainId:8453,
   action:'SIMULATE_POST_TRANSACTION_POOL_STATE',
   observedAmountRaw:/^[0-9]+$/.test(String(x.amountRaw??''))?String(x.amountRaw):null,
   forecastAvailable:false,backrunSimulated:false,profitVerified:false,qualified:false,
   executionEligible:false});
 }
 return {build:'RESEARCH_ONLY_1',mode:'BASE_TRANSACTION_IMPACT_CANDIDATES',received:observations.length,accepted:out.length,
  candidates:out,alerts:[],mainnetBroadcast:false,executionEligible:false,
  limitations:['INPUT_IS_NOT_A_LIVE_FEED','NO_MEMPOOL_COMPLETENESS_CLAIM','NO_ROUTE_OR_PRICE_FORECAST','NO_PRIVATE_SUBMISSION','NO_PROFITABILITY_CLAIM']};
}
if(require.main===module){
 const {strict:assert}=require('node:assert');
 const demo={txHash:'0x'+'1'.repeat(64),pool:'0x'+'2'.repeat(40),phase:'PRECONFIRMED',amountRaw:'1000'};
 const t=assess([demo,demo,{...demo,phase:'CONFIRMED'}, {...demo,pool:'invalid'}]);
 assert.equal(t.accepted,1);assert.equal(t.executionEligible,false);assert.equal(t.alerts.length,0);
 const input=process.env.RESEARCH_OBSERVATIONS_FILE;
 const result=input?assess(JSON.parse(fs.readFileSync(input,'utf8'))):{...t,mode:'OFFLINE_VALIDATION_ONLY'};
 fs.writeFileSync('arbiflow-research-impact.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
module.exports={assess};
