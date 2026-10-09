'use strict';
// 12.9.67 Balancer-backed market discrepancy hunter: ALL discovered pools, including same-DEX
// fee tiers. Screening is a mathematical approximation, not a positive trade signal.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {triangles}=require('./TriangleDiscovery12962');
const {RpcPacer}=require('./RpcPacer12950');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const QA=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const MAX=Number(process.env.HUNTER_ROUTE_LIMIT||65),SIZES=[500,1000,2500,5000,10000],Q192=1n<<192n,ONE=1000000n;
function pairs2(pools){
 const groups=new Map();for(const p of pools){if(!p.pair.startsWith('USDC/'))continue;if(!groups.has(p.pair))groups.set(p.pair,[]);groups.get(p.pair).push(p)}
 const out=[];for(const [pair,ps] of groups)for(const a of ps)for(const b of ps){
  if(a.address.toLowerCase()===b.address.toLowerCase())continue;
  out.push({type:'TWO_POOL',path:['USDC',pair.split('/')[1],'USDC'],legs:[{pool:a,from:'USDC',to:pair.split('/')[1]},{pool:b,from:pair.split('/')[1],to:'USDC'}]});
 }
 return out;
}
function triangleRows(pools){return triangles(pools).map(t=>({type:'TRIANGLE',path:t.path,legs:t.legs}))}
function priceFraction(p,from,to){
 if(p.kind!=='v3'||!p.priceStateRaw)return null;
 const a=TOKENS[from].toLowerCase(),b=TOKENS[to].toLowerCase(),s=BigInt(p.priceStateRaw);
 if(s<=0n)return null;
 const [num,den]=a<b?[s*s,Q192]:[Q192,s*s];
 const fee=BigInt(Number(p.poolConfig));if(fee>=ONE||fee<0n)return null;
 return [num*(ONE-fee),den*ONE];
}
function score(route){
 let num=1n,den=1n;
 for(const leg of route.legs){const f=priceFraction(leg.pool,leg.from,leg.to);if(!f)return null;num*=f[0];den*=f[1]}
 return Number((num*10000n/den)-10000n);
}
function sortRoutes(routes){
 const scored=[],unsupported=[];
 for(const r of routes){const bps=score(r);if(bps===null)unsupported.push(r);else scored.push({...r,spotAfterFeesBps:bps})}
 scored.sort((a,b)=>b.spotAfterFeesBps-a.spotAfterFeesBps);
 return {scored,unsupported};
}
function serialize(r){return {type:r.type,path:r.path.join('>'),pools:r.legs.map(l=>l.pool.address),venues:r.legs.map(l=>l.pool.dex),spotAfterFeesBps:r.spotAfterFeesBps??null}}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 assert(Number.isSafeInteger(MAX)&&MAX>0&&MAX<=200,'INVALID_ROUTE_LIMIT');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const block=d.confirmedBlock,all=[...pairs2(d.pools),...triangleRows(d.pools)],{scored,unsupported}=sortRoutes(all);
  // Include only mathematically top-ranked V3 routes; V1 is reported as unsupported
  // for this ranking, not silently excluded from the pool universe.
  const chosen=scored.slice(0,MAX),q=Object.fromEntries(Object.entries(Q).map(([dex,a])=>[dex,new ethers.Contract(a,QA,p)]));
  const pacer=new RpcPacer({gapMs:110,parallel:2,retries:2}),cache=new Map(),v1=new Map();
  async function quote(l,amt){
   const key=l.pool.address.toLowerCase()+':'+l.from+':'+amt;
   if(cache.has(key))return cache.get(key);
   let out;
   if(l.pool.kind==='v1'){const a=l.pool.address.toLowerCase();if(!v1.has(a))v1.set(a,new ethers.Contract(l.pool.address,V1,p));out=BigInt(await pacer.run(()=>v1.get(a).getAmountOut(amt,TOKENS[l.from],{blockTag:block})))}
   else out=BigInt((await pacer.run(()=>q[l.pool.dex].quoteExactInputSingle.staticCall([TOKENS[l.from],TOKENS[l.to],amt,Number(l.pool.poolConfig),0],{blockTag:block})))[0]);
   cache.set(key,out);return out;
  }
  const balance=BigInt(await new ethers.Contract(TOKENS.USDC,['function balanceOf(address) view returns(uint256)'],p).balanceOf(VAULT,{blockTag:block}));
  const collector=await new ethers.Contract(VAULT,['function getProtocolFeesCollector() view returns(address)'],p).getProtocolFeesCollector({blockTag:block});
  const feeWad=BigInt(await new ethers.Contract(collector,['function getFlashLoanFeePercentage() view returns(uint256)'],p).getFlashLoanFeePercentage({blockTag:block}));
  const samples=[];
  for(const r of chosen){
   const row={...serialize(r),sizes:[]};
   for(const dollars of SIZES){const amount=BigInt(dollars)*1000000n;
    const entry={sizeUsdc:dollars,canBorrowByBalance:amount<=balance,qualified:false};
    if(amount>balance){entry.success=false;entry.error='VAULT_BALANCE_BELOW_SIZE';row.sizes.push(entry);continue}
    try{let out=amount;for(const leg of r.legs)out=await quote(leg,out);
     const fee=(amount*feeWad+10n**18n-1n)/10n**18n,profit=out-amount-fee;
     Object.assign(entry,{success:true,returnRaw:out.toString(),grossUsdc:Number(out-amount)/1e6,
      afterBalancerFeeUsdc:Number(profit)/1e6,spreadPct:Number(out-amount)/Number(amount)*100,
      spreadGtHalfPercent:(out-amount)*10000n>amount*50n,positiveBeforeGas:profit>0n,gasVerified:false,atomicForkVerified:false});
    }catch(e){entry.success=false;entry.error=String(e?.shortMessage||e?.message||e).slice(0,90)}
    row.sizes.push(entry);
   }
   samples.push(row);
  }
  const flattened=samples.flatMap(x=>x.sizes.filter(s=>s.success).map(s=>({...s,path:x.path,pools:x.pools,type:x.type,venues:x.venues})));
  flattened.sort((a,b)=>b.afterBalancerFeeUsdc-a.afterBalancerFeeUsdc);
  const output={build:'12.9.67',mode:'ALL_POOL_DISCREPANCY_SCREEN_READ_ONLY',block,discoveredPools:d.pools.length,
   uniquePoolAddresses:new Set(d.pools.map(x=>x.address.toLowerCase())).size,
   routesDiscovered:all.length,twoPoolRoutes:all.filter(x=>x.type==='TWO_POOL').length,
   triangularRoutes:all.filter(x=>x.type==='TRIANGLE').length,
   routesSpotRankable:scored.length,routesUnsupportedSpot:unsupported.length,
   sameDexTwoPoolRoutes:all.filter(x=>x.type==='TWO_POOL'&&x.legs[0].pool.dex===x.legs[1].pool.dex).length,
   routesExactQuoted:chosen.length,quoteSizeEvaluations:flattened.length,balancerV2:{vault:VAULT,availableUsdc:Number(balance)/1e6,feePercentageWad:feeWad.toString()},
   bestBeforeGas:flattened.slice(0,20),topSpot:scored.slice(0,15).map(serialize),samples,rpcPacer:pacer.stats,
   qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,
   limitations:['V1_POOL_SPOT_RANKING_NOT_IMPLEMENTED','NO_HARDHAT_ATOMIC_FORK_IN_THIS_AUDIT','NO_GAS_L1_SLIPPAGE_OR_RISK_VERIFICATION','QUOTES_ARE_CONFIRMED_BLOCK_SNAPSHOTS','ROUTES_EXACT_QUOTED_ARE_SAMPLED']};
  fs.writeFileSync('arbiflow-discrepancy-12967.json',JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({...output,samples:undefined}));return output;
 }finally{p.destroy()}
}
if(require.main===module){
 const pool=(id,fee)=>({address:id,pair:'USDC/WETH',kind:'v3',dex:'UNISWAP_V3',poolConfig:fee,priceStateRaw:(1n<<96n).toString()});
 assert.equal(pairs2([pool('a',500),pool('b',3000)]).length,2);
 assert.equal(pairs2([pool('a',500),pool('b',3000)])[0].legs[0].pool.dex,pairs2([pool('a',500),pool('b',3000)])[0].legs[1].pool.dex);
 console.log(JSON.stringify({build:'12.9.67',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).catch(e=>{console.error('DISCREPANCY_12967_FAILED',String(e?.message||e).slice(0,190));process.exitCode=1});
}
module.exports={pairs2,triangleRows,priceFraction,score,sortRoutes,run};
