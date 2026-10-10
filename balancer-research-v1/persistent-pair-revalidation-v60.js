'use strict';
// V60 historical discovery seed + live V59 discoveries, current-state pool/quote re-verification.
// No target-first state reconstruction; no flash loans or bundle submission.
const {ethers}=require('ethers');
const seed=require('./historical-pair-seed-v60.json');
const {run:liveRun}=require('./live-priority-pairs-v59');
const {evaluate}=require('./liquidity-quotes-v55');
const ADDR=/^0x[0-9a-f]{40}$/i;
function key(a,b){if(!ADDR.test(a||'')||!ADDR.test(b||''))return null;return [a.toLowerCase(),b.toLowerCase()].sort().join('|')}
function merge(historical,live){
 const m=new Map();
 function add(a,b,source){const k=key(a,b);if(!k)return;const old=m.get(k);if(old){if(!old.sources.includes(source))old.sources.push(source)}else m.set(k,{poolA:a,poolB:b,sources:[source]})}
 for(const p of historical)add(p.a,p.b,p.source||'HISTORICAL');
 for(const p of live)add(p.triggerPool,p.alternativePool,'LIVE_V59');
 return [...m.values()];
}
async function run({provider,liveImpl=liveRun,evaluateImpl=evaluate,seedPairs=seed.pairs,runtimeMs=60000,maxPairs=20}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const live=await liveImpl({provider,runtimeMs});
 const pairs=merge(seedPairs,live.uniqueCrossVenuePairs||[]);
 const out={build:'BALANCER_RESEARCH_V60',mode:'HISTORICAL_PLUS_LIVE_PAIR_REVALIDATION',
  historicalSeedPairs:seedPairs.length,liveUniquePairs:live.uniqueCrossVenuePairCount||0,
  deduplicatedCandidatePairs:pairs.length,checkedPairs:0,confirmedPairs:0,failedPairs:0,
  positiveGrossScenarios:0,results:[],liveSummary:{
   pendingEvents:live.pendingEvents,bundleEvents:live.bundleEvents,
   pendingSwapHints:live.pendingSwapHints,bundleSwapHints:live.bundleSwapHints,
   selectedPending:live.selectedPending,selectedBundles:live.selectedBundles},
  targetFirstSimulationAttempted:false,netProfitVerified:false,bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 for(const p of pairs.slice(0,maxPairs)){
  out.checkedPairs++;
  try{
   const q=await evaluateImpl(provider,p.poolA,p.poolB);
   out.confirmedPairs++;out.positiveGrossScenarios+=q.positiveGrossCount;
   out.results.push({poolA:p.poolA,poolB:p.poolB,sources:p.sources,status:'CURRENT_BLOCK_IDENTITY_AND_RESERVES_VERIFIED',
    blockNumber:q.blockNumber,token0:q.token0,token1:q.token1,
    reserveA:q.reserves.poolA,reserveB:q.reserves.poolB,
    scenarios:q.quotes.length,positiveGrossCount:q.positiveGrossCount,
    bestGross:q.quotes.filter(x=>x.positiveGross).sort((a,b)=>BigInt(a.grossDeltaRaw)>BigInt(b.grossDeltaRaw)?-1:1)[0]||null,
    targetFirstSimulation:false,netProfitVerified:false});
  }catch(e){out.failedPairs++;out.results.push({poolA:p.poolA,poolB:p.poolB,sources:p.sources,status:'CURRENT_REVALIDATION_FAILED',reason:String(e.message||e).slice(0,130)})}
 }
 out.uncheckedBeyondLimit=Math.max(0,pairs.length-maxPairs);
 out.limitations=['HISTORICAL_SEED_IS_NOT_PERSISTENT_AUTOMATIC_LIVE_STORAGE',
 'CONFIRMED_BLOCK_QUOTES_ARE_NOT_TARGET_FIRST_QUOTES','GROSS_DELTA_OMITS_GAS_FLASH_LOAN_FEES_AND_BUILDER_BIDS',
 'POSITIVE_GROSS_IS_NOT_EXECUTION_ELIGIBILITY'];
 return out;
}
module.exports={key,merge,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('V60_FAILED',String(e.message).slice(0,180));process.exitCode=1}).finally(()=>provider.destroy());
}
