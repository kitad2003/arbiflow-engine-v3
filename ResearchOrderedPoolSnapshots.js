'use strict';
// Research-only cross-pool snapshots ordered by confirmed receipt positions.
// Descriptive history only: last observed event is NOT proof of contemporaneous pool state.
function orderedSnapshots(events,receiptReport){
 const verified=new Map((receiptReport?.checks||[]).filter(x=>x.positionMatches===true&&/^0x[0-9a-f]{64}$/i.test(x.confirmedBlockHash||'')).map(x=>[x.txHash.toLowerCase(),x]));
 const rows=[];
 for(const e of events||[]){
  const c=verified.get(String(e?.txHash||'').toLowerCase());
  if(!c||!e?.tokenAddressesVerified||!e?.postSwapSpot?.available||e?.decoded?.kind!=='V3_STYLE_SWAP')continue;
  if(Number(BigInt(e.blockNumber??'-1'))!==c.confirmedBlockNumber||Number(BigInt(e.transactionIndex??'-1'))!==c.confirmedTransactionIndex)continue;
  if(!/^0x[0-9a-f]+$/i.test(e.logIndex??''))continue;
  rows.push({blockNumber:c.confirmedBlockNumber,blockHash:c.confirmedBlockHash,txIndex:c.confirmedTransactionIndex,
   logIndex:Number(BigInt(e.logIndex)),txHash:e.txHash,pool:e.pool,token0:e.tokens.token0.address,token1:e.tokens.token1.address,
   postSwapSpot:e.postSwapSpot.token1PerToken0});
 }
 rows.sort((a,b)=>a.blockNumber-b.blockNumber||a.txIndex-b.txIndex||a.logIndex-b.logIndex);
 const groups=new Map();
 for(const row of rows){
  const key=row.blockHash.toLowerCase()+':'+row.token0.toLowerCase()+':'+row.token1.toLowerCase();
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 const comparisons=[];
 for(const blockRows of groups.values()){
  const lastByPool=new Map();
  for(const row of blockRows){
   lastByPool.set(row.pool.toLowerCase(),row);
   for(const [pool,prev] of lastByPool){
    if(pool===row.pool.toLowerCase())continue;
    const a=Number(row.postSwapSpot),b=Number(prev.postSwapSpot);
    if(!(Number.isFinite(a)&&Number.isFinite(b)&&a>0&&b>0))continue;
    comparisons.push({blockNumber:row.blockNumber,confirmedBlockHash:row.blockHash,
     referenceTxHash:row.txHash,referenceTxIndex:row.txIndex,
     updatedPool:row.pool,lastSeenOtherPool:prev.pool,
     latestObservedSpot:row.postSwapSpot,staleOtherPoolSpot:prev.postSwapSpot,
     historicalObservedDifferenceBps:Math.round((Math.abs(a-b)/Math.min(a,b))*1e6)/100,
     otherPoolLastSeenTxIndex:prev.txIndex,
     executionStateCoherent:false,simultaneouslyExecutable:false,qualified:false,executionEligible:false});
   }
  }
 }
 return {build:'RESEARCH_ONLY_12',mode:'CONFIRMED_BLOCK_ORDERED_POOL_SPOT_HISTORY',receiptMatchedSwapEvents:rows.length,
  sameBlockHistoricalComparisons:comparisons.length,comparisons:comparisons.slice(0,30),
  alerts:[],executionEligible:false,limitations:['OTHER_POOL_PRICE_MAY_BE_STALE','LATEST_SWAP_LOG_IS_NOT_POOL_STATE_AT_NEXT_TX_POSITION','RECEIPT_HISTORY_NOT_PRECONFIRMED_EXECUTABILITY','NOT_AN_ATOMIC_EXECUTION_QUOTE']};
}
if(require.main===module){
 const assert=require('node:assert/strict'),h='0x'+'a'.repeat(64),bh='0x'+'b'.repeat(64);
 const ta='0x'+'1'.repeat(40),tb='0x'+'2'.repeat(40);
 const poolA='0x'+'3'.repeat(40),poolB='0x'+'4'.repeat(40);
 const test=(pool,price,idx)=>({txHash:idx===1?h:'0x'+'c'.repeat(64),pool,
  blockNumber:'0x64',transactionIndex:'0x'+idx.toString(16),logIndex:'0x'+(idx*10).toString(16),
  tokenAddressesVerified:true,tokens:{token0:{address:ta},token1:{address:tb}},
  decoded:{kind:'V3_STYLE_SWAP'},postSwapSpot:{available:true,token1PerToken0:String(price)}});
 const receipts={checks:[{txHash:h,positionMatches:true,confirmedBlockNumber:100,confirmedTransactionIndex:1,confirmedBlockHash:bh},
 {txHash:'0x'+'c'.repeat(64),positionMatches:true,confirmedBlockNumber:100,confirmedTransactionIndex:2,confirmedBlockHash:bh}]};
 const result=orderedSnapshots([test(poolA,2500,1),test(poolB,2502,2)],receipts);
 assert.equal(result.sameBlockHistoricalComparisons,1);assert.equal(result.comparisons[0].simultaneouslyExecutable,false);
 assert.equal(orderedSnapshots([test(poolA,2500,1),test(poolB,2502,2)],null).sameBlockHistoricalComparisons,0);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_12',unitAssertionsPassed:3}));
}
module.exports={orderedSnapshots};
