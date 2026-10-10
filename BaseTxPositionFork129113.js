'use strict';
// Read-only Anvil transaction-position fork startup probe. No signing or broadcasting.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const TARGET='0x4b0dd34e742962465cb72493861b640356c970a7b45ee8ce4d3784359ab1341e';
const PORT=18545;
const report={build:'12.9.113',mode:'BASE_TRANSACTION_POSITION_FORK_PROBE',block:52392050,targetIndex:2,targetHash:TARGET,readOnly:true,mainnetBroadcast:false,preTransactionStateReconstructed:false,receiptMatches:0,executionEligible:false,status:'BLOCKED',reason:'NOT_STARTED'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(method,params=[]){
 const response=await fetch('http://127.0.0.1:'+PORT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(2000)});
 const body=await response.json();if(body.error)throw Error('LOCAL_RPC_ERROR_'+body.error.code);return body.result;
}
async function run(){
 const url=process.env.BASE_TRACE_RPC_URL||'';
 if(!/^https:\/\//.test(url)){report.reason='BASE_TRACE_RPC_URL_HTTPS_REQUIRED';return}
 let child;let ended=false;let launchError=false;
 try{
  child=spawn('anvil',['--fork-url',url,'--fork-transaction-hash',TARGET,'--host','127.0.0.1','--port',String(PORT),'--silent'],{stdio:'ignore'});
  child.on('error',()=>{launchError=true;ended=true});
  child.on('exit',()=>{ended=true});
  for(let i=0;i<45&&!ended;i++){
   await pause(1000);
   try{
    const chain=await rpc('eth_chainId');
    if(BigInt(chain)!==8453n){report.reason='LOCAL_FORK_WRONG_CHAIN';return}
    const height=await rpc('eth_blockNumber');
    report.localChainId=chain;report.localBlock=height;
    report.status='FORK_STARTED_CHECKPOINT_UNVERIFIED';
    report.reason='NEED_COMPARE_TARGET_PRESTATE_STORAGE_AND_PREFIX_RECEIPTS';
    return;
   }catch{}
  }
  report.reason=launchError?'ANVIL_UNAVAILABLE':ended?'ANVIL_FORK_STARTUP_FAILED':'ANVIL_STARTUP_TIMEOUT';
 }finally{
  if(child&&!ended)child.kill('SIGTERM');
 }
}
run().catch(()=>{report.reason='FORK_PROBE_EXCEPTION'}).finally(()=>{fs.writeFileSync('arbiflow-base-tx-fork-129113.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status!=='FORK_STARTED_CHECKPOINT_UNVERIFIED')process.exitCode=2});
