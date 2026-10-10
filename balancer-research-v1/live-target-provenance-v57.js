'use strict';
// V57: live MEV-Share event-hash provenance and disclosure audit.
// Per Flashbots bundle spec, event.hash can identify a transaction OR a bundle.
// No RPC send, no simulation, no signed transactions.
const {run:monitor}=require('./persistent-monitor-v34');
const HASH=/^0x[0-9a-f]{64}$/i;
function audit(event){
 const kind=event?.kind==='BUNDLE'?'BUNDLE':event?.kind==='PENDING_TRANSACTION'?'PENDING_TRANSACTION':'UNKNOWN';
 const eventHash=HASH.test(event?.eventHash||'')?event.eventHash.toLowerCase():null;
 const pendingHash=kind==='PENDING_TRANSACTION'&&HASH.test(event?.pendingHash||'')?event.pendingHash.toLowerCase():null;
 const disclosedBundleTxHashes=kind==='BUNDLE'?[...new Set((event?.disclosedBundleTxHashes||[]).filter(x=>HASH.test(x)).map(x=>x.toLowerCase()))]:[];
 const pools=[...new Set((event?.swapPools||[]).filter(x=>/^0x[0-9a-f]{40}$/i.test(x)).map(x=>x.toLowerCase()))];
 const blockers=[];
 if(!eventHash)blockers.push('EVENT_HASH_MISSING');
 if(kind==='UNKNOWN')blockers.push('EVENT_KIND_UNKNOWN');
 if(kind==='BUNDLE'&&!disclosedBundleTxHashes.length)blockers.push('BUNDLE_CONSTITUENT_TX_HASH_NOT_DISCLOSED');
 if(kind==='PENDING_TRANSACTION'&&!pendingHash)blockers.push('PENDING_TX_HASH_MISSING');
 blockers.push('TARGET_POST_STATE_NOT_RECONSTRUCTED','SIGNED_BACKRUN_NOT_VERIFIED');
 return {kind,eventHash,pendingHash,disclosedBundleTxHashes,swapPools:pools,
  targetReferenceAvailable:!!(pendingHash||(kind==='BUNDLE'&&eventHash)),
  targetReferenceType:pendingHash?'TRANSACTION_HASH':kind==='BUNDLE'&&eventHash?'BUNDLE_HASH':null,
  matchVerified:false,targetFirstSimulationAttempted:false,blockers};
}
async function run({monitorImpl=monitor,runtimeMs=60000,maxExamples=12}={}){
 const stats={build:'BALANCER_RESEARCH_V57',mode:'LIVE_EVENT_HASH_PROVENANCE_AUDIT',
  pendingEvents:0,bundleEvents:0,pendingWithSwapHints:0,bundlesWithSwapHints:0,
  pendingHashes:0,bundleHashes:0,disclosedBundleConstituentHashes:0,
  examples:[],targetFirstSimulationAttempted:false,netProfitVerified:false,
  bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 stats.monitor=await monitorImpl({runtimeMs,onEvent:event=>{
  const row=audit(event);
  if(row.kind==='BUNDLE'){stats.bundleEvents++;if(row.eventHash)stats.bundleHashes++;if(row.swapPools.length)stats.bundlesWithSwapHints++;stats.disclosedBundleConstituentHashes+=row.disclosedBundleTxHashes.length}
  else if(row.kind==='PENDING_TRANSACTION'){stats.pendingEvents++;if(row.pendingHash)stats.pendingHashes++;if(row.swapPools.length)stats.pendingWithSwapHints++}
  if(stats.examples.length<maxExamples&&(row.swapPools.length||row.kind==='PENDING_TRANSACTION'))stats.examples.push(row);
 }});
 return {...stats,limitations:['BUNDLE_HASH_IS_NOT_A_STANDALONE_TRANSACTION_HASH','HASH_REFERENCE_DOES_NOT_PROVE_TARGET_MATCHING','NO_POST_TARGET_STATE_OR_BACKRUN_SIMULATION']};
}
module.exports={audit,run};
if(require.main===module){
 const runtimeMs=Number(process.env.V57_DURATION_MS||60000);
 if(!Number.isSafeInteger(runtimeMs)||runtimeMs<1000||runtimeMs>180000)throw Error('INVALID_DURATION');
 run({runtimeMs}).then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V57_FAILED',String(e.message).slice(0,180));process.exitCode=1});
}
