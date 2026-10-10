'use strict';
// V51 research-only dynamic pool registry. No execution or profitability claims.
const {discover}=require('./verified-pairs-v12');
const {SWAP_TOPIC}=require('./bot');
const ADDRESS=/^0x[0-9a-f]{40}$/i;
class VerifiedPoolCache {
 constructor({discoverImpl=discover,ttlMs=300000,maxEntries=2000,clock=Date.now}={}){
  this.discoverImpl=discoverImpl;this.ttlMs=ttlMs;this.maxEntries=maxEntries;this.clock=clock;
  this.entries=new Map();this.inflight=new Map();
 }
 async resolve(provider,pool){
  if(!ADDRESS.test(pool||''))return {verified:false,reason:'INVALID_POOL'};
  const key=pool.toLowerCase(),now=this.clock(),old=this.entries.get(key);
  if(old&&now-old.checkedAt<this.ttlMs)return {...old.value,cacheHit:true};
  if(this.inflight.has(key))return this.inflight.get(key);
  const work=(async()=>{
   const result=await this.discoverImpl(provider,{address:key,topics:[SWAP_TOPIC]});
   const value={verified:result?.verifiedCrossVenuePair===true,
    trigger:result?.identity||null,alternative:result?.alternative||null,
    blockNumber:result?.blockNumber??null,reason:result?.verifiedCrossVenuePair?'VERIFIED_PAIR':'PAIR_NOT_VERIFIED',
    executionEligible:false,netProfitVerified:false};
   if(this.entries.size>=this.maxEntries)this.entries.delete(this.entries.keys().next().value);
   this.entries.set(key,{checkedAt:this.clock(),value});
   return {...value,cacheHit:false};
  })().finally(()=>this.inflight.delete(key));
  this.inflight.set(key,work);return work;
 }
}
async function inspect(event,{provider,cache=new VerifiedPoolCache(),maxPools=12}={}){
 const result={build:'BALANCER_RESEARCH_V51',mode:'DYNAMIC_V2_PAIR_DISCOVERY_READ_ONLY',
  pendingHash:event?.kind==='PENDING_TRANSACTION'?event.pendingHash:null,
  pairs:[],skipped:[],simulationAttempted:false,netProfitVerified:false,
  executionEligible:false,alerts:[],bundlesSubmitted:0,mainnetBroadcast:false};
 if(event?.kind!=='PENDING_TRANSACTION')return {...result,reason:'BUNDLE_OR_NON_PENDING_EVENT'};
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const unique=[...new Set((event.swapPools||[]).filter(x=>ADDRESS.test(x)).map(x=>x.toLowerCase()))];
 for(const pool of unique.slice(0,maxPools)){
  try{const row=await cache.resolve(provider,pool);
   if(row.verified)result.pairs.push({pool,token0:row.trigger.token0,token1:row.trigger.token1,
    triggerVenue:row.trigger.venue,alternativePool:row.alternative.pool,
    alternativeVenue:row.alternative.venue,verifiedBlock:row.blockNumber,cacheHit:row.cacheHit,
    executable:false});
   else result.skipped.push({pool,reason:row.reason});
  }catch{result.skipped.push({pool,reason:'VERIFICATION_ERROR'})}
 }
 result.skippedCountBeyondLimit=Math.max(0,unique.length-maxPools);
 return result;
}
module.exports={VerifiedPoolCache,inspect};
