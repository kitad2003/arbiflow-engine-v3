'use strict';
// 12.9.20 Independent read-only swap-event and Aave repayment-evidence diagnostics.
// Logs alone cannot establish debt repayment or total economic profit.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {collect}=require('./OnChainEvidence12919');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'.toLowerCase();
const UNI_POOL='0xd0b53d9277642d899df5c87a3966a349a798f224';
const AERO_POOL='0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59';
const SWAP_UNI=ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)');
const SWAP_AERO=ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)');
const TRANSFER=ethers.id('Transfer(address,address,uint256)');
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const FLASH=ethers.id('FlashLoan(address,address,address,uint256,uint8,uint256,uint16)');
function examine(logs,receiptStatus){
 const out={receiptSucceeded:receiptStatus===1,uniswapSwapLogs:0,aerodromeSwapLogs:0,aaveFlashLoanLogs:0,aaveRepaymentTransferCandidates:0,exactAaveRepaymentVerified:false,bothDexSwapsVerified:false,completeNetProfitVerified:false,qualified:false,alerts:[]};
 for(const log of logs||[]){
  const a=String(log.address||'').toLowerCase(),t=log.topics||[];
  if(a===UNI_POOL&&t[0]===SWAP_UNI)out.uniswapSwapLogs++;
  if(a===AERO_POOL&&t[0]===SWAP_AERO)out.aerodromeSwapLogs++;
  if(a===AAVE&&t[0]===FLASH)out.aaveFlashLoanLogs++;
  if(a===USDC&&t[0]===TRANSFER&&t.length===3)out.aaveRepaymentTransferCandidates++;
 }
 out.bothDexSwapsVerified=out.receiptSucceeded&&out.uniswapSwapLogs>0&&out.aerodromeSwapLogs>0;
 return out;
}
async function run(){
 const rpc=process.env.BASE_RPC_URL,hash=process.env.EVIDENCE_TX_HASH;
 if(!rpc||!hash)throw Error('BASE_RPC_URL_AND_EVIDENCE_TX_HASH_REQUIRED');
 const basic=await collect({rpcUrl:rpc,txHash:hash});
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const receipt=await p.getTransactionReceipt(hash);
  if(!receipt)throw Error('RECEIPT_NOT_FOUND');
  const evidence=examine(receipt.logs,receipt.status);
  return {success:true,build:'12.9.20',txHash:hash,receiptGasUsed:basic.gasUsed,receiptGasPriceWei:basic.effectiveGasPriceWei,executionGasPaidWei:basic.executionGasPaidWei,...evidence,l1FeeWei:null,usdcGasConversion:null,netProfitVerified:false,readOnly:true,mainnetBroadcast:false};
 }finally{p.destroy()}
}
if(require.main===module){
 const mk=(addr,topic)=>({address:addr,topics:[topic]});
 const both=[mk(UNI_POOL,SWAP_UNI),mk(AERO_POOL,SWAP_AERO),mk(AAVE,FLASH)];
 assert.equal(examine(both,1).bothDexSwapsVerified,true);
 assert.equal(examine(both,0).bothDexSwapsVerified,false);
 assert.equal(examine([both[0],both[2]],1).bothDexSwapsVerified,false);
 assert.equal(examine(both,1).exactAaveRepaymentVerified,false);
 console.log(JSON.stringify({success:true,build:'12.9.20',syntheticEventChecksPassed:4,independentLiveReceiptValidated:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false}));
 if(process.env.EVIDENCE_TX_HASH)run().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('EVENT_EVIDENCE_FAILED',String(e?.shortMessage||e?.message||e).slice(0,250));process.exitCode=1});
}
module.exports={examine,run};
