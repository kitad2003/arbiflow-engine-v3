'use strict';
// Flashbots MEV-Share event stream: top-level event.hash is NOT raw tx hash.
// Never infer which transaction produced event-level logs in a multi-tx bundle.
const {listen}=require('./live-target-v20');
const {SWAP_TOPIC}=require('./bot');
const {discover}=require('./verified-pairs-v12');
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
function classify(events){
 const seen=new Set(),records=[];let duplicates=0,invalid=0;
 for(const event of events){
  if(!HASH.test(event?.hash||'')){invalid++;continue}
  const eventHash=event.hash.toLowerCase();
  if(seen.has(eventHash)){duplicates++;continue}
  seen.add(eventHash);
  const txs=Array.isArray(event.txs)?event.txs:[];
  const disclosedHashes=[...new Set(txs.map(x=>x?.hash).filter(x=>HASH.test(x||'')).map(x=>x.toLowerCase()))];
  const pools=[...new Set((Array.isArray(event.logs)?event.logs:[]).slice(0,100)
   .filter(x=>ADDR.test(x?.address||'')&&String(x?.topics?.[0]||'').toLowerCase()===SWAP_TOPIC)
   .map(x=>x.address.toLowerCase()))];
  const oneToOne=txs.length===1&&disclosedHashes.length===1;
  const kind=txs.length>1?'MULTI_TX_EVENT':txs.length===1?'SINGLE_TX_ENTRY_EVENT':'NO_TX_ENTRIES';
  records.push({eventHash,eventHashIsTarget:false,eventKind:kind,
   disclosedUnderlyingTxHashes:disclosedHashes,
   associatedSwapPools:pools,logsAttributedToSpecificTx:false,
   // Even with one disclosed tx hash, event logs do not prove execution order or profitability.
   referenceCandidate:oneToOne?disclosedHashes[0]:null,
   candidateStatus:oneToOne?'DISCLOSED_TX_REFERENCE_ONLY':'NO_UNAMBIGUOUS_TX_REFERENCE',
   simulationReady:false});
 }
 return {eventsReceived:events.length,uniqueEvents:records.length,duplicates,invalid,records};
}
async function investigate(events,{provider,discoverImpl=discover,maxPools=12}={}){
 const report=classify(events);
 const pools=[...new Set(report.records.flatMap(x=>x.associatedSwapPools))].slice(0,maxPools);
 const verified=[];
 if(provider){
  if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
  for(const pool of pools){
   try{
    const r=await discoverImpl(provider,{address:pool,topics:[SWAP_TOPIC]});
    verified.push({pool,verifiedCrossVenuePair:r.verifiedCrossVenuePair===true,
     alternativePool:r.alternative?.found?r.alternative.pool:null,
     token0:r.identity?.token0||null,token1:r.identity?.token1||null,
     reason:r.identity?.reason||r.alternative?.reason||r.reason||null});
   }catch{verified.push({pool,verifiedCrossVenuePair:false,reason:'DISCOVERY_ERROR'})}
  }
 }
 return {...report,swapPoolsDisclosed:pools.length,factoryChecks:verified,
  factoryChecksPerformed:verified.length,underlyingTxReferencesDisclosed:report.records.reduce((n,x)=>n+x.disclosedUnderlyingTxHashes.length,0),
  eventHashesPromotedToTxTargets:0,simulationReadyCandidates:0};
}
async function run({provider,listenImpl=listen,discoverImpl=discover}={}){
 const feed=await listenImpl({durationMs:30000,maxEvents:200});
 const result=await investigate(feed.events,{provider,discoverImpl});
 return {build:'BALANCER_RESEARCH_V32',mode:'MEV_SHARE_EVENT_HASH_SAFE_CLASSIFICATION',
  connected:feed.connected,malformedSSE:feed.malformed,...result,
  signingPerformed:false,simulationAttempted:false,bundlesSubmitted:0,
  mainnetBroadcast:false,profitVerified:false,executionEligible:false,
  limitations:['EVENT_HASH_NEVER_RAW_TX_TARGET','EVENT_LOGS_NOT_ATTRIBUTED_TO_INDIVIDUAL_BUNDLE_TX',
   'FACTORY_VERIFICATION_USES_CONFIRMED_STATE','NO_PROFIT_OR_ORDERING_SIMULATION']};
}
module.exports={classify,investigate,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)console.log(JSON.stringify({build:'BALANCER_RESEARCH_V32',status:'BLOCKED',reason:'ETHEREUM_RPC_URL_REQUIRED'}));
 else{const {ethers}=require('ethers');const p=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  run({provider:p}).then(x=>console.log(JSON.stringify(x)))
  .catch(e=>{console.error('V32_FAILED',String(e.message).slice(0,180));process.exitCode=1})
  .finally(()=>p.destroy());}
}
