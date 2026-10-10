'use strict';
// V58: research-only live target reference investigation. No relay submission.
// MEV-Share private transaction hashes may not resolve on a public Ethereum RPC.
const {ethers}=require('ethers');
const {run:monitor}=require('./persistent-monitor-v34');
const {identifyPair,alternative}=require('./verified-pairs-v12');
const HASH=/^0x[0-9a-f]{64}$/i;
async function investigate(provider,event,{lookup=async hash=>provider.getTransaction(hash),verify=async(pool,block)=>identifyPair(provider,pool,block)}={}){
 const kind=event?.kind;
 const hash=HASH.test(event?.eventHash||'')?event.eventHash:null;
 const pools=[...new Set((event?.swapPools||[]).filter(p=>/^0x[0-9a-f]{40}$/i.test(p)).map(p=>p.toLowerCase()))];
 const result={kind,eventHash:hash,pendingHash:kind==='PENDING_TRANSACTION'?event.pendingHash:null,
  disclosedPoolCount:pools.length,pools:[],publicTxStatus:'NOT_APPLICABLE',
  publicTxMatch:false,targetFirstSimulationAttempted:false,postTargetStateVerified:false,
  netProfitVerified:false,executionEligible:false};
 if(kind==='PENDING_TRANSACTION'&&HASH.test(event.pendingHash||'')){
  try{
   const tx=await lookup(event.pendingHash);
   result.publicTxStatus=tx?'PUBLIC_RPC_TRANSACTION_RESOLVED':'NOT_FOUND_ON_PUBLIC_RPC_PRIVATE_POSSIBLE';
   result.publicTxMatch=!!tx&&tx.hash.toLowerCase()===event.pendingHash.toLowerCase();
   if(tx){result.publicTxBlockNumber=tx.blockNumber??null;result.publicTxTo=tx.to??null}
  }catch(e){result.publicTxStatus='PUBLIC_RPC_LOOKUP_ERROR';result.lookupError=String(e.shortMessage||e.message||e).slice(0,120)}
 }else if(kind==='BUNDLE')result.publicTxStatus='BUNDLE_HASH_NOT_PUBLIC_TX_LOOKUP';
 if(pools.length){
  const block=await provider.getBlock('latest');
  if(!block?.hash)throw Error('CONFIRMED_BLOCK_UNAVAILABLE');
  result.poolIdentityBlock=block.number;
  for(const pool of pools.slice(0,5)){
   try{
    const id=await verify(pool,block.number);
    const alt=id.verified?await alternative(provider,id,block.number):null;
    result.pools.push({pool,verified:!!id.verified,venue:id.venue||null,
     token0:id.verified?id.token0:null,token1:id.verified?id.token1:null,
     crossVenueVerified:!!alt?.found,alternativePool:alt?.found?alt.pool:null,
     reason:id.verified?null:id.reason||'UNVERIFIED'});
   }catch(e){result.pools.push({pool,verified:false,reason:'POOL_RPC_ERROR'})}
  }
 }
 return result;
}
async function run({provider,monitorImpl=monitor,runtimeMs=60000,maxLookups=12,maxExamples=12}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const stats={build:'BALANCER_RESEARCH_V58',mode:'LIVE_TARGET_REFERENCE_RPC_AND_POOL_AUDIT',
  pendingEvents:0,bundleEvents:0,pendingSwapHints:0,bundleSwapHints:0,
  attemptedPublicTxLookups:0,publicTxResolved:0,publicTxNotFound:0,publicTxErrors:0,
  verifiedDisclosedPools:0,verifiedCrossVenuePools:0,examples:[],
  targetFirstSimulationAttempted:false,netProfitVerified:false,
  bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 stats.monitor=await monitorImpl({runtimeMs,onEvent:async event=>{
  if(event.kind==='BUNDLE')stats.bundleEvents++;else stats.pendingEvents++;
  if(event.swapPools?.length){if(event.kind==='BUNDLE')stats.bundleSwapHints++;else stats.pendingSwapHints++}
  // Prefer hinted pending txs and hinted bundles. Pending no-hint events are counted only.
  if(!event.swapPools?.length||stats.examples.length>=maxExamples)return;
  if(event.kind==='PENDING_TRANSACTION'&&stats.attemptedPublicTxLookups>=maxLookups)return;
  const row=await investigate(provider,event);
  if(event.kind==='PENDING_TRANSACTION'){
   stats.attemptedPublicTxLookups++;
   if(row.publicTxStatus==='PUBLIC_RPC_TRANSACTION_RESOLVED')stats.publicTxResolved++;
   if(row.publicTxStatus==='NOT_FOUND_ON_PUBLIC_RPC_PRIVATE_POSSIBLE')stats.publicTxNotFound++;
   if(row.publicTxStatus==='PUBLIC_RPC_LOOKUP_ERROR')stats.publicTxErrors++;
  }
  stats.verifiedDisclosedPools+=row.pools.filter(x=>x.verified).length;
  stats.verifiedCrossVenuePools+=row.pools.filter(x=>x.crossVenueVerified).length;
  stats.examples.push(row);
 }});
 return {...stats,limitations:['PRIVATE_TX_NOT_FOUND_ON_PUBLIC_RPC_IS_NOT_PROOF_OF_INVALID_TARGET',
  'BUNDLE_HASH_NOT_TREATED_AS_PUBLIC_TX_HASH','CONFIRMED_BLOCK_POOL_IDENTITY_NOT_POST_TARGET_STATE',
  'NO_TARGET_FIRST_SIMULATION_OR_BUNDLE_SUBMISSION']};
}
module.exports={investigate,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider}).then(r=>console.log(JSON.stringify(r)))
 .catch(e=>{console.error('V58_FAILED',String(e.message).slice(0,180));process.exitCode=1})
 .finally(()=>provider.destroy());
}
