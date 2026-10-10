'use strict';
// Compare only fields touched by the target transaction. This is NOT a full state root proof.
const qty=x=>{if(typeof x==='number'&&Number.isSafeInteger(x)&&x>=0)return BigInt(x);if(typeof x==='string'&&/^0x[0-9a-fA-F]+$/.test(x))return BigInt(x);throw Error('INVALID_QUANTITY')};
async function compare(snapshot,read){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw Error('INVALID_SNAPSHOT');
 const accounts=Object.entries(snapshot);
 if(!accounts.length||accounts.length>100)throw Error('SNAPSHOT_ACCOUNT_LIMIT');
 const out={accounts:accounts.length,fieldsChecked:0,mismatches:[],readFailures:0,scope:'TARGET_ACCESSED_PRESTATE_ONLY',fullCheckpoint:false};
 for(const [address,item] of accounts){
  if(!/^0x[0-9a-fA-F]{40}$/.test(address)||!item||typeof item!=='object')throw Error('INVALID_ACCOUNT');
  for(const [field,method,params] of [
   ['nonce','eth_getTransactionCount',[address,'latest']],
   ['balance','eth_getBalance',[address,'latest']],
   ['code','eth_getCode',[address,'latest']]
  ]){
   if(item[field]===undefined)continue;
   try{
    const local=await read(method,params);
    const equal=field==='code'?String(local).toLowerCase()===String(item[field]).toLowerCase():qty(local)===qty(item[field]);
    out.fieldsChecked++;if(!equal)out.mismatches.push({address,field});
   }catch{out.readFailures++;out.mismatches.push({address,field,reason:'READ_OR_VALIDATION_FAILURE'})}
  }
  if(item.storage!==undefined){
   if(!item.storage||typeof item.storage!=='object'||Array.isArray(item.storage))throw Error('INVALID_STORAGE');
   for(const [slot,expected] of Object.entries(item.storage)){
    if(!/^0x[0-9a-fA-F]{64}$/.test(slot))throw Error('INVALID_SLOT');
    try{
     const local=await read('eth_getStorageAt',[address,slot,'latest']);
     out.fieldsChecked++;if(qty(local)!==qty(expected))out.mismatches.push({address,field:'storage',slot});
    }catch{out.readFailures++;out.mismatches.push({address,field:'storage',slot,reason:'READ_OR_VALIDATION_FAILURE'})}
   }
  }
 }
 out.matched=out.fieldsChecked>0&&out.mismatches.length===0&&out.readFailures===0;
 return out;
}
module.exports={compare};
