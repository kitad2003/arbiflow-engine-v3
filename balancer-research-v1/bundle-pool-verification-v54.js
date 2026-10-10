'use strict';
// Research stage: verify pool identities from disclosed bundle swap hints.
// A bundle disclosure is NOT a standalone pending transaction or executable target.
const {VerifiedPoolCache}=require('./dynamic-pair-cache-v51');
const {run:monitor}=require('./persistent-monitor-v34');
const ADDRESS=/^0x[0-9a-f]{40}$/i;
async function run({provider,monitorImpl=monitor,cache=new VerifiedPoolCache(),runtimeMs=60000,maxUniquePools=30}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const seen=new Set(),stats={build:'BALANCER_RESEARCH_V54',mode:'BUNDLE_DISCLOSED_POOL_IDENTITY_RESEARCH',
  pendingEvents:0,bundleEvents:0,pendingWithSwapHints:0,bundlesWithSwapHints:0,
  uniqueBundlePools:0,verificationAttempts:0,verifiedCrossVenuePairs:0,
  rejectedPools:0,verificationErrors:0,cacheHits:0,cacheMisses:0,
  rejectedReasons:{},verifiedExamples:[],rejectedExamples:[],
  bundleHashesTreatedAsTransactions:0,simulationAttempted:false,netProfitVerified:false,
  bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 stats.monitor=await monitorImpl({runtimeMs,onEvent:async event=>{
  const bundle=event?.kind==='BUNDLE';if(bundle)stats.bundleEvents++;else stats.pendingEvents++;
  const pools=[...new Set((event?.swapPools||[]).filter(x=>ADDRESS.test(x)).map(x=>x.toLowerCase()))];
  if(!bundle){if(pools.length)stats.pendingWithSwapHints++;return}
  if(pools.length)stats.bundlesWithSwapHints++;
  for(const pool of pools){
   if(seen.has(pool))continue;
   seen.add(pool);stats.uniqueBundlePools=seen.size;
   if(stats.verificationAttempts>=maxUniquePools)continue;
   stats.verificationAttempts++;
   try{
    const result=await cache.resolve(provider,pool);
    if(result.cacheHit)stats.cacheHits++;else stats.cacheMisses++;
    if(result.verified){
     stats.verifiedCrossVenuePairs++;
     if(stats.verifiedExamples.length<12)stats.verifiedExamples.push({pool,trigger:result.trigger,alternative:result.alternative,blockNumber:result.blockNumber});
    }else{
     stats.rejectedPools++;const reason=result.reason||'UNSPECIFIED';
     stats.rejectedReasons[reason]=(stats.rejectedReasons[reason]||0)+1;
     if(stats.rejectedExamples.length<12)stats.rejectedExamples.push({pool,reason});
    }
   }catch(e){
    stats.verificationErrors++;
    const reason='VERIFICATION_ERROR';
    stats.rejectedReasons[reason]=(stats.rejectedReasons[reason]||0)+1;
    if(stats.rejectedExamples.length<12)stats.rejectedExamples.push({pool,reason});
   }
  }
 }});
 return {...stats,limitations:['BUNDLE_DISCLOSURES_ONLY_FOR_POOL_IDENTITY','V2_VENUES_ONLY','POOL_IDENTITY_DOES_NOT_PROVE_LIQUIDITY','NO_TARGET_FIRST_SIMULATION','NO_EXECUTION']};
}
module.exports={run};
if(require.main===module){
 const {ethers}=require('ethers');
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider}).then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V54_FAILED',String(e.message).slice(0,180));process.exitCode=1})
 .finally(()=>provider.destroy());
}
