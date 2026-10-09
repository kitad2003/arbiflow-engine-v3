'use strict';
// ArbiFlow 12.9.90 — read-only OP Stack historical trace capability diagnostic.
// Does NOT pretend that eth_sendRawTransaction can replay a 0x7e deposit.
// Does NOT submit, sign, or execute any transaction.
const fs = require('node:fs');
const { JsonRpcProvider } = require('ethers');
const { validatePrefix } = require('./BasePrefixValidation12990');
const { evaluateTrace } = require('./BaseTraceValidation12991');
const { verdict } = require('./BaseEvidenceGate12992');
const { readiness } = require('./BaseReconstructionReadiness12993');
const { continuity } = require('./BaseTraceContinuity12995');
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
  status:'BLOCKED', reason:null,depositIndices:[],transactions:[],prefixTraces:[],traceContinuity:[],
  rpcTraceSupported:null,traceProbed:false,traceTargetSuccessful:false,
  preTransactionStateReconstructed:false,receiptMatches:0,
  postTransactionPoolStateVerified:false,netProfitVerified:false,
  targetPrestateSnapshot:null,
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
  const receipts=[];
  for(let i=0;i<=TARGET_INDEX;i++)receipts.push(await rpc.send('eth_getTransactionReceipt',[block.transactions[i].hash]));
  const prefix=validatePrefix(block,receipts,TARGET_INDEX,TARGET_HASH);
  result.transactions=prefix.transactions;
  result.depositIndices=prefix.depositIndices;
  // Default mode only reads block + receipt metadata. Tracing is optional because
  // third-party RPC providers may not expose debug_traceTransaction.
  if(process.env.ARBIFLOW_ENABLE_TRACE_PROBE==='1'){
   result.traceProbed=true;
   try{
    // A tracer result establishes provider capabilities, NOT valid replayed state.
    let previousDiff=null;
    for(let i=0;i<TARGET_INDEX;i++){
     const tx=result.transactions[i];
     try{
      const diff=await rpc.send('debug_traceTransaction',[tx.hash,{tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'20s'}]);
      const check=evaluateTrace(diff);
      if(previousDiff)result.traceContinuity.push({from:i-1,to:i,...continuity(previousDiff,diff)});
      previousDiff=check.traceShapeValid?diff:null;
      result.prefixTraces.push({index:i,hash:tx.hash,transactionType:tx.type,traceShapeValid:check.traceShapeValid,traceSummary:check});
     }catch(e){result.prefixTraces.push({index:i,hash:tx.hash,transactionType:tx.type,traceShapeValid:false,error:short(e)});}
    }
    const trace=await rpc.send('debug_traceTransaction',[TARGET_HASH,
      {tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'20s'}]);
    const validated=evaluateTrace(trace);
    if(previousDiff && validated.traceShapeValid){
      result.traceContinuity.push({from:TARGET_INDEX-1,to:TARGET_INDEX,...continuity(previousDiff,trace)});
    }
    result.continuitySummary={pairsChecked:result.traceContinuity.length,contradictions:result.traceContinuity.filter(x=>x.status==='INCONSISTENT').length,comparisonIsPartial:true,provesReconstruction:false};
    result.rpcTraceSupported=true;
    result.traceTargetSuccessful=validated.traceShapeValid;
    result.traceValidation=validated;
    result.traceShape=trace && typeof trace==='object' ? Object.keys(trace).slice(0,8) : [];
    // Separate, read-only pre-transaction account snapshot from the target's own trace.
    // prestateTracer without diffMode captures *accessed* account prestate only;
    // it is not a complete executable fork checkpoint.
    try {
      const snapshot=await rpc.send('debug_traceTransaction',[TARGET_HASH,
        {tracer:'prestateTracer',timeout:'20s'}]);
      const accounts=snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)?Object.entries(snapshot):[];
      const addressValid=a=>/^0x[0-9a-fA-F]{40}$/.test(a);
      const valid=accounts.length>0&&accounts.every(([a,v])=>addressValid(a)&&v&&typeof v==='object'&&!Array.isArray(v));
      result.targetPrestateSnapshot={available:valid,accountsAccessed:valid?accounts.length:0,
        scope:'ACCESSED_ACCOUNTS_ONLY',fullCheckpoint:false,verifiedAgainstFork:false,
        reason:valid?'TARGET_TRACE_PRESTATE_CAPTURED_NOT_FULL_STATE':'MALFORMED_OR_EMPTY_PRESTATE'};
    }catch(e){result.targetPrestateSnapshot={available:false,fullCheckpoint:false,error:short(e)};}
   }catch(e){result.rpcTraceSupported=false;result.traceError=short(e)}
  }
  result.status='PREFLIGHT_COMPLETE_REPLAY_NOT_PROVEN';
  result.reason=result.depositIndices.length
    ? 'OP_STACK_DEPOSIT_IN_PREFIX_REQUIRES_PROTOCOL_AWARE_STATE_RECONSTRUCTION'
    : 'TRACE_AND_RECEIPT_PROOFS_REQUIRED_BEFORE_REPLAY_CLAIMS';
 } catch(e) {result.reason=short(e)}
 finally { if(rpc)rpc.destroy();result.evidenceGate=verdict(result);result.reconstructionReadiness=readiness(result);fs.writeFileSync(OUTPUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
}
main().catch(e=>{console.error('BASE_TRACE_12990_FATAL',short(e));process.exitCode=1});
