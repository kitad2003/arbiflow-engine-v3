'use strict';
const isHex = x => typeof x==='string' && /^0x[0-9a-fA-F]*$/.test(x);
const isQuantity = x => isHex(x) && x.length>=3 && (x==='0x0'||!/^0x0/i.test(x));
const isWord = x => isHex(x) && x.length===66;
function inspect(value){
 const reject=reason=>({available:false,accountsAccessed:0,fullCheckpoint:false,verifiedAgainstFork:false,reason});
 if(!value||typeof value!=='object'||Array.isArray(value))return reject('INVALID_PRESTATE');
 const entries=Object.entries(value);
 if(!entries.length)return reject('EMPTY_PRESTATE');
 let storageSlotsAccessed=0;
 for(const [address,account] of entries){
  if(!/^0x[0-9a-fA-F]{40}$/.test(address))return reject('INVALID_ADDRESS');
  if(!account||typeof account!=='object'||Array.isArray(account))return reject('INVALID_ACCOUNT');
  if(account.balance!==undefined&&!isQuantity(account.balance))return reject('INVALID_BALANCE');
  if(account.nonce!==undefined&&!isQuantity(account.nonce))return reject('INVALID_NONCE');
  if(account.code!==undefined&&(!isHex(account.code)||account.code.length%2!==0))return reject('INVALID_CODE');
  if(account.storage!==undefined){
   if(!account.storage||typeof account.storage!=='object'||Array.isArray(account.storage))return reject('INVALID_STORAGE');
   for(const [key,v] of Object.entries(account.storage)){
    if(!isWord(key)||!isWord(v))return reject('INVALID_STORAGE_WORD');
    storageSlotsAccessed++;
   }
  }
 }
 return {available:true,accountsAccessed:entries.length,storageSlotsAccessed,scope:'ACCESSED_ACCOUNTS_ONLY',fullCheckpoint:false,verifiedAgainstFork:false,reason:'PARTIAL_PRESTATE_ONLY'};
}
module.exports={inspect};
