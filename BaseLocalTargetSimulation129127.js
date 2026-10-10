'use strict';
// LOCAL-ONLY execution against a disposable Anvil fork. Never send to remote RPC.
const TARGET='0x4b0dd34e742962465cb72493861b640356c970a7b45ee8ce4d3784359ab1341e';
async function simulate(local,remote){
 const report={mode:'LOCAL_ONLY_IMPERSONATED_TARGET_SIMULATION',targetHash:TARGET,mainnetBroadcast:false,localOnly:true,originalTxReplayed:false,receiptMatches:false,postStateVerified:false,status:'BLOCKED'};
 let stage='FETCH_TARGET_TRANSACTION';
 try{
 const tx=await remote('eth_getTransactionByHash',[TARGET]);
 stage='FETCH_TARGET_RECEIPT';
 const receipt=await remote('eth_getTransactionReceipt',[TARGET]);
 if(!tx||!receipt||tx.type==='0x7e'||!tx.from){report.reason='TARGET_METADATA_UNAVAILABLE';return report}
 stage='LOCAL_SENDER_NONCE';
 const before=await local('eth_getTransactionCount',[tx.from,'latest']);
 const expected=BigInt(tx.nonce);
 if(BigInt(before)!==expected){report.reason='SENDER_NONCE_MISMATCH';return report}
 const request={from:tx.from,to:tx.to??undefined,data:tx.input??'0x',value:tx.value??'0x0',gas:tx.gas};
 if(tx.maxFeePerGas!=null&&tx.maxPriorityFeePerGas!=null){
  request.maxFeePerGas=tx.maxFeePerGas;request.maxPriorityFeePerGas=tx.maxPriorityFeePerGas;request.type='0x2';
 }else if(tx.gasPrice!=null)request.gasPrice=tx.gasPrice;
 stage='LOCAL_IMPERSONATION';
 await local('anvil_impersonateAccount',[tx.from]);
 try{
  // eth_sendTransaction targets only the loopback Anvil RPC supplied by caller.
  stage='LOCAL_EXECUTE_TRANSACTION';
  const hash=await local('eth_sendTransaction',[request]);
  stage='LOCAL_RECEIPT';
  let actual=await local('eth_getTransactionReceipt',[hash]);
  if(!actual){
   report.receiptInitiallyMissing=true;
   stage='LOCAL_MINE_PENDING_TRANSACTION';
   await local('evm_mine',[]);
   stage='LOCAL_RECEIPT_AFTER_MINE';
   actual=await local('eth_getTransactionReceipt',[hash]);
  }
  if(!actual){report.reason='LOCAL_RECEIPT_MISSING_AFTER_MINE';return report}
  report.localHash=hash;
  const normalizeLog=l=>({address:l.address?.toLowerCase(),topics:(l.topics||[]).map(t=>t.toLowerCase()),data:l.data?.toLowerCase()});
  const hlogs=(receipt.logs||[]).map(normalizeLog),llogs=(actual.logs||[]).map(normalizeLog);
  report.logsComparison={historicalCount:hlogs.length,localCount:llogs.length,matched:JSON.stringify(hlogs)===JSON.stringify(llogs),firstDifferentIndex:null};
  for(let i=0;i<Math.max(hlogs.length,llogs.length);i++){if(JSON.stringify(hlogs[i])!==JSON.stringify(llogs[i])){report.logsComparison.firstDifferentIndex=i;break}}
  const historicBlock=await remote('eth_getBlockByNumber',[receipt.blockNumber,false]);
  const localBlock=await local('eth_getBlockByNumber',[actual.blockNumber,false]);
  report.blockEnvironment={historical:{timestamp:historicBlock?.timestamp,baseFeePerGas:historicBlock?.baseFeePerGas,gasLimit:historicBlock?.gasLimit},local:{timestamp:localBlock?.timestamp,baseFeePerGas:localBlock?.baseFeePerGas,gasLimit:localBlock?.gasLimit}};
  report.historicalReceiptStatus=receipt.status;
  report.localReceiptStatus=actual.status;
  report.historicalGasUsed=String(BigInt(receipt.gasUsed));
  report.localGasUsed=String(BigInt(actual.gasUsed));
  report.statusMatches=BigInt(actual.status)===BigInt(receipt.status);
  report.gasMatches=BigInt(actual.gasUsed)===BigInt(receipt.gasUsed);
  report.receiptMatches=report.statusMatches&&report.gasMatches;
  report.status=report.receiptMatches?'LOCAL_RECEIPT_FIELDS_MATCH':'LOCAL_RECEIPT_FIELDS_DIFFER';
  report.reason='IMPERSONATED_TRANSACTION_NOT_ORIGINAL_SIGNED_TX_POSTSTATE_UNVERIFIED';
  return report;
 }finally{try{await local('anvil_stopImpersonatingAccount',[tx.from])}catch{}}
 }catch(e){
  report.status='LOCAL_SIMULATION_FAILED';report.failedStage=stage;
  const code=typeof e?.code==='string'?e.code:null;
  report.errorClass=e?.message==='REMOTE_TRACE_UNAVAILABLE'?'REMOTE_RPC_UNAVAILABLE':e?.message?.startsWith('LOCAL_RPC_ERROR_')?'LOCAL_RPC_REJECTED':code==='ABORT_ERR'?'TIMEOUT':'EXECUTION_OR_TRANSPORT_ERROR';
  return report;
 }
}
module.exports={simulate};
