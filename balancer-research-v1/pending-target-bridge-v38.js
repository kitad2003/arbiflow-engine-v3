'use strict';
// V38: live MEV-Share pending transaction references -> documented hash-first
// mev_simBundle envelope diagnostics. Fail closed; no signing or RPC send.
const {run:monitor}=require('./persistent-monitor-v34');
const {prepare}=require('./mev-envelope-v28');
function inspect(event,input={}){
 const base={targetHash:event?.pendingHash||null,kind:event?.kind||null,
  disclosedPools:event?.swapPools||[],targetBytesRequired:false,
  hashReferenceAllowedByRpcSchema:true,simulationAttempted:false,
  mainnetBroadcast:false,bundlesSubmitted:0,executionEligible:false};
 if(event?.kind!=='PENDING_TRANSACTION'||!/^0x[0-9a-f]{64}$/i.test(event.pendingHash||''))
  return {...base,status:'REJECTED',reason:'INDIVIDUAL_PENDING_TRANSACTION_HASH_REQUIRED'};
 if(!event.swapPools?.length)return {...base,status:'REJECTED',reason:'NO_DISCLOSED_SWAP_POOL'};
 if(!input.backrunSignedTx)return {...base,status:'BLOCKED',reason:'SIGNED_COMPATIBLE_BACKRUN_REQUIRED',
  next:'Use signed, deployed-contract compatible backrun bytes; never invent or sign automatically'};
 const prepared=prepare({...input,targetKind:'TRANSACTION',targetHash:event.pendingHash});
 if(!prepared.ready)return {...base,status:'BLOCKED',reason:prepared.reason};
 if(prepared.backrunHash.toLowerCase()===event.pendingHash.toLowerCase())
  return {...base,status:'REJECTED',reason:'TARGET_EQUALS_BACKRUN'};
 return {...base,status:'HASH_TARGET_FIRST_ENVELOPE_READY_NOT_SIMULATED',
  targetFirst:true,bodyKinds:['hash','tx'],version:'beta-1',
  backrunHash:prepared.backrunHash,simulationEndpoint:prepared.endpoint,
  simulationMethod:prepared.method,
  // do not print private signed transaction data
  caution:'Hash-reference request is valid per API schema; matching/acceptance is unproven'};
}
async function run({monitorImpl=monitor,runtimeMs=240000,inputs={}}={}){
 const stats={build:'BALANCER_RESEARCH_V38',mode:'LIVE_PENDING_HASH_TO_SIMULATION_PREREQUISITES',
  pendingWithSwapHint:0,bundleSwapHintsExcluded:0,matchedHashEnvelopeReady:0,
  blockedMissingSignedBackrun:0,blockedOther:0,examples:[],
  simulationAttempted:false,mainnetBroadcast:false,bundlesSubmitted:0,executionEligible:false};
 const observed=new Set();
 const feed=await monitorImpl({runtimeMs,onEvent:async event=>{
  if(!event.swapPools?.length)return;
  if(event.kind!=='PENDING_TRANSACTION'){stats.bundleSwapHintsExcluded++;return}
  if(observed.has(event.pendingHash))return;
  observed.add(event.pendingHash);stats.pendingWithSwapHint++;
  const result=inspect(event,inputs);
  if(result.status==='HASH_TARGET_FIRST_ENVELOPE_READY_NOT_SIMULATED')stats.matchedHashEnvelopeReady++;
  else if(result.reason==='SIGNED_COMPATIBLE_BACKRUN_REQUIRED')stats.blockedMissingSignedBackrun++;
  else stats.blockedOther++;
  if(stats.examples.length<10)stats.examples.push({
   targetHash:result.targetHash,disclosedPools:result.disclosedPools,
   status:result.status,reason:result.reason||null});
 }});
 return {...stats,monitor:feed,notes:[
  'Flashbots MEV-Share mev_simBundle beta-1 supports hash target references',
  'Target hash is not signed bytes and does not guarantee relay matching',
  'Real simulation still needs compatible signed backrun and valid future inclusion block',
  'No RPC simulation performed; no signing, no bundle send']};
}
module.exports={inspect,run};
if(require.main===module)run().then(x=>console.log(JSON.stringify(x)))
.catch(e=>{console.error('V38_FAILED',String(e.message).slice(0,150));process.exitCode=1});
