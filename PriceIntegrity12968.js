'use strict';
// Build 12.9.68: diversified exact-quote probes; reject unusable marginal prices.
// Snapshots only. Does not simulate Balancer or submit transactions.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {pairs2,triangleRows,sortRoutes,serialize:ignored}=require('./MarketDiscrepancy12967');
const {RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const QA=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'],BAL='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const CAP=Number(process.env.INTEGRITY_ROUTE_LIMIT||65),PROBE=10n*1000000n,SIZES=[500,1000,2500,5000,10000];
function diversify(routes,limit){
 const bins=new Map();for(const r of routes){const key=r.type+':'+r.path.join('>');
  if(!bins.has(key))bins.set(key,[]);bins.get(key).push(r)}
 const selected=[];while(selected.length<limit){let added=false;for(const rows of bins.values())if(rows.length){selected.push(rows.shift());added=true;if(selected.length===limit)break}if(!added)break}return selected;
}
function pct(out,input){return Number((out-input)*1000000n/input)/10000}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');assert(Number.isSafeInteger(CAP)&&CAP>=1&&CAP<=150,'BAD_CAP');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const all=[...pairs2(d.pools),...triangleRows(d.pools)],screen=sortRoutes(all),selected=diversify(screen.scored,CAP),block=d.confirmedBlock;
  const pacer=new RpcPacer({gapMs:120,parallel:2,retries:2}),quotes=Object.fromEntries(Object.entries(Q).map(([name,addr])=>[name,new ethers.Contract(addr,QA,p)])),v1=new Map(),cache=new Map();
  async function quote(leg,amount){
   const pool=leg.pool,key=pool.address.toLowerCase()+':'+leg.from+':'+amount.toString();
   if(cache.has(key))return cache.get(key);
   let result;if(pool.kind==='v1'){if(!v1.has(pool.address))v1.set(pool.address,new ethers.Contract(pool.address,V1,p));result=BigInt(await pacer.run(()=>v1.get(pool.address).getAmountOut(amount,TOKENS[leg.from],{blockTag:block})))}
   else result=BigInt((await pacer.run(()=>quotes[pool.dex].quoteExactInputSingle.staticCall([TOKENS[leg.from],TOKENS[leg.to],amount,Number(pool.poolConfig),0],{blockTag:block})))[0]);
   cache.set(key,result);return result;
  }
  async function routeQuote(route,input){let x=input;const legs=[];for(const leg of route.legs){const out=await quote(leg,x);legs.push({pool:leg.pool.address,from:leg.from,to:leg.to,inputRaw:x.toString(),outputRaw:out.toString()});x=out;if(x===0n)break}return {output:x,legs}}
  const token=new ethers.Contract(TOKENS.USDC,['function balanceOf(address) view returns(uint256)'],p),vaultBalance=BigInt(await token.balanceOf(BAL,{blockTag:block}));
  const vault=new ethers.Contract(BAL,['function getProtocolFeesCollector() view returns(address)'],p),collector=await vault.getProtocolFeesCollector({blockTag:block});
  const feeWad=BigInt(await new ethers.Contract(collector,['function getFlashLoanFeePercentage() view returns(uint256)'],p).getFlashLoanFeePercentage({blockTag:block}));
  const results=[],reasons={},errors=[];
  for(const r of selected){
   const row={type:r.type,path:r.path.join('>'),pools:r.legs.map(x=>x.pool.address),venues:r.legs.map(x=>x.pool.dex),spotAfterFeesBps:r.spotAfterFeesBps,probeUsdc:10,sizes:[]};
   try{
    const probe=await routeQuote(r,PROBE);row.probeReturnUsdc=Number(probe.output)/1e6;row.probeSpreadPct=pct(probe.output,PROBE);
    row.probeLegs=probe.legs;
    // Reject catastrophic liquidity failures; do not assume spot approximates executable prices.
    if(probe.output<PROBE*90n/100n)row.rejected='PROBE_LOSS_OVER_10_PERCENT';
    else if(probe.output===0n)row.rejected='ZERO_PROBE_OUTPUT';
    else{
     for(const dollars of SIZES){
      const amount=BigInt(dollars)*1000000n;
      if(amount>vaultBalance){row.sizes.push({sizeUsdc:dollars,error:'VAULT_INSUFFICIENT'});continue}
      try{const result=await routeQuote(r,amount),fee=(amount*feeWad+10n**18n-1n)/10n**18n,gross=result.output-amount;
       const s={sizeUsdc:dollars,returnUsdc:Number(result.output)/1e6,grossUsdc:Number(gross)/1e6,spreadPct:pct(result.output,amount),
        afterBalancerBeforeGasUsdc:Number(gross-fee)/1e6,positiveBeforeGas:gross>fee,spreadGtHalfPercent:gross*10000n>amount*50n,
        qualified:false,atomicForkVerified:false,gasVerified:false};
       row.sizes.push(s);
       if(result.output<amount*85n/100n){row.rejected='TRADE_SIZE_LOSS_OVER_15_PERCENT';break}
      }catch(e){row.sizes.push({sizeUsdc:dollars,error:String(e?.shortMessage||e?.message||e).slice(0,100)});errors.push({path:row.path,stage:'SIZE_'+dollars,error:row.sizes.at(-1).error})}
     }
    }
   }catch(e){row.rejected='PROBE_QUOTE_FAILURE';row.probeError=String(e?.shortMessage||e?.message||e).slice(0,100);errors.push({path:row.path,stage:'PROBE',error:row.probeError})}
   if(row.rejected)reasons[row.rejected]=(reasons[row.rejected]||0)+1;results.push(row);
  }
  const sized=results.flatMap(r=>r.sizes.filter(s=>typeof s.afterBalancerBeforeGasUsdc==='number').map(s=>({...s,path:r.path,type:r.type,pools:r.pools})));
  sized.sort((a,b)=>b.afterBalancerBeforeGasUsdc-a.afterBalancerBeforeGasUsdc);
  const out={build:'12.9.68',mode:'DIVERSIFIED_PRICE_INTEGRITY_SNAPSHOT',block,pools:d.pools.length,routesDiscovered:all.length,routesRankable:screen.scored.length,
   routesSpotUnsupported:screen.unsupported.length,routeGroupsSelected:new Set(selected.map(x=>x.type+':'+x.path.join('>'))).size,
   routesProbed:results.length,routesRejected:results.filter(x=>x.rejected).length,rejectionReasons:reasons,sizeEvaluations:sized.length,
   vaultUsdc:Number(vaultBalance)/1e6,balancerFeeWad:feeWad.toString(),bestBeforeGas:sized.slice(0,20),errors:errors.slice(0,80),
   results,rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,
   limitations:['SPOT_V1_UNRANKED','SMALL_PROBE_NOT_GUARANTEE_OF_LARGER_SIZE','NO_ATOMIC_FORK_OR_GAS_COST_VALIDATION','PRICE_IMPACT_VS_SPOT_NOT_EXPLICITLY_VERIFIED']};
  fs.writeFileSync('arbiflow-integrity-12968.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,results:undefined}));return out;
 }finally{p.destroy()}
}
if(require.main===module){
 const mk=(path,type='TWO_POOL')=>({path:path.split('>'),type});
 assert.equal(diversify([mk('USDC>A>USDC'),mk('USDC>A>USDC'),mk('USDC>B>USDC')],2).length,2);
 assert.deepEqual(diversify([mk('USDC>A>USDC'),mk('USDC>A>USDC'),mk('USDC>B>USDC')],2).map(x=>x.path[1]),['A','B']);
 console.log(JSON.stringify({build:'12.9.68',unitAssertionsPassed:2}));
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).catch(e=>{console.error('INTEGRITY_FAILED',String(e?.message||e).slice(0,180));process.exitCode=1});else{console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
}
module.exports={diversify,pct,run};
