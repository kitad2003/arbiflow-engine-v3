'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validatePrefix}=require('./BasePrefixValidation12990');
const h=i=>'0x'+String(i).padStart(64,'0');
function sample(){
 const block={number:'0x31f6e72',hash:h(70),transactions:[{hash:h(1),type:'0x7e'},{hash:h(2),type:'0x2'},{hash:h(3),type:'0x2'}]};
 const receipts=block.transactions.map((tx,i)=>({transactionHash:tx.hash,blockHash:block.hash,blockNumber:block.number,type:tx.type,transactionIndex:'0x'+i.toString(16),status:'0x1',gasUsed:'0x5208'}));
 return {block,receipts};
}
test('detect deposit without treating it as a signed transaction',()=>{
 const x=sample(),out=validatePrefix(x.block,x.receipts,2,h(3));
 assert.deepEqual(out.depositIndices,[0]);assert.equal(out.transactions.length,3);
});
for(const [name,mutation,error] of [
 ['wrong target',x=>x.block.transactions[2].hash=h(4),'TARGET_TX_MISMATCH'],
 ['wrong receipt hash',x=>x.receipts[1].transactionHash=h(12),'RECEIPT_HASH_MISMATCH_1'],
 ['wrong receipt index',x=>x.receipts[1].transactionIndex='0x2','RECEIPT_INDEX_MISMATCH_1'],
 ['wrong receipt type',x=>x.receipts[0].type='0x2','RECEIPT_TYPE_MISMATCH_0'],
 ['wrong block hash',x=>x.receipts[0].blockHash=h(80),'RECEIPT_BLOCK_MISMATCH_0'],
 ['missing receipt',x=>x.receipts.pop(),'RECEIPT_COUNT_MISMATCH']
])test(name,()=>{const x=sample();mutation(x);assert.throws(()=>validatePrefix(x.block,x.receipts,2,h(3)),{message:error})});
