'use strict';
// ArbiFlow 12.9.59: crypto arbitrage route discovery across token graphs.
// Independent research module; no wallet signing, transaction sending or profit alerts.
const assert=require('node:assert/strict');
const {TOKENS}=require('./PoolUniverse12939');
const ADDR=Object.fromEntries(Object.entries(TOKENS).map(([k,v])=>[v.toLowerCase(),k]));
const SIZES_USD=[100,500,1000,2500,5000,10000,25000,50000];
function graphFromPools(pools){
 const edges=new Map(),invalid=[];
 const add=(token,edge)=>{if(!edges.has(token))edges.set(token,[]);edges.get(token).push(edge)};
 for(const p of pools){
  const tokens=String(p.pair||'').split('/');
  if(tokens.length!==2||!TOKENS[tokens[0]]||!TOKENS[tokens[1]]||tokens[0]===tokens[1]){invalid.push({address:p.address,reason:'INVALID_PAIR'});continue}
  for(const [from,to] of [[tokens[0],tokens[1]],[tokens[1],tokens[0]]])
   add(from,{from,to,pool:p.address,dex:p.dex,kind:p.kind,fee:p.poolConfig});
 }
 for(const list of edges.values())list.sort((a,b)=>a.to.localeCompare(b.to)||a.dex.localeCompare(b.dex)||a.pool.localeCompare(b.pool));
 return {edges,invalid};
}
function enumerate(pools,{anchors=['USDC','WETH','USDT','DAI','cbBTC'],maxRoutes=100000}={}){
 assert(Number.isSafeInteger(maxRoutes)&&maxRoutes>0&&maxRoutes<=500000,'INVALID_MAX_ROUTES');
 const {edges,invalid}=graphFromPools(pools),seen=new Set(),routes=[],counts={crossDex:0,sameDex:0,triangular:0};
 const add=(legs,type)=>{
  if(new Set(legs.map(e=>e.pool.toLowerCase())).size!==legs.length)return;
  const key=legs.map(e=>e.from+'>'+e.to+'@'+e.pool.toLowerCase()).join('|');
  if(seen.has(key))return;seen.add(key);
  counts[type]++;
  if(routes.length<maxRoutes)routes.push({type,start:legs[0].from,tokenPath:[legs[0].from,...legs.map(e=>e.to)],legs});
 };
 for(const start of anchors){
  for(const first of edges.get(start)||[]){
   for(const second of edges.get(first.to)||[]){
    if(second.to===start&&second.pool.toLowerCase()!==first.pool.toLowerCase())
     add([first,second],first.dex===second.dex?'sameDex':'crossDex');
    if(second.to===start||second.to===first.from)continue;
    for(const third of edges.get(second.to)||[])
     if(third.to===start)add([first,second,third],'triangular');
   }
  }
 }
 return {routes,counts,generated:seen.size,truncated:routes.length<seen.size,invalidPools:invalid};
}
function quoteRoute(route,amountRaw,quoteFn){
 // quoteFn(edge,amountRaw) must return an exact on-chain quote in destination-token raw units.
 // This function does not invent token decimals, USD values, gas, or flash-loan eligibility.
 return route.legs.reduce(async(prev,edge)=>{
  const amount=await prev;
  const out=BigInt(await quoteFn(edge,amount));
  if(out<=0n)throw Error('ZERO_OR_NEGATIVE_QUOTE');
  return out;
 },Promise.resolve(BigInt(amountRaw)));
}
if(require.main===module){
 const p=(a,b,dex,id)=>({pair:a+'/'+b,dex,address:id,kind:'v3',poolConfig:500});
 const pools=[p('USDC','WETH','UNI','0x01'),p('USDC','WETH','PAN','0x02'),p('WETH','DAI','UNI','0x03'),p('DAI','USDC','PAN','0x04')];
 const out=enumerate(pools,{anchors:['USDC']});
 assert(out.counts.crossDex===2,'BOTH_DIRECTIONS_REQUIRED');
 assert(out.counts.triangular>0,'TRIANGULAR_REQUIRED');
 assert(out.routes.some(r=>r.type==='triangular'&&r.tokenPath.join('>')==='USDC>WETH>DAI>USDC'));
 console.log(JSON.stringify({build:'12.9.59',mode:'CRYPTO_ROUTE_GRAPH_LOCAL_TEST',counts:out.counts,generated:out.generated,unitAssertionsPassed:3,readOnly:true,mainnetBroadcast:false,executionEligible:false}));
}
module.exports={enumerate,graphFromPools,quoteRoute,SIZES_USD};
