'use strict';
// Focused one-tx trace diagnostic. Uses existing Ethereum RPC, optional alternate trace RPC.
// Does NOT infer profits from gross WETH inflows or multi-asset transfer balances.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const HASH='0xb8f1b9cab8bff9b83d30aeff17a2397b468e37a1b64df5b90d67252c14398b91';
const TARGET='0xbdb3ba9ffe392549e1f8658dd2630c141fdf47b6';
const TRANSFER=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const TOPIC=TRANSFER.getEvent('Transfer').topicHash;
function msg(e){return String(e?.shortMessage||e?.message||e).slice(0,180)}
async function readTrace(rpc){
 const p=new ethers.JsonRpcProvider(rpc,1,{staticNetwork:true});
 try{
  for(const method of ['debug_traceTransaction','trace_transaction']){
   try{
    const t=await p.send(method,method==='debug_traceTransaction'?[HASH,{tracer:'callTracer',timeout:'12s'}]:[HASH]);
    return {method,available:true,callCount:Array.isArray(t)?t.length:null,rootType:t?.type||null};
   }catch(e){var last=msg(e)}
  }
  return {available:false,error:last};
 }finally{p.destroy()}
}
async function main(){
 const rpc=process.env.ETHEREUM_RPC_URL;assert(/^https:\/\//.test(rpc||''),'ETHEREUM_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,1,{staticNetwork:true});
 try{
  const receipt=await p.getTransactionReceipt(HASH);assert(receipt,'TX_RECEIPT_MISSING');
  const tx=await p.getTransaction(HASH);assert(tx,'TX_MISSING');
  const deltas=new Map(),events=[];let n=0;
  for(const l of receipt.logs){
   if(l.topics[0]!==TOPIC)continue;
   let d;try{d=TRANSFER.parseLog(l)}catch{continue}
   n++;const token=l.address.toLowerCase(),from=d.args.from.toLowerCase(),to=d.args.to.toLowerCase(),value=BigInt(d.args.value);
   for(const [address,change] of [[from,-value],[to,value]]){const key=address+'|'+token;deltas.set(key,(deltas.get(key)||0n)+change)}
   if(from===TARGET||to===TARGET)events.push({index:l.index,token,from,to,valueRaw:value.toString()});
  }
  const targetDeltas=[...deltas].filter(([k,v])=>k.startsWith(TARGET+'|')&&v!==0n).map(([key,val])=>({token:key.split('|')[1],deltaRaw:val.toString()}));
  const primaryTrace=await readTrace(rpc);let alternateTrace=null;
  if(process.env.ETHEREUM_TRACE_RPC_URL&&process.env.ETHEREUM_TRACE_RPC_URL!==rpc){
    alternateTrace=await readTrace(process.env.ETHEREUM_TRACE_RPC_URL);
  }
  const traced=primaryTrace.available||alternateTrace?.available||false;
  const verdict='BLOCKED';
  const report={build:'12.9.82.2',mode:'SINGLE_TRANSACTION_PROFIT_EVIDENCE_DIAGNOSTIC',hash:HASH,
   block:receipt.blockNumber,transactionIndex:receipt.index,status:Number(receipt.status),
   sender:tx.from,to:tx.to,gasPaidWei:receipt.gasPrice?(receipt.gasUsed*receipt.gasPrice).toString():null,
   targetAddress:TARGET,tokenTransfersInReceipt:n,targetTransfers:events,targetNetTransferDeltas:targetDeltas,
   primaryTrace,alternateTrace,traceAvailable:traced,verdict,
   reason:traced?'FULL_BENEFICIARY_ACCOUNTING_AND_PRE_TX_REPLAY_NOT_YET_IMPLEMENTED':'TRACE_UNAVAILABLE_NEED_TRACING_RPC_OR_RECEIPT_ONLY_LIMITATIONS',
   grossProfitVerified:false,netProfitVerified:false,priorTxStateRebuilt:false,
   required:['IDENTIFY_CONTROLLED_WALLETS_AND_FUNDING','VALUE_ALL_INCOMING_AND_OUTGOING_ASSETS_AT_SAME_BLOCK','ACCOUNT_FOR_ETH_TRANSFERS_AND_GAS','RECONSTRUCT_PRE_TX_STATE_AND_REPLAY'],
   qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
  fs.writeFileSync('arbiflow-single-tx-diagnostic-129822.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,targetTransfers:undefined}));
  return report;
 }finally{p.destroy()}
}
if(require.main===module){assert(ethers.isHexString(HASH,32));console.log(JSON.stringify({build:'12.9.82.2',unitAssertionsPassed:1}));
 main().catch(e=>{console.error('TX_DIAGNOSTIC_FAILED',msg(e));process.exitCode=1})}
module.exports={main};
