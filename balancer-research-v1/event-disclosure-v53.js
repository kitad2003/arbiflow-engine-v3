'use strict';
// Research stage 1: classify disclosures before any route or execution analysis.
const {classify}=require('./persistent-monitor-v34');
const ADDRESS=/^0x[0-9a-f]{40}$/i;
function createDiagnostics({resolvePool}={}){
 const totals={build:'BALANCER_RESEARCH_V53',mode:'READ_ONLY_DISCLOSURE_DIAGNOSTICS',
  pendingEvents:0,bundleEvents:0,pendingWithSwapHints:0,bundlesWithSwapHints:0,
  uniqueDisclosedPools:0,pendingPoolAddresses:0,bundlePoolAddresses:0,
  verificationAttempts:0,verifiedPairs:0,rejectedPools:0,verificationErrors:0,
  cacheHits:0,cacheMisses:0,rejectionReasons:{},examples:[],
  simulationAttempted:false,netProfitVerified:false,bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 const seen=new Set();
 async function observe(event){
  const bundle=event.kind==='BUNDLE';if(bundle)totals.bundleEvents++;else totals.pendingEvents++;
  const pools=[...new Set((event.swapPools||[]).filter(p=>ADDRESS.test(p)).map(p=>p.toLowerCase()))];
  if(pools.length){if(bundle)totals.bundlesWithSwapHints++;else totals.pendingWithSwapHints++}
  if(bundle)totals.bundlePoolAddresses+=pools.length;else totals.pendingPoolAddresses+=pools.length;
  for(const pool of pools)seen.add(pool);
  totals.uniqueDisclosedPools=seen.size;
  // Bundle hints are counted but NEVER treated as standalone pending transactions.
  if(bundle||!resolvePool)return;
  for(const pool of pools){
   totals.verificationAttempts++;
   try{
    const row=await resolvePool(pool);
    if(row.cacheHit)totals.cacheHits++;else totals.cacheMisses++;
    if(row.verified)totals.verifiedPairs++;else{
     totals.rejectedPools++;const reason=row.reason||'UNSPECIFIED';
     totals.rejectionReasons[reason]=(totals.rejectionReasons[reason]||0)+1;
    }
   }catch(e){totals.verificationErrors++;const reason='VERIFICATION_ERROR';
    totals.rejectionReasons[reason]=(totals.rejectionReasons[reason]||0)+1}
  }
  if(totals.examples.length<8)totals.examples.push({kind:event.kind,swapPoolCount:pools.length});
 }
 return {observe,snapshot:()=>({...totals})};
}
module.exports={createDiagnostics,classify};
