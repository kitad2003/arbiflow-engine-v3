'use strict';
function parseType(value) {
 if(typeof value!=='string'||!/^0x[0-9a-f]+$/i.test(value))throw Error('INVALID_TX_TYPE');
 return Number(BigInt(value));
}
function validatePrefix(block, receipts, targetIndex, targetHash) {
 if(!block||!Array.isArray(block.transactions)||block.transactions.length<=targetIndex)throw Error('BLOCK_PREFIX_MISSING');
 if(block.transactions[targetIndex]?.hash?.toLowerCase()!==targetHash.toLowerCase())throw Error('TARGET_TX_MISMATCH');
 if(receipts.length!==targetIndex+1)throw Error('RECEIPT_COUNT_MISMATCH');
 const rows=[],deposits=[];
 for(let i=0;i<=targetIndex;i++){
  const tx=block.transactions[i],rc=receipts[i];
  if(!tx||!rc||!tx.hash||rc.transactionHash?.toLowerCase()!==tx.hash.toLowerCase())throw Error('RECEIPT_HASH_MISMATCH_'+i);
  if(rc.blockHash?.toLowerCase()!==block.hash?.toLowerCase()||rc.blockNumber!==block.number)throw Error('RECEIPT_BLOCK_MISMATCH_'+i);
  if(Number(BigInt(rc.transactionIndex))!==i)throw Error('RECEIPT_INDEX_MISMATCH_'+i);
  const type=parseType(tx.type),rt=parseType(rc.type);
  if(type!==rt)throw Error('RECEIPT_TYPE_MISMATCH_'+i);
  if(type===126)deposits.push(i);
  rows.push({index:i,hash:tx.hash,type:'0x'+type.toString(16),receiptStatus:rc.status,gasUsed:rc.gasUsed,transactionIndex:rc.transactionIndex});
 }
 return {transactions:rows,depositIndices:deposits};
}
module.exports={parseType,validatePrefix};
