'use strict';
// ArbiFlow 12.9.90 — read-only OP Stack historical trace capability diagnostic.
// Does NOT pretend that eth_sendRawTransaction can replay a 0x7e deposit.
// Does NOT submit, sign, or execute any transaction.
const fs = require('node:fs');
const { JsonRpcProvider } = require('ethers');
const BLOCK = 52392050;
const TARGET_INDEX = 2;
const TARGET_HASH = '0x4b0dd34e742962465cb72493861b640356c970a7b45ee8ce4d3784359ab1341e';
const OUTPUT = 'arbiflow-base-trace-12990.json';
const short = e => String(e?.shortMessage || e?.message || e).replace(/https?:\/\/\S+/g,'[RPC]').slice(0,220);
function assert(ok, reason) { if (!ok) throw Error(reason); }
async function main() {
 const result = {
  build:'12.9.90',mode:'BASE_OP_STACK_TRACE_PREFLIGHT',block:BLOCK,
  parentBlock:BLOCK-1,targetIndex:TARGET_INDEX,targetHash:TARGET_HASH,
  status:'BLOCKED', reason:null,depositIndices:[],transactions:[],
  rpcTraceSupported:null,traceProbed:false,traceTargetSuccessful:false,
  preTransactionStateReconstructed:false,receiptMatches:0,
  postTransactionPoolStateVerified:false,netProfitVerified:false,
  readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false
 };
 let rpc;
 try {
  assert(/^https:\/\//.test(process.env.BASE_RPC_URL || ''),'BASE_RPC_URL_HTTPS_REQUIRED');
  rpc = new JsonRpcProvider(process.env.BASE_RPC_URL,8453,{staticNetwork:true});
  const network=await rpc.getNetwork();
  assert(network.chainId===8453n,'NOT_BASE');
  const block=await rpc.send('eth_getBlockByNumber',['0x'+BLOCK.toString(16),true]);
  assert(block?.transactions?.length>TARGET_INDEX,'HISTORICAL_BLOCK_MISSING');
  assert(block.transactions[TARGET_INDEX].hash.toLowerCase()===TARGET_HASH,'TARGET_TX_MISMATCH');
  for(let i=0;i<=TARGET_INDEX;i++){
   const tx=block.transactions[i];const receipt=await rpc.send('eth_getTransactionReceipt',[tx.hash]);
   assert(receipt&&receipt.blockNumber===block.number,'RECEIPT_BLOCK_MISMATCH_'+i);
   const type=Number(BigInt(tx.type));const receiptType=Number(BigInt(receipt.type));
   assert(type===receiptType,'TX_RECEIPT_TYPE_MISMATCH_'+i);
   if(type===126)result.depositIndices.push(i);
   result.transactions.push({index:i,hash:tx.hash,type:'0x'+type.toString(16),
    receiptStatus:receipt.status,gasUsed:receipt.gasUsed,transactionIndex:receipt.transactionIndex});
  }
  // Default mode only reads block + receipt metadata. Tracing is optional because
  // third-party RPC providers may not expose debug_traceTransaction.
  if(process.env.ARBIFLOW_ENABLE_TRACE_PROBE==='1'){
   result.traceProbed=true;
   try{
    // A tracer result establishes provider capabilities, NOT valid replayed state.
    const trace=await rpc.send('debug_traceTransaction',[TARGET_HASH,
      {tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'20s'}]);
    result.rpcTraceSupported=!!trace;
    result.traceTargetSuccessful=!!(trace&&typeof trace==='object');
    result.traceShape=trace ? Object.keys(trace).slice(0,8) : [];
   }catch(e){result.rpcTraceSupported=false;result.traceError=short(e)}
  }
  result.status='PREFLIGHT_COMPLETE_REPLAY_NOT_PROVEN';
  result.reason=result.depositIndices.length
    ? 'OP_STACK_DEPOSIT_IN_PREFIX_REQUIRES_PROTOCOL_AWARE_STATE_RECONSTRUCTION'
    : 'TRACE_AND_RECEIPT_PROOFS_REQUIRED_BEFORE_REPLAY_CLAIMS';
 } catch(e) {result.reason=short(e)}
 finally { if(rpc)rpc.destroy();fs.writeFileSync(OUTPUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
}
main().catch(e=>{console.error('BASE_TRACE_12990_FATAL',short(e));process.exitCode=1});
