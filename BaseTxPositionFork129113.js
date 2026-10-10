'use strict';
// Read-only Anvil transaction-position fork startup probe. No signing or broadcasting.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const {compare}=require('./BaseForkCompare129115');
const TARGET='0x4b0dd34e742962465cb72493861b640356c970a7b45ee8ce4d3784359ab1341e';
const PREDECESSOR='0xb86187ffee731a987660d6a9b7e1d7046a9a5282e8d1d6658295af2e9967063c';
const PORT=18545;
const BLOCK=52392050;
const TARGET_INDEX=2;
const report={build:'12.9.119',mode:'BASE_TRANSACTION_POSITION_FORK_PROBE',block:52392050,targetIndex:2,targetHash:TARGET,readOnly:true,mainnetBroadcast:false,preTransactionStateReconstructed:false,receiptMatches:0,executionEligible:false,status:'BLOCKED',reason:'NOT_STARTED'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(method,params=[]){
 const response=await fetch('http://127.0.0.1:'+PORT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(2000)});
 const body=await response.json();if(body.error)throw Error('LOCAL_RPC_ERROR_'+body.error.code);return body.result;
}
async function remote(url,method,params){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(30000)});const value=await response.json();if(!response.ok||value.error)throw Error('REMOTE_TRACE_UNAVAILABLE');return value.result}
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
    if(report.positionEvidence.targetIncluded||!report.positionEvidence.predecessorIncluded){report.status='FORK_WRONG_TRANSACTION_BOUNDARY';report.reason='TARGET_INCLUDED_OR_PREDECESSOR_MISSING';return}
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
    }
    return;
   }catch{}
  }
  report.reason=launchError?'ANVIL_UNAVAILABLE':ended?'ANVIL_FORK_STARTUP_FAILED':'ANVIL_STARTUP_TIMEOUT';
 }finally{
  if(child&&!ended)child.kill('SIGTERM');
 }
}
run().catch(()=>{report.reason='FORK_PROBE_EXCEPTION'}).finally(()=>{fs.writeFileSync('arbiflow-base-tx-fork-129113.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status!=='ACCESSED_PRESTATE_FIELDS_MATCH')process.exitCode=2});
