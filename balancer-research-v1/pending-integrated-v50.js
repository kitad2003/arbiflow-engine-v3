'use strict';
// V50: bounded MEV-Share monitoring connected to verified confirmed-state
// reserve prefilter. No signed transactions, simulation calls or bundle sends.
const {ethers}=require('ethers');
const {run:monitor}=require('./persistent-monitor-v34');
const {evaluate}=require('./pending-gross-gate-v35');
const HASH=/^0x[0-9a-f]{64}$/i;
async function run({provider,monitorImpl=monitor,evaluateImpl=evaluate,runtimeMs=60000,maxEvaluations=30}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 const net=await provider.getNetwork();
 if(net.chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const stats={build:'BALANCER_RESEARCH_V50',mode:'MEV_SHARE_PENDING_TO_READ_ONLY_CONFIRMED_RESERVE_GATE',
  chainId:1,streamConnected:false,pendingEvents:0,bundleEventsExcluded:0,
  pendingSwapHints:0,uniqueTargetsEvaluated:0,duplicateTargets:0,
  verifiedQuotes:0,v26CompatibleGrossPositive:0,nonPositiveOrIncompatible:0,
  screenedOut:0,evaluationErrors:0,examples:[],simulationAttempted:false,
  transactionSigned:false,mainnetBroadcast:false,bundlesSubmitted:0,executionEligible:false,
  alertCount:0,limitations:[
   'SSE event delivery is not global Ethereum mempool coverage',
   'Only disclosed MEV-Share swap hints are inspected',
   'Confirmed block reserves do not incorporate the pending target transaction',
   'Gross quotes omit flash loan fees, gas, builder fees and relay inclusion effects',
   'No target-first MEV-Share simulation or signed backrun is available',
   'No profitable opportunity is certified and no dashboard alerts are issued'
  ]};
 const seen=new Set();
 const feed=await monitorImpl({runtimeMs,onEvent:async e=>{
  if(e?.kind!=='PENDING_TRANSACTION'){stats.bundleEventsExcluded++;return}
  stats.pendingEvents++;
  if(!HASH.test(e.pendingHash||'')||!e.swapPools?.length)return;
  stats.pendingSwapHints++;
  if(seen.has(e.pendingHash)){stats.duplicateTargets++;return}
  seen.add(e.pendingHash);
  if(stats.uniqueTargetsEvaluated>=maxEvaluations){stats.screenedOut++;return}
  stats.uniqueTargetsEvaluated++;
  let result;
  try{result=await evaluateImpl(e,{provider})}catch(err){stats.evaluationErrors++;return}
  if(result?.state==='CONFIRMED_RESERVE_QUOTE_ONLY')stats.verifiedQuotes++;
  else stats.nonPositiveOrIncompatible++;
  if(result?.v26TokenCompatible&&result?.bestGrossQuote?.grossPositive){
   // This is only a research prefilter, never an execution or dashboard signal.
   stats.v26CompatibleGrossPositive++;
  }
  if(stats.examples.length<8)stats.examples.push({hash:e.pendingHash,
   reason:result?.reason||'UNKNOWN',state:result?.state||'REJECTED',
   grossPositive:!!result?.bestGrossQuote?.grossPositive,
   v26TokenCompatible:!!result?.v26TokenCompatible,
   candidateForRealSimulation:false,netProfitVerified:false});
 }});
 stats.monitor=feed;
 stats.streamConnected=(feed?.connectedSessions||0)>0;
 return stats;
}
module.exports={run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider:p,runtimeMs:Number(process.env.V50_DURATION_MS||60000)})
  .then(s=>console.log(JSON.stringify(s))).catch(e=>{console.error('V50_FAILED',String(e.message).slice(0,180));process.exitCode=1})
  .finally(()=>p.destroy());
}