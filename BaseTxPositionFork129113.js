'use strict';
// Read-only Anvil transaction-position fork startup probe. No signing or broadcasting.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const {compare}=require('./BaseForkCompare129115');
const {simulate}=require('./BaseLocalTargetSimulation129127');
const {diagnose}=require('./BasePoststateMismatch129132');
const TARGET='0x4b0dd34e742962465cb72493861b640356c970a7b45ee8ce4d3784359ab1341e';
const PREDECESSOR='0xb86187ffee731a987660d6a9b7e1d7046a9a5282e8d1d6658295af2e9967063c';
const PORT=18545;
const BLOCK=52392050;
const TARGET_INDEX=2;
const report={build:'12.9.134',mode:'BASE_TRANSACTION_POSITION_FORK_PROBE',block:52392050,targetIndex:2,targetHash:TARGET,readOnly:true,mainnetBroadcast:false,preTransactionStateReconstructed:false,receiptMatches:0,executionEligible:false,status:'BLOCKED',reason:'NOT_STARTED'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(method,params=[]){
 const response=await fetch('http://127.0.0.1:'+PORT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(2000)});
 const body=await response.json();if(body.error)throw Error('LOCAL_RPC_ERROR_'+body.error.code);return body.result;
}
async function remote(url,method,params){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(30000)});const value=await response.json();if(!response.ok||value.error)throw Error('REMOTE_TRACE_UNAVAILABLE');return value.result}
async function metadataRead(traceUrl,method,params){
 const primary=process.env.BASE_RPC_URL;
 if(primary&&/^https:\/\//.test(primary)){
  try{return await remote(primary,method,params)}catch{}
 }
 return remote(traceUrl,method,params);
}
async function classifyMismatches(url,snapshot,mismatches){
 const output={checked:0,parentMatches:0,blockEndMatches:0,neither:0,referenceErrors:0,items:[]};
 for(const x of mismatches.slice(0,30)){
  let method,params;
  if(x.field==='storage'){method='eth_getStorageAt';params=[x.address,x.slot]}
  else if(x.field==='nonce'){method='eth_getTransactionCount';params=[x.address]}
  else if(x.field==='balance'){method='eth_getBalance';params=[x.address]}
  else if(x.field==='code'){method='eth_getCode';params=[x.address]}
  else continue;
  const expected=x.field==='storage'?snapshot[x.address]?.storage?.[x.slot]:snapshot[x.address]?.[x.field];
  const eq=(a,b)=>{try{return x.field==='code'?String(a).toLowerCase()===String(b).toLowerCase():BigInt(a)===BigInt(b)}catch{return false}};
  const local=await rpc(method,[...params,'latest']);
  const result={address:x.address,field:x.field,...(x.slot?{slot:x.slot}:{})};
  try{
   const parent=await remote(url,method,[...params,'0x'+(52392049).toString(16)]);
   const end=await remote(url,method,[...params,'0x'+(52392050).toString(16)]);
   result.localMatchesParent=eq(local,parent);
   result.localMatchesBlockEnd=eq(local,end);
   result.traceMatchesParent=eq(expected,parent);
   result.traceMatchesBlockEnd=eq(expected,end);
   output.checked++;
   if(result.localMatchesParent)output.parentMatches++;
   if(result.localMatchesBlockEnd)output.blockEndMatches++;
   if(!result.localMatchesParent&&!result.localMatchesBlockEnd)output.neither++;
  }catch{output.referenceErrors++;result.referenceError=true}
  output.items.push(result);
 }
 return output;
}
async function feeVaultDeltas(url,snapshot){
 const vaults=[['SequencerFeeVault','0x4200000000000000000000000000000000000011'],['BaseFeeVault','0x4200000000000000000000000000000000000019']];
 const results=[];
 for(const [name,address] of vaults){
  const record={name,address};
  try{
   const before=BigInt(snapshot[address].balance);
   const local=BigInt(await rpc('eth_getBalance',[address,'latest']));
   const parent=BigInt(await remote(url,'eth_getBalance',[address,'0x31f7071']));
   const blockEnd=BigInt(await remote(url,'eth_getBalance',[address,'0x31f7072']));
   record.forkMinusPrestateWei=String(local-before);
   record.parentMinusPrestateWei=String(parent-before);
   record.blockEndMinusPrestateWei=String(blockEnd-before);
   record.localMatchesPrestate=local===before;
   record.forkCreditFromParentWei=String(local-parent);
   record.historicalCreditFromParentWei=String(before-parent);
   record.missingCreditWei=String(before-local);
  }catch{record.status='REFERENCE_UNAVAILABLE'}
  results.push(record);
 }
 return {readOnly:true,proofOfFeeAttribution:false,vaults:results};
}
async function prefixFeeEvidence(url,delta){
 const hashes=['0x1e26b4ea92a16b9bfb216c06a3d4aaf7d7ee811c11eed750be86745b34463dea',PREDECESSOR];
 const block=await remote(url,'eth_getBlockByNumber',['0x'+BLOCK.toString(16),false]);
 const baseFee=block?.baseFeePerGas?BigInt(block.baseFeePerGas):null;
 const txs=[];
 let totalPriority=0n,totalBase=0n,totalL1=0n;
 for(const hash of hashes){
  const receipt=await remote(url,'eth_getTransactionReceipt',[hash]);
  if(!receipt)throw Error('PREFIX_RECEIPT_MISSING');
  const gas=BigInt(receipt.gasUsed);
  const price=receipt.effectiveGasPrice==null?null:BigInt(receipt.effectiveGasPrice);
  const l1=receipt.l1Fee==null?null:BigInt(receipt.l1Fee);
  const priority=receipt.type!=='0x7e'&&price!==null&&baseFee!==null&&price>=baseFee?gas*(price-baseFee):null;
  // OP Stack deposit 0x7e is not a user-paid type-2 transaction.
  const base=baseFee!==null&&receipt.type!=='0x7e'?gas*baseFee:null;
  if(priority!==null)totalPriority+=priority;
  if(base!==null)totalBase+=base;
  if(l1!==null)totalL1+=l1;
  txs.push({hash,type:receipt.type,gasUsed:gas.toString(),effectiveGasPriceWei:price?.toString()??null,l1FeeWei:l1?.toString()??null,estimatedPriorityFeeWei:priority?.toString()??null,estimatedBaseFeeWei:base?.toString()??null});
 }
 const sv=delta.vaults.find(v=>v.name==='SequencerFeeVault');
 const bv=delta.vaults.find(v=>v.name==='BaseFeeVault');
 const seqGap=sv?.forkMinusPrestateWei? -BigInt(sv.forkMinusPrestateWei):null;
 const baseGap=bv?.forkMinusPrestateWei? -BigInt(bv.forkMinusPrestateWei):null;
 return {readOnly:true,blockBaseFeePerGasWei:baseFee?.toString()??null,txs,totals:{estimatedPriorityFeeWei:totalPriority.toString(),estimatedBaseFeeWei:totalBase.toString(),receiptL1FeeWei:totalL1.toString()},gaps:{sequencerWei:seqGap?.toString()??null,baseWei:baseGap?.toString()??null},comparison:{sequencerGapEqualsEstimatedPriority:seqGap!==null&&seqGap===totalPriority,baseGapEqualsEstimatedBase:baseGap!==null&&baseGap===totalBase,baseParentToPrestateEqualsEstimatedBase: bv?.parentMinusPrestateWei!=null && -BigInt(bv.parentMinusPrestateWei)===totalBase,
  baseForkCreditWei: bv?.forkCreditFromParentWei??null,
  baseHistoricalCreditWei: bv?.historicalCreditFromParentWei??null,
  baseResidualWei: bv?.missingCreditWei??null,
  baseForkCreditPlusResidualEqualsHistorical: bv?.forkCreditFromParentWei!=null&&bv?.missingCreditWei!=null&&bv?.historicalCreditFromParentWei!=null&&(BigInt(bv.forkCreditFromParentWei)+BigInt(bv.missingCreditWei)===BigInt(bv.historicalCreditFromParentWei)),sequencerParentToPrestateEqualsEstimatedPriority: sv?.parentMinusPrestateWei!=null && -BigInt(sv.parentMinusPrestateWei)===totalPriority},notes:'Fee estimates are diagnostics only; OP Stack fee routing and deposit handling require independent validation'};
}
async function diagnosticFeeVaultOverlay(snapshot){
 const vaults=['0x4200000000000000000000000000000000000011','0x4200000000000000000000000000000000000019'];
 const result={localOnly:true,originalForkVerified:false,overlayIsHistoricalReplayProof:false,applied:[],comparison:null};
 for(const address of vaults){
  const original=snapshot[address]?.balance;
  if(original===undefined)throw Error('MISSING_VAULT_TRACE_BALANCE');
  const amount=BigInt(original);
  if(amount<0n)throw Error('NEGATIVE_VAULT_BALANCE');
  await rpc('anvil_setBalance',[address,'0x'+amount.toString(16)]);
  result.applied.push(address);
 }
 result.comparison=await compare(snapshot,rpc);
 return result;
}
async function run(){
 const url=process.env.BASE_TRACE_RPC_URL||'';
 if(!/^https:\/\//.test(url)){report.reason='BASE_TRACE_RPC_URL_HTTPS_REQUIRED';return}
 let child;let ended=false;let launchError=false;
 try{
  child=spawn('anvil',['--fork-url',url,'--fork-transaction-hash',PREDECESSOR,'--host','127.0.0.1','--port',String(PORT),'--silent'],{stdio:'ignore'});
  child.on('error',()=>{launchError=true;ended=true});
  child.on('exit',()=>{ended=true});
  for(let i=0;i<45&&!ended;i++){
   await pause(1000);
   try{
    const chain=await rpc('eth_chainId');
    if(BigInt(chain)!==8453n){report.reason='LOCAL_FORK_WRONG_CHAIN';return}
    const height=await rpc('eth_blockNumber');
    const forkBlock=await rpc('eth_getBlockByNumber',[height,true]);
    const localTransactions=Array.isArray(forkBlock?.transactions)?forkBlock.transactions:[];
    report.positionEvidence={forkCheckpointHash:PREDECESSOR,localBlock:height,transactionsInLocalBlock:localTransactions.length,transactionHashes:localTransactions.slice(0,4).map(t=>typeof t==='string'?t:t.hash),targetIncluded:localTransactions.some(t=>(typeof t==='string'?t:t.hash)?.toLowerCase()===TARGET),predecessorIncluded:localTransactions.some(t=>(typeof t==='string'?t:t.hash)?.toLowerCase()===PREDECESSOR)};
    const hashes=localTransactions.map(t=>(typeof t==='string'?t:t.hash)?.toLowerCase());
    report.positionEvidence.exactPrefixOrder=hashes.length===2&&hashes[0]==='0x1e26b4ea92a16b9bfb216c06a3d4aaf7d7ee811c11eed750be86745b34463dea'&&hashes[1]===PREDECESSOR;
    if(!report.positionEvidence.exactPrefixOrder){report.status='FORK_WRONG_TRANSACTION_BOUNDARY';report.reason='FORK_PREFIX_ORDER_OR_LENGTH_MISMATCH';return}
    report.localChainId=chain;report.localBlock=height;
    report.status='FORK_STARTED_CHECKPOINT_UNVERIFIED';
    report.reason='NEED_COMPARE_TARGET_PRESTATE_STORAGE_AND_PREFIX_RECEIPTS';
    const snapshot=await remote(url,'debug_traceTransaction',[TARGET,{tracer:'prestateTracer',timeout:'10s'}]);
    report.comparison=await compare(snapshot,rpc);
    if(report.comparison.matched){
      report.status='ACCESSED_PRESTATE_FIELDS_MATCH';
      report.reason='PARTIAL_PRESTATE_MATCH_ONLY_FULL_CHECKPOINT_AND_RECEIPTS_UNVERIFIED';
    }else{
      report.status='FORK_PRESTATE_MISMATCH';
      report.reason='ANVIL_FORK_DOES_NOT_MATCH_HISTORICAL_TARGET_PRESTATE';
      try{report.mismatchOrigins=await classifyMismatches(url,snapshot,report.comparison.mismatches)}catch{report.mismatchOriginError='REFERENCE_CLASSIFICATION_FAILED'}
      report.feeVaultDeltas=await feeVaultDeltas(url,snapshot);
      try{report.prefixFeeEvidence=await prefixFeeEvidence(url,report.feeVaultDeltas)}catch(e){report.prefixFeeEvidence={status:'PREFIX_RECEIPT_FEE_DIAGNOSTIC_UNAVAILABLE',errorClass:e?.message==='REMOTE_TRACE_UNAVAILABLE'?'REMOTE_RPC_UNAVAILABLE':e?.message==='PREFIX_RECEIPT_MISSING'?'PREFIX_RECEIPT_MISSING':'FEE_EVIDENCE_CALCULATION_FAILED'}}
      if(report.comparison.mismatches.length===2 && report.comparison.mismatches.every(m=>m.field==='balance'&&['0x4200000000000000000000000000000000000011','0x4200000000000000000000000000000000000019'].includes(m.address.toLowerCase()))){
       try{report.diagnosticFeeVaultOverlay=await diagnosticFeeVaultOverlay(snapshot)}catch{report.diagnosticFeeVaultOverlay={localOnly:true,status:'OVERLAY_TEST_FAILED',originalForkVerified:false}}
       if(report.diagnosticFeeVaultOverlay?.comparison?.matched){
        try{report.localTargetSimulation=await simulate(rpc,(method,params)=>metadataRead(url,method,params))}catch{report.localTargetSimulation={status:'LOCAL_SIMULATION_FAILED',mainnetBroadcast:false,originalTxReplayed:false,receiptMatches:false}}
        if(report.localTargetSimulation?.receiptMatches){
         try{
          const diff=await remote(url,'debug_traceTransaction',[TARGET,{tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'10s'}]);
          if(!diff||!diff.post||typeof diff.post!=='object'||Object.keys(diff.post).length===0)throw Error('POST_DIFF_EMPTY');
          report.localPoststateComparison=await compare(diff.post,rpc);
          report.localPoststateComparison.historicalSource='TARGET_TRACE_DIFF_POST_ACCESSED_FIELDS';
          report.localPoststateComparison.provesCompleteReplay=false;
          if(!report.localPoststateComparison.matched)report.localPoststateMismatchDetails=await diagnose(diff.post,report.localPoststateComparison.mismatches,rpc);
         }catch{report.localPoststateComparison={status:'POSTSTATE_COMPARISON_UNAVAILABLE',provesCompleteReplay:false}}
        }
       }
      }
    }
    return;
   }catch(e){
    if(report.positionEvidence){report.status='FORK_DIAGNOSTIC_FAILED';report.reason='CHECKPOINT_TRACE_OR_COMPARISON_REQUEST_FAILED';return}
   }
  }
  report.reason=launchError?'ANVIL_UNAVAILABLE':ended?'ANVIL_FORK_STARTUP_FAILED':'ANVIL_STARTUP_TIMEOUT';
 }finally{
  if(child&&!ended)child.kill('SIGTERM');
 }
}
run().catch(()=>{report.reason='FORK_PROBE_EXCEPTION'}).finally(()=>{fs.writeFileSync('arbiflow-base-tx-fork-129113.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status!=='ACCESSED_PRESTATE_FIELDS_MATCH')process.exitCode=2});
