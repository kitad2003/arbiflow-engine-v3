'use strict';
// ArbiFlow 12.9.45: compare $25k/$35k; fee-aware route prioritization and explicit rejection diagnostics.
// Scores only for quote scheduling; not a profitability prediction. Read-only.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const U='0x222ca98f00ed15b1fae10b61c277703a194cf5d2',C='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const AMOUNTS_USDC=[25000,35000],MAX=Number(process.env.MAX_RANKED_ROUTES||120);
const names=Object.keys(TOKENS);
function pair(a,b){return [a,b].sort((x,y)=>names.indexOf(x)-names.indexOf(y)).join('/')}
function feeEstimate(p){return p.kind==='v3'?Number(p.poolConfig):10000}
function createCandidates(pools){
 const lookup=new Map();
 for(const pool of pools){if(!lookup.has(pool.pair))lookup.set(pool.pair,[]);lookup.get(pool.pair).push(pool)}
 const others=names.filter(x=>x!=='USDC'&&lookup.has(pair('USDC',x)));
 const routes=[],add=(path,legs)=>{if(new Set(legs.map(x=>x.address.toLowerCase())).size!==legs.length)return;routes.push({path,legs,feeEstimateBps:legs.reduce((v,p)=>v+feeEstimate(p),0),venues:new Set(legs.map(x=>x.dex)).size})};
 // Multiple fee tiers per pair rather than blindly taking first two listed.
 for(const x of others){
  const ps=lookup.get(pair('USDC',x));
  for(const first of ps)for(const second of ps){if(first.address!==second.address)add(['USDC',x,'USDC'],[first,second])}
 }
 for(const x of others)for(const y of others){
  if(x===y)continue;
  const middle=lookup.get(pair(x,y));if(!middle)continue;
  for(const a of lookup.get(pair('USDC',x)))for(const b of middle)for(const c of lookup.get(pair('USDC',y)))add(['USDC',x,y,'USDC'],[a,b,c]);
 }
 // Ranking is by cheap pool fees and venue diversity only, NOT raw V3 liquidity comparisons.
 routes.sort((a,b)=>a.feeEstimateBps-b.feeEstimateBps||b.venues-a.venues||a.path.join('>').localeCompare(b.path.join('>')));
 return routes;
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 assert(Number.isSafeInteger(MAX)&&MAX>=1&&MAX<=500,'ROUTE_BUDGET_1_TO_500');
 const universe=await discover(rpc);assert(universe.success,'INSUFFICIENT_POOLS');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const q={UNISWAP_V3:new ethers.Contract(U,ABI,p),PANCAKESWAP_V3:new ethers.Contract(C,ABI,p)};
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p).FLASHLOAN_PREMIUM_TOTAL({blockTag:universe.confirmedBlock}));
  const routes=createCandidates(universe.pools),selected=routes.slice(0,MAX);
  const quote=async(pool,from,to,amount,block)=>{
   if(pool.kind==='v1')return BigInt(await new ethers.Contract(pool.address,V1,p).getAmountOut(amount,TOKENS[from],{blockTag:block}));
   return BigInt((await q[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:block}))[0]);
  };
  const block1=universe.confirmedBlock,block2=await p.getBlockNumber(),blocks=[block1,block2];
  const rows=[],rejectCounts={};
  for(const loanUsdc of AMOUNTS_USDC)for(const route of selected){
   const PRINCIPAL=BigInt(loanUsdc)*1000000n;
   const row={path:route.path.join('>'),poolAddresses:route.legs.map(x=>x.address),dexes:route.legs.map(x=>x.dex),estimatedSwapFeeBps:route.feeEstimateBps,loanUsdc,quotes:[],qualified:false};
   for(const block of blocks){
    try{
     let out=PRINCIPAL;
     for(let i=0;i<route.legs.length;i++){out=await quote(route.legs[i],route.path[i],route.path[i+1],out,block);if(out<=0n)throw Error('NON_POSITIVE_OUTPUT')}
     const pay=(PRINCIPAL*premium+9999n)/10000n,profit=out-PRINCIPAL-pay;
     row.quotes.push({block,ok:true,returnedUsdcRaw:out.toString(),afterAaveBeforeGasRaw:profit.toString(),grossSpreadGreaterThanHalfPercent:(out-PRINCIPAL)*10000n>PRINCIPAL*50n});
    }catch(e){row.quotes.push({block,ok:false,error:String(e?.shortMessage||e?.code||e?.message||e).slice(0,90)})}
   }
   row.reason=row.quotes.some(x=>!x.ok)?'QUOTE_FAILED':row.quotes.some(x=>BigInt(x.afterAaveBeforeGasRaw)<=0n)?'NONPOSITIVE_AFTER_AAVE':row.quotes.some(x=>!x.grossSpreadGreaterThanHalfPercent)?'SPREAD_BELOW_THRESHOLD':block1===block2?'NO_DISTINCT_SNAPSHOTS':'UNVERIFIED_EXECUTION_COSTS_AND_ATOMIC_SETTLEMENT';
   rejectCounts[row.reason]=(rejectCounts[row.reason]||0)+1;
   rows.push(row);
  }
  const possible=rows.filter(x=>x.reason==='UNVERIFIED_EXECUTION_COSTS_AND_ATOMIC_SETTLEMENT');
  const resultsByAmount=Object.fromEntries(AMOUNTS_USDC.map(amount=>{
   const subset=rows.filter(x=>x.loanUsdc===amount),rejectionCounts={};
   for(const v of subset)rejectionCounts[v.reason]=(rejectionCounts[v.reason]||0)+1;
   return [String(amount),{routesTested:subset.length,rejectionCounts,preGasCandidates:subset.filter(x=>x.reason==='UNVERIFIED_EXECUTION_COSTS_AND_ATOMIC_SETTLEMENT').length,
    bestBeforeGas:subset.filter(x=>x.quotes.every(q=>q.ok)).map(x=>({path:x.path,pools:x.poolAddresses,lowestProfitRaw:x.quotes.map(q=>BigInt(q.afterAaveBeforeGasRaw)).reduce((a,b)=>a<b?a:b).toString()})).sort((a,b)=>BigInt(a.lowestProfitRaw)>BigInt(b.lowestProfitRaw)?-1:BigInt(a.lowestProfitRaw)<BigInt(b.lowestProfitRaw)?1:0).slice(0,3)}]
  }));
  return {success:true,build:'12.9.45',mode:'TWO_AMOUNT_FEE_PRIORITIZED_ROUTE_SCREEN',loanAmountsUsdc:AMOUNTS_USDC,resultsByAmount,discoveredPools:universe.uniqueActivePools,routesEnumerated:routes.length,routesSelected:selected.length,routeAmountTests:rows.length,selectionBudget:MAX,snapshotBlocks:blocks,distinctSnapshotBlocks:block1!==block2,rejectionCounts:rejectCounts,preGasCandidates:possible.length,candidates:possible.slice(0,10),qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,warning:'STATIC_FEE_RANK_NOT_PROFIT_RANK; PRE_GAS_ONLY; NO_FORK_SETTLEMENT'};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.deepEqual(AMOUNTS_USDC,[25000,35000]);assert.equal(pair('USDC','WETH'),'USDC/WETH');
 const dummy=[{pair:'USDC/WETH',address:'a',dex:'A',kind:'v3',poolConfig:100},{pair:'USDC/WETH',address:'b',dex:'B',kind:'v3',poolConfig:500}];
 assert.equal(createCandidates(dummy).length,2);
 console.log(JSON.stringify({build:'12.9.45',unitAssertionsPassed:3}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('ROUTE_PRIORITY_12945_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,160));process.exitCode=1});
}
module.exports={run,createCandidates,pair};
