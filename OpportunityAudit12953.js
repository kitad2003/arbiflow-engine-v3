'use strict';
// 12.9.53 price-ranked exact-quote audit. Spot prices screen; exact-sized quotes decide.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {RpcPacer}=require('./RpcPacer12950');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const MAX=Number(process.env.AUDIT_ROUTE_LIMIT||36),SIZE=[10000,25000,35000],FILE='arbiflow-audit-12953.json';
const Q192=1n<<192n,ONE=10n**18n;
function spotFraction(pool,from,to){
 // The discovered v3 sqrtPrice is token1/token0 in raw units. Only use for v3.
 if(pool.kind!=='v3'||!pool.priceStateRaw)return null;
 const a=TOKENS[from].toLowerCase(),b=TOKENS[to].toLowerCase();
 const token0=a<b?a:b;const sqrt=BigInt(pool.priceStateRaw),square=sqrt*sqrt;
 if(!sqrt)return null;
 return a===token0?[square,Q192]:[Q192,square];
}
function spotScore(route){
 const first=spotFraction(route.first,'USDC',route.token),second=spotFraction(route.second,route.token,'USDC');
 if(!first||!second)return null;
 const num=first[0]*second[0],den=first[1]*second[1];
 const firstFee=BigInt(Number(route.first.poolConfig)),secondFee=BigInt(Number(route.second.poolConfig));
 // V3 fees denominated in parts per million.
 const afterFeeNum=num*(1000000n-firstFee)*(1000000n-secondFee);
 const afterFeeDen=den*1000000n*1000000n;
 return {scoreBps:Number((afterFeeNum*10000n/afterFeeDen)-10000n),afterFeeNum,afterFeeDen};
}
function rankRoutes(routes){
 const seen=new Set(),ranked=[],excluded=[];
 for(const r of routes){
  const key=r.first.address.toLowerCase()+'>'+r.second.address.toLowerCase();
  if(seen.has(key))continue;seen.add(key);
  const score=spotScore(r);
  if(score===null){excluded.push({pair:r.pair,pools:[r.first.address,r.second.address],reason:'UNSUPPORTED_STABLE_OR_V1_SPOT_PRICE'});continue}
  ranked.push({...r,scoreBps:score.scoreBps});
 }
 ranked.sort((a,b)=>b.scoreBps-a.scoreBps);
 return {ranked,excluded,uniqueRouteCount:seen.size};
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 assert(Number.isSafeInteger(MAX)&&MAX>=1&&MAX<=120,'INVALID_AUDIT_LIMIT');
 const discovery=await discover(rpc);assert(discovery.success,'DISCOVERY_FAILED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const all=routesFor(discovery.pools,3000),screen=rankRoutes(all.selected),selected=screen.ranked.slice(0,MAX);
  const block=discovery.confirmedBlock;
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
  const quoters=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,ABI,provider)]));
  async function quote(pool,from,to,amount){
   return BigInt((await quoters[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:block}))[0]);
  }
  const results=[],stats={screened:screen.ranked.length,rejectedUnsupported:screen.excluded.length,spotPositive:screen.ranked.filter(x=>x.scoreBps>0).length,spotOverHalfPercent:screen.ranked.filter(x=>x.scoreBps>50).length,selectedForExact: selected.length,quotesSucceeded:0,quotesFailed:0};
  for(const r of selected){
   const row={pair:r.pair,route:'USDC>'+r.token+'>USDC',venues:[r.first.dex,r.second.dex],pools:[r.first.address,r.second.address],spotAfterFeeBps:r.scoreBps,sizes:[]};
   // A $10k probe first; larger sizes only when $10k is not massively underwater.
   for(const size of SIZE){
    if(size!==10000&&!row.sizes[0]?.success)break;
    if(size!==10000&&BigInt(row.sizes[0].afterAaveBeforeGasRaw)<-100000000n)break;
    const amt=BigInt(size)*1000000n,entry={loanUsdc:size};
    try{
     const mid=await pacer.run(()=>quote(r.first,'USDC',r.token,amt));
     const back=await pacer.run(()=>quote(r.second,r.token,'USDC',mid));
     const gross=back-amt,fee=(amt*premium+9999n)/10000n;
     Object.assign(entry,{success:true,grossProfitRaw:gross.toString(),aaveFeeRaw:fee.toString(),afterAaveBeforeGasRaw:(gross-fee).toString(),spreadGreaterThanHalfPercent:gross*10000n>amt*50n,qualified:false});
     stats.quotesSucceeded++;
    }catch(e){entry.success=false;entry.error=String(e?.shortMessage||e?.message||e).slice(0,90);stats.quotesFailed++}
    row.sizes.push(entry);
   }
   results.push(row);
  }
  const tests=results.flatMap(r=>r.sizes.map(x=>({...x,route:r.route,venues:r.venues,pools:r.pools,spotAfterFeeBps:r.spotAfterFeeBps})));
  const ranking=tests.filter(x=>x.success).sort((a,b)=>BigInt(a.afterAaveBeforeGasRaw)>BigInt(b.afterAaveBeforeGasRaw)?-1:BigInt(a.afterAaveBeforeGasRaw)<BigInt(b.afterAaveBeforeGasRaw)?1:0);
  const report={build:'12.9.53',mode:'PRICE_SCREEN_THEN_EXACT_QUOTE',createdAt:new Date().toISOString(),block,discoveredPools:discovery.uniqueActivePools,routeUniverse:all.total,screenedUnique:screen.uniqueRouteCount,stats,flashLoanPremiumBps:premium.toString(),topSpotRankings:screen.ranked.slice(0,15).map(x=>({pair:x.pair,pools:[x.first.address,x.second.address],spotAfterFeeBps:x.scoreBps})),closestAfterAaveBeforeGas:ranking.slice(0,20),positiveAfterAaveBeforeGas:ranking.filter(x=>BigInt(x.afterAaveBeforeGasRaw)>0n).length,quotesPassingHalfPercent:ranking.filter(x=>x.spreadGreaterThanHalfPercent).length,excludedCount:screen.excluded.length,rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['V1_AND_STABLE_SPOT_NOT_RANKED','V3_SPOT_EXCLUDES_PRICE_IMPACT','SELECTED_POOL_STATES_ARE_FROM_DISCOVERY_BLOCK','GAS_SLIPPAGE_L1_FEE_ATOMIC_AND_RISK_NOT_VERIFIED']};
  fs.writeFileSync(FILE,JSON.stringify(report,null,2)+'\n');return report;
 }finally{provider.destroy()}
}
if(require.main===module){
 const p={kind:'v3',priceStateRaw:(1n<<96n).toString(),poolConfig:500};
 const a={pair:'USDC/WETH',token:'WETH',first:p,second:{...p,poolConfig:3000},};
 assert.equal(spotScore(a).scoreBps,-35);
 console.log(JSON.stringify({build:'12.9.53',unitAssertionsPassed:1}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('AUDIT_12953_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,spotFraction,spotScore,rankRoutes};
