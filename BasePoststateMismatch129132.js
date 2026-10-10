'use strict';
// Read-only comparison of mismatched target poststate fields. Never writes to either RPC.
async function diagnose(post,mismatches,read){
 const rows=[];
 for(const item of mismatches){
  const address=item.address, field=item.field,slot=item.slot;
  const expected=field==='storage'?post[address]?.storage?.[slot]:post[address]?.[field];
  const method=field==='storage'?'eth_getStorageAt':field==='balance'?'eth_getBalance':field==='nonce'?'eth_getTransactionCount':'eth_getCode';
  const params=field==='storage'?[address,slot,'latest']:[address,'latest'];
  const row={address,field,...(slot?{slot}:{})};
  try{
   const actual=await read(method,params);
   if(field==='code'){row.equal=String(actual).toLowerCase()===String(expected).toLowerCase()}
   else {const e=BigInt(expected),a=BigInt(actual);row.localMinusHistoricalWeiOrUnits=(a-e).toString();row.equal=a===e}
  }catch{row.status='VALUE_COMPARISON_UNAVAILABLE'}
  rows.push(row);
 }
 return {scope:'POSTSTATE_MISMATCH_DIAGNOSTIC_ONLY',poststateVerified:false,items:rows};
}
module.exports={diagnose};
