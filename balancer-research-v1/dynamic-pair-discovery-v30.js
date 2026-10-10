'use strict';
// V30: Flashbots MEV-Share disclosed transaction swap hints -> V12
// Uniswap V2 / SushiSwap V2 factory-verified cross-venue discovery.
// Read-only. A hint is NOT an executable transaction or profitable backrun.
const {ethers}=require('ethers');
const {listen}=require('./live-target-v20');
const {discover}=require('./verified-pairs-v12');
const {SWAP_TOPIC}=require('./bot');
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
async function investigate(events,{provider,discoverImpl=discover,maxChecks=15}={}){
 if(!provider)throw Error('ETHEREUM_PROVIDER_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const seenTransactions=new Set(),seenPools=new Set(),records=[];
 let bundleEventsExcluded=0,duplicateTransactions=0,swapHintLogs=0,verificationFailures=0;
 for(const event of events){
  if(!HASH.test(event?.hash||''))continue;
  if(Array.isArray(event.txs)&&event.txs.length){bundleEventsExcluded++;continue}
  const targetHash=event.hash.toLowerCase();
  if(seenTransactions.has(targetHash)){duplicateTransactions++;continue}
  seenTransactions.add(targetHash);
  for(const log of (Array.isArray(event.logs)?event.logs:[]).slice(0,100)){
   const pool=String(log?.address||'').toLowerCase();
   if(!ADDRESS.test(pool)||String(log?.topics?.[0]||'').toLowerCase()!==SWAP_TOPIC)continue;
   swapHintLogs++;
   if(seenPools.has(pool)||seenPools.size>=maxChecks)continue;
   seenPools.add(pool);
   try{
    const checked=await discoverImpl(provider,{address:pool,topics:[SWAP_TOPIC]});
    const identity=checked.identity,other=checked.alternative;
    const valid=checked.verifiedCrossVenuePair===true&&identity?.verified===true&&other?.found===true;
    records.push({targetHash,observedPool:pool,verifiedCrossVenuePair:valid,
     originVenue:identity?.venue||null,originFactory:identity?.factory||null,
     token0:identity?.token0||null,token1:identity?.token1||null,
     alternatePool:other?.pool||null,alternateFactory:other?.factory||null,
     alternateVenue:other?.venue||null,checkedBlock:checked.blockNumber??null,
     reason:valid?null:identity?.reason||other?.reason||checked.reason||'UNVERIFIED'});
   }catch(e){verificationFailures++;records.push({targetHash,observedPool:pool,
    verifiedCrossVenuePair:false,reason:'DISCOVERY_ERROR'});}
  }
 }
 return {eventsReceived:events.length,transactionEventsSeen:seenTransactions.size,
  bundleEventsExcluded,duplicateTransactions,swapHintLogs,
  uniquePoolsChecked:seenPools.size,verificationFailures,
  factoryVerifiedPairs:records.filter(x=>x.verifiedCrossVenuePair).length,
  observations:records};
}
async function run({provider,listenImpl=listen,discoverImpl=discover}={}){
 const feed=await listenImpl({durationMs:10000,maxEvents:80});
 const result=await investigate(feed.events,{provider,discoverImpl});
 return {build:'BALANCER_RESEARCH_V30',mode:'LIVE_MEV_SHARE_DYNAMIC_FACTORY_DISCOVERY',
  connected:feed.connected,malformedSSE:feed.malformed,...result,
  targetSignedBytesPresent:false,backrunSigned:false,simulationAttempted:false,
  mainnetBroadcast:false,bundlesSubmitted:0,profitVerified:false,executionEligible:false,
  limitations:['DISCLOSED_LOG_HINT_ONLY','VERIFICATION_AGAINST_CONFIRMED_CHAIN_STATE',
   'DYNAMIC_PAIR_IDENTIFICATION_NOT_AN_EXECUTABLE_QUOTE',
   'NO_PENDING_TRANSACTION_POST_STATE','NO_SIMULATION_OR_MAINNET_EXECUTION']};
}
module.exports={investigate,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL){console.error('V30_FAILED ETHEREUM_RPC_URL_REQUIRED');process.exitCode=1}
 else{const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  run({provider}).then(x=>console.log(JSON.stringify(x)))
   .catch(e=>{console.error('V30_FAILED',String(e.message).slice(0,160));process.exitCode=1})
   .finally(()=>provider.destroy());}
}
