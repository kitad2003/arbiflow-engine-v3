'use strict';
// Research-only preconfirmation-to-receipt ordering corroboration.
// Confirmation corroborates historical positions; it never proves an executable pending-state ordering.
const fs=require('node:fs'),{ethers}=require('ethers');
function safeIndex(v){try{if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v))return null;return Number(BigInt(v))}catch{return null}}
async function corroborate(observations,provider){
 const grouped=new Map();
 for(const o of observations||[]){
  if(!/^0x[0-9a-f]{64}$/i.test(o?.txHash||''))continue;
  const id=o.txHash.toLowerCase();
  if(!grouped.has(id))grouped.set(id,{txHash:id,preBlock:safeIndex(o.blockNumber),preIndex:safeIndex(o.transactionIndex),conflictingReportedPosition:false});
  else{const existing=grouped.get(id);if(existing.preBlock!==safeIndex(o.blockNumber)||existing.preIndex!==safeIndex(o.transactionIndex))existing.conflictingReportedPosition=true}
 }
 const checks=[];
 for(const item of [...grouped.values()].slice(0,30)){
  let receipt=null,error=null;
  try{receipt=await provider.getTransactionReceipt(item.txHash)}catch(e){error=String(e.shortMessage||e.message||e).slice(0,90)}
  const finalBlock=receipt?Number(receipt.blockNumber):null,finalIndex=receipt?Number(receipt.index):null;
  checks.push({...item,receiptFound:!!receipt,confirmedBlockNumber:finalBlock,confirmedTransactionIndex:finalIndex,
   confirmedBlockHash:receipt?.blockHash||null,
   positionMatches:!!receipt&&!item.conflictingReportedPosition&&item.preBlock===finalBlock&&item.preIndex===finalIndex,
   error});
 }
 return {build:'RESEARCH_ONLY_10',mode:'PRECONFIRMATION_FINAL_RECEIPT_POSITION_CORROBORATION',
  uniqueTransactions:grouped.size,checked:checks.length,matched:checks.filter(x=>x.positionMatches).length,
  mismatched:checks.filter(x=>x.receiptFound&&!x.positionMatches).length,
  missingReceipts:checks.filter(x=>!x.receiptFound).length,checks,
  pendingStateOrderingProven:false,crossPoolExecutionStateProven:false,profitVerified:false,alerts:[],executionEligible:false,
  limitations:['RECEIPTS_MAY_NOT_YET_EXIST','FINALIZED_POSITION_DOES_NOT_PROVE_PENDING_EXECUTION_ORDER','MAX_30_TRANSACTIONS','NO_TRADE_EXECUTION']};
}
if(require.main===module){
 const assert=require('node:assert/strict');
 (async()=>{const t='0x'+'1'.repeat(64),fake={getTransactionReceipt:async()=>({blockNumber:123,index:2,blockHash:'0x'+'a'.repeat(64)})};
 const x=await corroborate([{txHash:t,blockNumber:'0x7b',transactionIndex:'0x2'}],fake);
 assert.equal(x.matched,1);assert.equal(x.executionEligible,false);
 const y=await corroborate([{txHash:t,blockNumber:'0x7b',transactionIndex:'0x3'}],fake);
 assert.equal(y.matched,0);console.log(JSON.stringify({build:'RESEARCH_ONLY_10',unitAssertionsPassed:3}));})().catch(e=>{console.error(e);process.exitCode=1});
}
module.exports={corroborate};
