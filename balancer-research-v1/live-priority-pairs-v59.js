'use strict';
// V59: independent bounded sampling and unique cross-venue pair identities.
// Flashbots MEV-Share: a private hash may be valid without public RPC visibility.
const {ethers}=require('ethers');
const {run:monitor}=require('./persistent-monitor-v34');
const {investigate}=require('./live-target-matching-v58');
const ADDRESS=/^0x[0-9a-f]{40}$/i;
function pairKey(p){
 if(!p?.verified||!p.crossVenueVerified||!ADDRESS.test(p.token0||'')||!ADDRESS.test(p.token1||'')||!ADDRESS.test(p.pool||'')||!ADDRESS.test(p.alternativePool||''))return null;
 const tokens=[p.token0.toLowerCase(),p.token1.toLowerCase()].sort();
 const pools=[p.pool.toLowerCase(),p.alternativePool.toLowerCase()].sort();
 return tokens.join(':')+'|'+pools.join(':');
}
function collector({pendingLimit=12,bundleLimit=12}={}){
 const pending=[],bundles=[],counts={pendingEvents:0,bundleEvents:0,pendingSwapHints:0,bundleSwapHints:0,pendingSamplesDropped:0,bundleSamplesDropped:0};
 function observe(e){
  if(e.kind==='PENDING_TRANSACTION'){counts.pendingEvents++;if(!e.swapPools?.length)return;counts.pendingSwapHints++;if(pending.length<pendingLimit)pending.push(e);else counts.pendingSamplesDropped++}
  else if(e.kind==='BUNDLE'){counts.bundleEvents++;if(!e.swapPools?.length)return;counts.bundleSwapHints++;if(bundles.length<bundleLimit)bundles.push(e);else counts.bundleSamplesDropped++}
 }
 return {observe,pending,bundles,counts};
}
async function run({provider,monitorImpl=monitor,runtimeMs=60000,pendingLimit=12,bundleLimit=12,investigateImpl=investigate}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const samples=collector({pendingLimit,bundleLimit});
 const monitorStats=await monitorImpl({runtimeMs,onEvent:samples.observe});
 const stats={build:'BALANCER_RESEARCH_V59',mode:'PRIORITIZED_LIVE_REFERENCE_AND_UNIQUE_PAIR_AUDIT',
  ...samples.counts,selectedPending:samples.pending.length,selectedBundles:samples.bundles.length,
  attemptedPublicTxLookups:0,publicTxResolved:0,publicTxNotFound:0,publicTxErrors:0,
  verifiedPoolObservations:0,crossVenueObservations:0,uniqueCrossVenuePairs:[],
  pendingExamples:[],bundleExamples:[],investigationErrors:0,monitor:monitorStats,
  targetFirstSimulationAttempted:false,netProfitVerified:false,bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 const unique=new Map();
 // Prioritize pending hinted transactions independently from bundles.
 for(const [kind,events] of [['pending',samples.pending],['bundle',samples.bundles]]){
  for(const event of events){
   try{
    const row=await investigateImpl(provider,event);
    if(kind==='pending'){
     stats.attemptedPublicTxLookups++;
     if(row.publicTxStatus==='PUBLIC_RPC_TRANSACTION_RESOLVED')stats.publicTxResolved++;
     else if(row.publicTxStatus==='NOT_FOUND_ON_PUBLIC_RPC_PRIVATE_POSSIBLE')stats.publicTxNotFound++;
     else if(row.publicTxStatus==='PUBLIC_RPC_LOOKUP_ERROR')stats.publicTxErrors++;
    }
    for(const p of row.pools||[]){
     if(p.verified)stats.verifiedPoolObservations++;
     const key=pairKey(p);
     if(key){stats.crossVenueObservations++;if(!unique.has(key))unique.set(key,{token0:p.token0,token1:p.token1,triggerPool:p.pool,alternativePool:p.alternativePool,venue:p.venue,firstSeenKind:kind})}
    }
    const dest=kind==='pending'?stats.pendingExamples:stats.bundleExamples;
    dest.push(row);
   }catch(e){stats.investigationErrors++;const dest=kind==='pending'?stats.pendingExamples:stats.bundleExamples;dest.push({kind:event.kind,eventHash:event.eventHash,status:'INVESTIGATION_ERROR',reason:String(e.message||e).slice(0,100)})}
  }
 }
 stats.uniqueCrossVenuePairs=[...unique.values()];
 stats.uniqueCrossVenuePairCount=unique.size;
 stats.limitations=['SAMPLES_ARE_BOUNDED_AND_NOT_ALL_LIVE_EVENTS','PRIVATE_HASH_RPC_MISS_DOES_NOT_INVALIDATE_MEV_SHARE_REFERENCE','PAIR_IDENTITY_NOT_POST_TARGET_STATE','NO_EXECUTION_OR_SIMULATION'];
 return stats;
}
module.exports={pairKey,collector,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('V59_FAILED',String(e.message).slice(0,180));process.exitCode=1}).finally(()=>provider.destroy());
}
