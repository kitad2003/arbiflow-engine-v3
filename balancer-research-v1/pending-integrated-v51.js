'use strict';
// V51 bounded integration with the existing V34 MEV-Share stream.
const {ethers}=require('ethers');
const {run:monitor}=require('./persistent-monitor-v34');
const {VerifiedPoolCache,inspect}=require('./dynamic-pair-cache-v51');
async function run({provider,monitorImpl=monitor,cache=new VerifiedPoolCache(),runtimeMs=60000,maxEvents=30}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const stats={build:'BALANCER_RESEARCH_V51',mode:'MEV_SHARE_DYNAMIC_PAIR_DISCOVERY',
  pendingEvents:0,bundlesExcluded:0,eventsInspected:0,eventsSkipped:0,
  verifiedCrossVenuePairs:0,examples:[],errors:0,simulationAttempted:false,
  alerts:[],executionEligible:false,bundlesSubmitted:0,mainnetBroadcast:false,
  limitations:['MEV_SHARE_EVENTS_ARE_PARTIAL_DISCLOSURES',
   'VERIFIED_POOL_IDENTITIES_ARE_NOT_PROFITABLE_QUOTES',
   'NO_TARGET_FIRST_SIMULATION','NO_NET_PROFIT_VERIFICATION']};
 stats.monitor=await monitorImpl({runtimeMs,onEvent:async event=>{
  if(event?.kind!=='PENDING_TRANSACTION'){stats.bundlesExcluded++;return}
  stats.pendingEvents++;
  if(stats.eventsInspected>=maxEvents){stats.eventsSkipped++;return}
  stats.eventsInspected++;
  try{
   const result=await inspect(event,{provider,cache});
   stats.verifiedCrossVenuePairs+=result.pairs.length;
   if(stats.examples.length<8)stats.examples.push({pendingHash:result.pendingHash,
    pairs:result.pairs,skipped:result.skipped});
  }catch{stats.errors++}
 }});
 return stats;
}
module.exports={run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider,runtimeMs:Number(process.env.V51_DURATION_MS||60000)})
 .then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V51_FAILED',String(e.message).slice(0,180));process.exitCode=1})
 .finally(()=>provider.destroy());
}
