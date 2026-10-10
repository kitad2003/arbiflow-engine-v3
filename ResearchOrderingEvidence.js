'use strict';
// Research-only provider evidence inventory. A placeholder block hash is NOT a block identity.
const ZERO='0x'+'0'.repeat(64);
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/i.test(x)&&x.toLowerCase()!==ZERO;
const uint=x=>typeof x==='string'&&/^0x[0-9a-f]+$/i.test(x)||typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function inspect(items){
 const rows=Array.isArray(items)?items:[];
 const fields=['blockHash','blockNumber','transactionIndex','logIndex'];
 const present=Object.fromEntries(fields.map(f=>[f,rows.filter(x=>x?.[f]!==null&&x?.[f]!==undefined).length]));
 const valid=Object.fromEntries(fields.map(f=>[f,rows.filter(x=>f==='blockHash'?hash(x?.[f]):uint(x?.[f])).length]));
 const placeholderHashes=rows.filter(x=>typeof x?.blockHash==='string'&&x.blockHash.toLowerCase()===ZERO).length;
 return {build:'RESEARCH_ONLY_9',mode:'FLASHBLOCKS_ORDER_EVIDENCE_DIAGNOSTIC',records:rows.length,
  fieldsPresent:present,fieldsUsable:valid,zeroHashPlaceholders:placeholderHashes,
  blockIdentityProven:false,transactionOrderingProven:false,crossPoolExecutionStateProven:false,
  nextRequirement:'VERIFY_PROVIDER_BLOCK_IDENTITY_AND_TRANSACTION_POSITION_SEMANTICS',
  alerts:[],executionEligible:false};
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const sample=[{blockHash:ZERO,blockNumber:'0x123',transactionIndex:'0x1',logIndex:'0x2'}];
 const d=inspect(sample);
 assert.equal(d.zeroHashPlaceholders,1);
 assert.equal(d.fieldsUsable.blockHash,0);
 assert.equal(d.fieldsUsable.blockNumber,1);
 assert.equal(d.transactionOrderingProven,false);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_9',unitAssertionsPassed:4}));
}
module.exports={inspect};
