'use strict';
// Build 12.9.42: three-swap USDC loops, same-block read-only indicative quotes.
// These are NOT executable atomic paths. Fail closed: no dashboard alerts / no mainnet sends.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const UNI='0x222ca98f00ed15b1fae10b61c277703a194cf5d2';
const CAKE='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const LOANS=[10000,25000,50000,100000]; // admission at 10k; higher sizes optional, not a minimum
const TRIANGLES=[['WETH','AERO'],['WETH','VIRTUAL'],['WETH','cbBTC'],['WETH','USDT'],['USDT','WETH'],['AERO','WETH'],['VIRTUAL','WETH'],['cbBTC','WETH']];
function edge(a,b){return [a,b].sort((x,y)=>Object.keys(TOKENS).indexOf(x)-Object.keys(TOKENS).indexOf(y)).join('/')}
function distinct(pools){return new Set(pools.map(p=>p.address.toLowerCase())).size===pools.length}
function eligibility(row){return row.spreadGreaterThanHalfPercent&&row.afterAavePositive&&false}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 const universe=await discover(rpc);
 assert(universe.success,'AT_LEAST_20_DISCOVERED_POOLS_REQUIRED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await provider.send('eth_chainId',[])),8453n);
  const block=universe.confirmedBlock;
  const qs={UNISWAP_V3:new ethers.Contract(UNI,ABI,provider),PANCAKESWAP_V3:new ethers.Contract(CAKE,ABI,provider)};
  const aave=new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider);
  const fee=BigInt(await aave.FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const byPair=new Map();
  for(const p of universe.pools){
   if(!byPair.has(p.pair))byPair.set(p.pair,[]);
   byPair.get(p.pair).push(p);
  }
  const quotation=async(pool,from,to,amount)=>{
   if(pool.kind==='v1')return BigInt(await new ethers.Contract(pool.address,V1,provider).getAmountOut(amount,TOKENS[from],{blockTag:block}));
   return BigInt((await qs[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:block}))[0]);
  };
  // Discover a complete triangle first. Test up to two pools per edge; prevents explosive RPC calls.
  const triangles=[],skipped=[];
  for(const [a,b] of TRIANGLES){
   const names=['USDC',a,b,'USDC'],legs=[];
   for(let i=0;i<3;i++)legs.push((byPair.get(edge(names[i],names[i+1]))||[]).slice(0,2));
   if(legs.some(l=>l.length===0)){skipped.push({route:names.join('>'),reason:'POOL_EDGE_MISSING'});continue}
   triangles.push({names,legs});
  }
  const rows=[];
  for(const tr of triangles)for(const loan of LOANS)for(const x of tr.legs[0])for(const y of tr.legs[1])for(const z of tr.legs[2]){
   const pools=[x,y,z],row={path:tr.names.join('>'),loanUsdc:loan,block,poolAddresses:pools.map(p=>p.address),dexSequence:pools.map(p=>p.dex),quotesComplete:false,qualified:false};
   if(!distinct(pools)){row.reason='POOL_REUSE';rows.push(row);continue}
   try{
    let amount=BigInt(loan)*1000000n;
    for(let i=0;i<3;i++){
     amount=await quotation(pools[i],tr.names[i],tr.names[i+1],amount);
     if(amount<=0n)throw Error('ZERO_OR_NEGATIVE_RETURN');
    }
    const initial=BigInt(loan)*1000000n,premium=(initial*fee+9999n)/10000n,gross=amount-initial,after=gross-premium;
    Object.assign(row,{quotesComplete:true,returnedUsdcRaw:amount.toString(),grossUsdcRaw:gross.toString(),aavePremiumRaw:premium.toString(),afterAaveBeforeGasRaw:after.toString(),spreadGreaterThanHalfPercent:gross*10000n>initial*50n,afterAavePositive:after>0n});
   }catch(e){row.reason='QUOTE_FAILED';row.error=String(e?.shortMessage||e?.code||e?.message||e).slice(0,75)}
   row.blockedReasons=['NO_ATOMIC_FORK_SETTLEMENT','GAS_L1_SLIPPAGE_NOT_VERIFIED','RISK_NOT_VERIFIED','DEPTH_NOT_VERIFIED_FOR_EACH_LEG'];
   rows.push(row);
  }
  const positive=rows.filter(x=>x.quotesComplete&&x.afterAavePositive&&x.spreadGreaterThanHalfPercent).sort((a,b)=>{const diff=BigInt(a.afterAaveBeforeGasRaw)-BigInt(b.afterAaveBeforeGasRaw);return diff>0n?-1:diff<0n?1:0});
  return {success:true,build:'12.9.42',mode:'PINNED_BLOCK_THREE_LEG_READ_ONLY_EXPLORATION',block,discoveredPools:universe.uniqueActivePools,triangleTemplates:TRIANGLES.length,completeTriangles:triangles.length,skippedTriangles:skipped,threeLegRoutesAttempted:rows.length,fullQuoteRoutes:rows.filter(r=>r.quotesComplete).length,positiveAfterAaveBeforeGas:positive.length,topPreGasCandidates:positive.slice(0,10),rowsSummaryByPath:Object.fromEntries(triangles.map(t=>{const name=t.names.join('>'),v=rows.filter(r=>r.path===name);return [name,{attempted:v.length,complete:v.filter(r=>r.quotesComplete).length,positivePreGas:v.filter(r=>r.afterAavePositive).length}]})),qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,notice:'PRE_GAS_INDICATIVE_ONLY; candidate does not imply executable profit'};
 }finally{provider.destroy()}
}
if(require.main===module){
 assert.equal(LOANS[0],10000);assert.equal(TRIANGLES.length,8);assert.equal(edge('USDC','WETH'),'USDC/WETH');assert(!eligibility({spreadGreaterThanHalfPercent:true,afterAavePositive:true}));
 console.log(JSON.stringify({build:'12.9.42',unitAssertionsPassed:4}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_MISSING');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('THREE_LEG_12942_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,edge,TRIANGLES};
