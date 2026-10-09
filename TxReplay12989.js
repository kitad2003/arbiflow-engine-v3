'use strict';
// Evidence-gated historical raw-tx replay. Starts at parent block 52392049.
// Replay only original signed transactions in order; verify each original receipt.
// Do not treat fork block-end quotes as exact post-swap state without reconciliation.
const fs=require('node:fs'),hre=require('hardhat'),{ethers}=require('ethers');
const BLOCK=52392050,INDEX=2,HASH='0x4b0dd34e742962465cb72493861b640356c970a7b45ee8ce4d3784359ab1341e';
const UNI='0xd0b53d9277642d899df5c87a3966a349a798f224',AERO='0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59';
const SLOT=['function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)'];
function msg(e){return String(e?.shortMessage||e?.reason||e?.code||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC]').slice(0,180)}
async function main(){
 const p=hre.ethers.provider,report={build:'12.9.89.1',mode:'BASE_HISTORICAL_PARENT_BLOCK_REPLAY',block:BLOCK,parentBlock:BLOCK-1,
 targetIndex:INDEX,targetHash:HASH,status:'BLOCKED',reason:null,rawTxAvailable:0,
 txCountRequired:3,txReplayed:0,receiptMatches:0,preTransactionStateReconstructed:false,
 postTransactionPoolStateVerified:false,netProfitVerified:false,readOnly:true,mainnetBroadcast:false,
 externalFundsMoved:false,executionEligible:false,details:[]};
 try{
  if((await p.getNetwork()).chainId!==8453n)throw Error('NOT_BASE_FORK');
  const at=await p.getBlockNumber();
  if(at!==BLOCK-1)throw Error('WRONG_FORK_BLOCK_'+at);
  const api=new ethers.JsonRpcProvider(process.env.BASE_RPC_URL,8453,{staticNetwork:true});
  try{
   const block=await api.getBlock(BLOCK,true);
   if(!block||block.transactions.length<=INDEX)throw Error('HISTORICAL_BLOCK_MISSING');
   const hashes=block.transactions.map(x=>typeof x==='string'?x:x.hash).slice(0,INDEX+1);
   if(hashes[INDEX].toLowerCase()!==HASH)throw Error('TARGET_TX_MISMATCH');
   const raw=[];
   for(let i=0;i<hashes.length;i++){
    const hash=hashes[i];
    let type=null;
    try{
     // Direct JSON-RPC bypasses ethers' transaction-format normalization.
     const info=await api.send('eth_getTransactionByHash',[hash]);
     type=info?.type||null;
     report.details.push({index:i,hash,transactionType:type,isOpStackDeposit:type==='0x7e'});
     if(type==='0x7e'){
      report.reason='BASE_OP_STACK_DEPOSIT_TX_0x7E_CANNOT_BE_REPLAYED_AS_NORMAL_SIGNED_ETHEREUM_TX';
      report.status='INCOMPATIBLE_REPLAY_TRANSACTION_TYPE';
      return;
     }
     const bytes=await api.send('eth_getRawTransactionByHash',[hash]);
     if(!ethers.isHexString(bytes)||bytes==='0x')throw Error('RAW_NOT_AVAILABLE');
     const parsed=ethers.Transaction.from(bytes);
     if(parsed.hash.toLowerCase()!==hash.toLowerCase())throw Error('RAW_HASH_MISMATCH');
     raw.push(bytes);report.rawTxAvailable++;
    }catch(e){
     report.details.push({index:i,hash,transactionType:type,status:'RETRIEVAL_OR_DECODING_FAILED',error:msg(e)});
     report.reason=type?'RAW_REPLAY_INCOMPATIBILITY_OR_RPC_LIMITATION':'HISTORICAL_TRANSACTION_METADATA_UNAVAILABLE';
     return;
    }
   }
   if(raw.length!==3){report.reason='PROVIDER_CANNOT_RETURN_ORIGINAL_SIGNED_RAW_TRANSACTIONS';return}
   // Capture historical target pool state at end of block for diagnostic ONLY.
   // It cannot be used to prove tx-index state if subsequent txs touched these pools.
   for(let i=0;i<raw.length;i++){
    const hash=hashes[i],original=await api.getTransactionReceipt(hash);
    try{
     const txh=await hre.network.provider.send('eth_sendRawTransaction',[raw[i]]);
     if(txh.toLowerCase()!==hash.toLowerCase())throw Error('REPLAY_TX_HASH_DIFFERENT');
     const rc=await p.getTransactionReceipt(txh);
     if(!rc)throw Error('NO_REPLAY_RECEIPT');
     report.txReplayed++;
     const statusMatch=Number(rc.status)===Number(original.status);
     if(statusMatch)report.receiptMatches++;
     report.details.push({index:i,hash,statusOriginal:Number(original.status),statusReplay:Number(rc.status),statusMatch,
      gasOriginal:original.gasUsed.toString(),gasReplay:rc.gasUsed.toString()});
     if(!statusMatch)throw Error('REPLAY_STATUS_MISMATCH');
    }catch(e){report.details.push({index:i,hash,status:'REPLAY_BLOCKED',error:msg(e)});break}
   }
   report.preTransactionStateReconstructed=report.txReplayed===3&&report.receiptMatches===3;
   report.status=report.preTransactionStateReconstructed?'TRANSACTIONS_REPLAYED_UNVALIDATED_POOL_STATE':'BLOCKED';
   report.reason=report.preTransactionStateReconstructed?'NEED_VERIFY_POST_TX_POOL_STATE_AND_HISTORY_ORDER_BEFORE_QUOTES':'RAW_REPLAY_FAILED_OR_STATE_MISMATCH';
  }finally{api.destroy()}
 }catch(e){report.reason=msg(e)}
 finally{
  fs.writeFileSync('arbiflow-tx-replay-12989.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
 }
}
main().catch(e=>{console.error('REPLAY_12989_FATAL',msg(e));process.exitCode=1});
