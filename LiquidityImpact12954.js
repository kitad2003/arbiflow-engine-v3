'use strict';
// 12.9.54 read-only liquidity / price-impact diagnostics.
// Small probe is screening only: minimum proposed flash loan remains $10,000.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {rankRoutes}=require('./OpportunityAudit12953');
const {RpcPacer}=require('./RpcPacer12950');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const QUOTERS={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const V3ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1ABI=['function getAmountOut(uint256,address) view returns(uint256)'];
const SIZES=[100,1000,10000,25000,35000],MIN_LOAN=10000,OUTPUT='arbiflow-impact-12954.json';
const LIMIT=Number(process.env.IMPACT_ROUTE_LIMIT||24);
function choose(screen,limit=LIMIT){
 const high=screen.ranked.filter(x=>x.scoreBps>50);
 const other=screen.ranked.filter(x=>x.scoreBps<=50);
 // Include unsupported V1 routes as quote-only probes; do not label as spot-priced.
 const fallback=screen.excluded.map(x=>x.route).filter(Boolean);
 const unique=new Map();
 for(const x of [...high,...fallback,...other]){const key=x.first.address.toLowerCase()+'>'+x.second.address.toLowerCase();if(!unique.has(key))unique.set(key,x)}
 return [...unique.values()].slice(0,limit);
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 assert(Number.isSafeInteger(LIMIT)&&LIMIT>=8&&LIMIT<=80,'INVALID_IMPACT_ROUTE_LIMIT');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const block=d.confirmedBlock,universe=routesFor(d.pools,3000);
  const screen=rankRoutes(universe.selected);
  // rankRoutes excludes V1 from spot ranking, but its complete route objects remain in universe.
  const v1=universe.selected.filter(x=>x.first.kind==='v1'||x.second.kind==='v1');
  const spot=screen.ranked.filter(x=>x.scoreBps>50);
  const v1Pairs=new Map();for(const x of v1){if(!v1Pairs.has(x.pair))v1Pairs.set(x.pair,[]);v1Pairs.get(x.pair).push(x)}
  const v1RoundRobin=[];let progress=true;
  while(progress){progress=false;for(const entries of v1Pairs.values())if(entries.length){v1RoundRobin.push(entries.shift());progress=true}}
  const poolMap=new Map();
  for(const route of [...spot,...v1RoundRobin,...screen.ranked]){
   const key=route.first.address.toLowerCase()+'>'+route.second.address.toLowerCase();
   if(!poolMap.has(key))poolMap.set(key,route);
  }
  const selected=[...poolMap.values()].slice(0,LIMIT);
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
  const q=Object.fromEntries(Object.entries(QUOTERS).map(([k,v])=>[k,new ethers.Contract(v,V3ABI,provider)]));
  const v1Contracts=new Map();
  async function quote(p,a,b,amount){
   if(p.kind==='v1'){
    if(!v1Contracts.has(p.address))v1Contracts.set(p.address,new ethers.Contract(p.address,V1ABI,provider));
    return BigInt(await v1Contracts.get(p.address).getAmountOut(amount,TOKENS[a],{blockTag:block}));
   }
   return BigInt((await q[p.dex].quoteExactInputSingle.staticCall([TOKENS[a],TOKENS[b],amount,Number(p.poolConfig),0],{blockTag:block}))[0]);
  }
  const rows=[],counts={spotOverHalfPercent:spot.length,unsupportedSpot:screen.excluded.length,selected:0,routeAmountQuotes:0,failed:0,profitableAfterAaveAtOrAboveMinLoan:0,spreadPassingAtOrAboveMinLoan:0};
  for(const route of selected){
   const ranked=screen.ranked.find(x=>x.first.address.toLowerCase()===route.first.address.toLowerCase()&&x.second.address.toLowerCase()===route.second.address.toLowerCase());
   const row={path:'USDC>'+route.token+'>USDC',pair:route.pair,pools:[route.first.address,route.second.address],venues:[route.first.dex,route.second.dex],spotAfterPoolFeesBps:ranked?.scoreBps??null,spotScreenSupported:!!ranked,sizes:[],largestPositiveSizeUsdc:null,firstNonprofitableSizeUsdc:null};
   for(const size of SIZES){
    const amount=BigInt(size)*1000000n,entry={loanUsdc:size,probeOnly:size<MIN_LOAN};
    try{
     const mid=await pacer.run(()=>quote(route.first,'USDC',route.token,amount));
     const back=await pacer.run(()=>quote(route.second,route.token,'USDC',mid));
     const gross=back-amount,loanFee=(amount*premium+9999n)/10000n,after=gross-loanFee;
     Object.assign(entry,{success:true,grossProfitUsdc:Number(gross)/1e6,afterAaveBeforeGasUsdc:Number(after)/1e6,returnAfterPoolFeesBps:Number(gross*10000n/amount),spreadAboveHalfPercent:gross*10000n>50n*amount,afterAavePositive:after>0n,remainingGates:['GAS','L1_FEE','SLIPPAGE','ATOMIC_FORK','RISK']});
     counts.routeAmountQuotes++;
     if(after>0n)row.largestPositiveSizeUsdc=size;
     else if(row.firstNonprofitableSizeUsdc===null)row.firstNonprofitableSizeUsdc=size;
     if(size>=MIN_LOAN&&after>0n)counts.profitableAfterAaveAtOrAboveMinLoan++;
     if(size>=MIN_LOAN&&entry.spreadAboveHalfPercent)counts.spreadPassingAtOrAboveMinLoan++;
    }catch(e){entry.success=false;entry.error=String(e?.shortMessage||e?.message||e).slice(0,90);counts.failed++}
    row.sizes.push(entry);
   }
   const probe=row.sizes.find(x=>x.loanUsdc===100&&x.success),atMin=row.sizes.find(x=>x.loanUsdc===MIN_LOAN&&x.success);
   row.priceImpactVs100UsdcProbeBps=probe&&atMin?probe.returnAfterPoolFeesBps-atMin.returnAfterPoolFeesBps:null;
   row.minLoanAfterAaveBeforeGasUsdc=atMin?.afterAaveBeforeGasUsdc??null;
   row.qualifying=false;rows.push(row);
  }
  counts.selected=rows.length;
  const ranked=[...rows].sort((a,b)=>(b.minLoanAfterAaveBeforeGasUsdc??-Infinity)-(a.minLoanAfterAaveBeforeGasUsdc??-Infinity));
  const report={build:'12.9.54',mode:'LIQUIDITY_AND_PRICE_IMPACT_AUDIT_READ_ONLY',createdAt:new Date().toISOString(),block,discoveredPools:d.uniqueActivePools,allRoutes:universe.total,screenedV3:screen.ranked.length,counts,loanSizesUsdc:SIZES,minimumEligibleLoanUsdc:MIN_LOAN,aavePremiumBps:premium.toString(),topRoutes:ranked.slice(0,24),rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['NO_ATOMIC_EXECUTION','NO_GAS_OR_L1_DATA_FEES','SPOT_PROBE_NOT_EXECUTABLE','NOT_ALL_ROUTES_AUDITED','NO_FULL_LIQUIDITY_BOUND_PROOF']};
  fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');return report;
 }finally{provider.destroy()}
}
if(require.main===module){
 assert(SIZES.includes(MIN_LOAN));
 assert(SIZES[0]<MIN_LOAN);
 console.log(JSON.stringify({build:'12.9.54',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('IMPACT_12954_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,choose};
