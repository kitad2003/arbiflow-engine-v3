'use strict';
// NEW RESEARCH FOUNDATION: event-driven verified-pool adjacency & dirty-route discovery.
// Does not infer executable prices from swaps, compare stale state, or generate trade alerts.
const valid=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x);
const norm=x=>x.toLowerCase();
function build(poolMetadata){
 const byPool=new Map(),byToken=new Map(),pairs=new Map();
 for(const m of poolMetadata||[]){
  if(!m?.verified||!valid(m.pool)||!valid(m.token0?.address)||!valid(m.token1?.address))continue;
  const a=norm(m.token0.address),b=norm(m.token1.address),pool=norm(m.pool);
  if(a===b||byPool.has(pool))continue;
  const pair=[a,b].sort().join(':');
  const item={pool,token0:a,token1:b,pair};
  byPool.set(pool,item);
  for(const t of [a,b]){if(!byToken.has(t))byToken.set(t,new Set());byToken.get(t).add(pool)}
  if(!pairs.has(pair))pairs.set(pair,new Set());pairs.get(pair).add(pool);
 }
 return {byPool,byToken,pairs};
}
function dirty(graph,events){
 const impacted=new Set(),reasons=[];
 for(const event of events||[]){
  const p=norm(String(event?.pool||''));
  if(!graph.byPool.has(p))continue;
  const d=event?.decoded;
  // Verified swaps trigger recalculation. Liquidity-management logs also require fresh state,
  // but only if classified by a signature census elsewhere; unknown logs do not.
  if(!d?.recognized)continue;
  impacted.add(p);
 }
 const candidatePairs=new Map();
 for(const p of impacted){
  const meta=graph.byPool.get(p),alternatives=graph.pairs.get(meta.pair)||new Set();
  for(const alt of alternatives){
   if(alt===p)continue;
   const key=[p,alt].sort().join(':');
   candidatePairs.set(key,{poolA:p,poolB:alt,tokenA:meta.token0,tokenB:meta.token1,
    triggerPool:p,requiredNextStep:'REFRESH_EXACT_POOL_STATE_AND_SIMULATE_DYNAMIC_SIZES',
    quoteAvailable:false,simultaneousStateVerified:false,executionEligible:false});
  }
 }
 return {build:'RESEARCH_ONLY_EVENT_GRAPH_1',mode:'EVENT_DRIVEN_DIRTY_PAIR_DISCOVERY',
  verifiedPools:graph.byPool.size,tokenAdjacencies:graph.byToken.size,impactedPools:impacted.size,
  poolPairsToRefresh:[...candidatePairs.values()],candidateCount:candidatePairs.size,
  swapQuotesExecuted:0,atomicTests:0,qualified:0,alerts:[],mainnetBroadcast:false,executionEligible:false,
  limitations:['GRAPH_CANDIDATES_NOT_ARBITRAGE','NO_POOL_TICK_STATE','NO_LIQUIDITY_DEPTH','NO_CROSS_VENUE_QUOTE','NO_ATOMIC_SIMULATION']};
}
if(require.main===module){
 const assert=require('node:assert/strict'),a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40);
 const p1='0x'+'1'.repeat(40),p2='0x'+'2'.repeat(40),p3='0x'+'3'.repeat(40);
 const g=build([{verified:true,pool:p1,token0:{address:a},token1:{address:b}},
  {verified:true,pool:p2,token0:{address:b},token1:{address:a}},
  {verified:false,pool:p3,token0:{address:b},token1:{address:a}}]);
 assert.equal(g.byPool.size,2);
 assert.equal(dirty(g,[{pool:p1,decoded:{recognized:true}}]).candidateCount,1);
 assert.equal(dirty(g,[{pool:p1,decoded:{recognized:false}}]).candidateCount,0);
 assert.equal(dirty(g,[{pool:p3,decoded:{recognized:true}}]).candidateCount,0);
 assert.equal(dirty(g,[{pool:p1,decoded:{recognized:true}}]).executionEligible,false);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_EVENT_GRAPH_1',unitAssertionsPassed:5}));
}
module.exports={build,dirty};
