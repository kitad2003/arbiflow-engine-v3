'use strict';
// Research-only historical transaction sequence reconstruction.
// A matched receipt proves the reported final transaction position for the checked sample,
// NOT that different post-swap pool prices were concurrently executable.
function sequence(events, corroboration){
 const receipts=new Map((corroboration?.checks||[]).map(c=>[String(c.txHash).toLowerCase(),c]));
 const groups=new Map();
 for(const e of events||[]){
  if(e?.decoded?.recognized!==true||e?.postSwapSpot?.available!==true||!e?.tokenAddressesVerified)continue;
  const tx=String(e.txHash||'').toLowerCase();
  if(!/^0x[0-9a-f]{64}$/.test(tx))continue;
  if(!groups.has(tx))groups.set(tx,[]);
  groups.get(tx).push(e);
 }
 const transactions=[];
 for(const [txHash,logs] of groups){
  const receipt=receipts.get(txHash);
  const receiptMatched=receipt?.positionMatches===true&&!receipt?.conflictingReportedPosition;
  const sorted=logs.map(e=>({pool:e.pool,logIndex:e.logIndex,blockNumber:e.blockNumber,
    observedPostSwapPrice:e.postSwapSpot.token1PerToken0,token0:e.tokens.token0.address,
    token1:e.tokens.token1.address,transactionIndex:e.transactionIndex,
    index:/^0x[0-9a-f]+$/i.test(e.logIndex||'')?Number(BigInt(e.logIndex)):null}))
    .sort((a,b)=>(a.index??Number.MAX_SAFE_INTEGER)-(b.index??Number.MAX_SAFE_INTEGER));
  const differentPools=new Set(sorted.map(x=>x.pool.toLowerCase())).size;
  const orderedEvents=receiptMatched&&sorted.every(x=>x.index!==null)&&sorted.every((x,i)=>i===0||sorted[i-1].index<x.index);
  transactions.push({txHash,confirmedBlockNumber:receiptMatched?receipt.confirmedBlockNumber:null,
   confirmedTransactionIndex:receiptMatched?receipt.confirmedTransactionIndex:null,
   receiptPositionMatched:receiptMatched,distinctPools:differentPools,decodedSwapEvents:sorted.length,
   historicalEventOrderCorroborated:orderedEvents,
   events:sorted.map(({index,...x})=>x),
   simultaneousExecutablePricesVerified:false,postTransactionStateReconstructed:false,
   backrunSimulated:false,profitVerified:false,executionEligible:false});
 }
 return {build:'RESEARCH_ONLY_11',mode:'RECEIPT_CORROBORATED_MULTI_POOL_EVENT_SEQUENCE',
  transactionsWithDecodedSwaps:transactions.length,
  transactionsTouchingMultiplePools:transactions.filter(x=>x.distinctPools>1).length,
  corroboratedSequences:transactions.filter(x=>x.historicalEventOrderCorroborated).length,
  transactions:transactions.slice(0,25),alerts:[],executionEligible:false,
  limitations:['EVENT_LOG_ORDER_NOT_A_COMPLETE_TRANSACTION_STATE','RECEIPT_POSITION_MATCH_NOT_PENDING_ORDER_PROOF',
   'POST_SWAP_PRICES_NOT_SIMULTANEOUS','NO_EXECUTABLE_QUOTES','NO_TRANSACTION_SUBMISSION']};
}
if(require.main===module){
 const assert=require('node:assert/strict'),tx='0x'+'1'.repeat(64),poolA='0x'+'2'.repeat(40),poolB='0x'+'3'.repeat(40);
 const tokens={token0:{address:'0x'+'4'.repeat(40)},token1:{address:'0x'+'5'.repeat(40)}};
 const e=(pool,n)=>({txHash:tx,pool,logIndex:'0x'+n.toString(16),blockNumber:'0x7b',transactionIndex:'0x2',
   decoded:{recognized:true},postSwapSpot:{available:true,token1PerToken0:'2500'},tokenAddressesVerified:true,tokens});
 const c={checks:[{txHash:tx,positionMatches:true,confirmedBlockNumber:123,confirmedTransactionIndex:2}]};
 const r=sequence([e(poolB,5),e(poolA,3)],c);
 assert.equal(r.transactionsTouchingMultiplePools,1);
 assert.equal(r.transactions[0].events[0].pool,poolA);
 assert.equal(r.corroboratedSequences,1);
 assert.equal(sequence([e(poolB,5),e(poolA,3)],null).corroboratedSequences,0);
 assert.equal(r.executionEligible,false);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_11',unitAssertionsPassed:5}));
}
module.exports={sequence};
