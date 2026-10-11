'use strict';
// Independent, read-only exhaustive directional and size audit.
// One pinned discovery snapshot, all generated USDC round trips, no liquidity heuristic.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {RpcPacer}=require('./RpcPacer12950');
const SIZES=[100,500,1000,2500,5000,10000,25000,50000];
const QUOTERS={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const V3=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const OUT='arbiflow-directional-size-audit.json';
function pairKey(r){return [r.first.address.toLowerCase(),r.second.address.toLowerCase()].sort().join('|')}
function validateDirections(routes){
 const keys=new Set(routes.map(r=>r.first.address.toLowerCase()+'>'+r.second.address.toLowerCase()));
 const missing=routes.filter(r=>!keys.has(r.second.address.toLowerCase()+'>'+r.first.address.toLowerCase()));
 return {directionalRoutes:routes.length,missingReverseRoutes:missing.length,missingExamples:missing.slice(0,10).map(r=>({pair:r.pair,pools:[r.first.address,r.second.address]}))};
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 const discovered=await discover(rpc);assert(discovered.success,'DISCOVERY_FAILED');
 const block=discovered.confirmedBlock;
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const routes=routesFor(discovered.pools,100000).selected;
  const directionAudit=validateDirections(routes);
  const pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
  const v3=Object.fromEntries(Object.entries(QUOTERS).map(([k,v])=>[k,new ethers.Contract(v,V3,provider)]));
  const v1=new Map();
  async function quote(pool,from,to,amount){
   if(pool.kind==='v1'){
    const key=pool.address.toLowerCase();
    if(!v1.has(key))v1.set(key,new ethers.Contract(pool.address,V1,provider));
    return BigInt(await pacer.run(()=>v1.get(key).getAmountOut(amount,TOKENS[from],{blockTag:block})));
   }
   if(!v3[pool.dex])throw Error('UNSUPPORTED_DEX_'+pool.dex);
   return BigInt((await pacer.run(()=>v3[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:block})))[0]);
  }
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const rows=[],stats={routes:routes.length,expectedQuotes:routes.length*SIZES.length,success:0,failed:0,positiveGross:0,positiveAfterAave:0,overHalfPercent:0};
  // Cache each exact first-leg quote for reuse by all routes starting in that pool.
  const firstLeg=new Map();
  for(const route of routes){
   const row={pair:route.pair,token:route.token,venues:[route.first.dex,route.second.dex],pools:[route.first.address,route.second.address],sizes:[]};
   for(const size of SIZES){
    const amount=BigInt(size)*1000000n,cacheKey=route.first.address.toLowerCase()+':'+size;
    const item={sizeUsdc:size};
    try{
     let mid=firstLeg.get(cacheKey);
     if(mid===undefined){mid=await quote(route.first,'USDC',route.token,amount);firstLeg.set(cacheKey,mid)}
     if(mid<=0n)throw Error('ZERO_FIRST_LEG_OUTPUT');
     const back=await quote(route.second,route.token,'USDC',mid);
     const gross=back-amount,fee=(amount*premium+9999n)/10000n,net=gross-fee;
     Object.assign(item,{success:true,firstLegOutputRaw:mid.toString(),returnedUsdcRaw:back.toString(),grossUsdc:Number(gross)/1e6,aaveFeeUsdc:Number(fee)/1e6,afterAaveBeforeGasUsdc:Number(net)/1e6,positiveGross:gross>0n,positiveAfterAave:net>0n,overHalfPercent:gross*10000n>amount*50n});
     stats.success++;if(gross>0n)stats.positiveGross++;if(net>0n)stats.positiveAfterAave++;if(item.overHalfPercent)stats.overHalfPercent++;
    }catch(e){item.success=false;item.reason=String(e?.shortMessage||e?.message||e).slice(0,130);stats.failed++}
    row.sizes.push(item);
   }
   rows.push(row);
  }
  const ranked=rows.flatMap(r=>r.sizes.filter(s=>s.success).map(s=>({pair:r.pair,token:r.token,venues:r.venues,pools:r.pools,...s}))).sort((a,b)=>b.afterAaveBeforeGasUsdc-a.afterAaveBeforeGasUsdc);
  const report={build:'12.9.57',mode:'ONE_SNAPSHOT_ALL_DIRECTIONS_ALL_SIZES_READ_ONLY',createdAt:new Date().toISOString(),block,discoveredPools:discovered.uniqueActivePools,sizesUsdc:SIZES,directionAudit,stats,premiumBps:premium.toString(),topResults:ranked.slice(0,30),allRoutes:rows,rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['DISCOVERY_SILENT_ERRORS_NOT_YET_INSTRUMENTED','NO_GAS_SLIPPAGE_ATOMIC_RISK_VERIFICATION','ONLY_USDC_BASED_TWO_LEG_CROSS_DEX_ROUTES','NO_LIVE_MEMPOOL_STATE']};
  fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');return {...report,allRoutes:undefined};
 }finally{provider.destroy()}
}
if(require.main===module){
 const fake=[{pair:'USDC/WETH',first:{address:'a'},second:{address:'b'}},{pair:'USDC/WETH',first:{address:'b'},second:{address:'a'}}];
 assert.equal(validateDirections(fake).missingReverseRoutes,0);
 assert.equal(validateDirections(fake.slice(0,1)).missingReverseRoutes,1);
 console.log(JSON.stringify({build:'12.9.57',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('AUDIT_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,200));process.exitCode=1});
}
module.exports={run,validateDirections,SIZES};
