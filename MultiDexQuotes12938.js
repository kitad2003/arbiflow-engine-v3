'use strict';
// 12.9.38 Base read-only four-venue USDC/WETH exact-input route search.
// Quotes are INDICATIVE ONLY; all alerts and mainnet execution disabled.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {LOANS}=require('./MultiPoolDiscovery12935');
const {evaluate}=require('./CrossDexQuotes12936');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const UNI='0x222ca98f00ed15b1fae10b61c277703a194cf5d2';
const SLIP='0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0';
const AERO_F='0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const CAKE_F='0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const CAKE_Q='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
const venues=['UNI_V3_500','AERO_SLIP_100','AERO_V1_VOLATILE','PANCAKE_V3_500'];
const uniAbi=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const slipAbi=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const cakeAbi=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
function pairs(vs){return vs.flatMap(a=>vs.filter(b=>a!==b).map(b=>({buy:a,sell:b})))}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const block=await p.getBlockNumber();
  const pool=new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p);
  const bps=Number(await pool.FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const aeroFactory=new ethers.Contract(AERO_F,['function getPool(address,address,bool) view returns(address)'],p);
  const cakeFactory=new ethers.Contract(CAKE_F,['function getPool(address,address,uint24) view returns(address)'],p);
  const [aeroAddress,cakeAddress]=await Promise.all([aeroFactory.getPool(USDC,WETH,false,{blockTag:block}),cakeFactory.getPool(USDC,WETH,500,{blockTag:block})]);
  const enabled={UNI_V3_500:true,AERO_SLIP_100:true,AERO_V1_VOLATILE:false,PANCAKE_V3_500:false};
  if(aeroAddress!==ethers.ZeroAddress&&await p.getCode(aeroAddress,block)!=='0x'){
   const c=new ethers.Contract(aeroAddress,['function getReserves() view returns(uint256,uint256,uint256)'],p);
   try{const res=await c.getReserves({blockTag:block});enabled.AERO_V1_VOLATILE=res[0]>0n&&res[1]>0n}catch{}
  }
  if(cakeAddress!==ethers.ZeroAddress&&await p.getCode(cakeAddress,block)!=='0x'&&await p.getCode(CAKE_Q,block)!=='0x'){
   const c=new ethers.Contract(cakeAddress,['function liquidity() view returns(uint128)'],p);
   try{enabled.PANCAKE_V3_500=await c.liquidity({blockTag:block})>0n}catch{}
  }
  const uni=new ethers.Contract(UNI,uniAbi,p),slip=new ethers.Contract(SLIP,slipAbi,p),cake=new ethers.Contract(CAKE_Q,cakeAbi,p);
  const aero=aeroAddress!==ethers.ZeroAddress?new ethers.Contract(aeroAddress,['function getAmountOut(uint256,address) view returns(uint256)'],p):null;
  const quote=async(v,from,to,amount)=>{
   if(!enabled[v])throw Error('VENUE_POOL_UNAVAILABLE');
   if(v==='UNI_V3_500')return BigInt((await uni.quoteExactInputSingle.staticCall([from,to,amount,500,0],{blockTag:block}))[0]);
   if(v==='AERO_SLIP_100')return BigInt((await slip.quoteExactInputSingle.staticCall([from,to,amount,100,0],{blockTag:block}))[0]);
   if(v==='PANCAKE_V3_500')return BigInt((await cake.quoteExactInputSingle.staticCall([from,to,amount,500,0],{blockTag:block}))[0]);
   return BigInt(await aero.getAmountOut(amount,from,{blockTag:block}));
  };
  const rows=[];
  for(const amount of LOANS)for(const route of pairs(venues)){
   const row={loanUsdc:amount,buyVenue:route.buy,sellVenue:route.sell,blockNumber:block,quotesObtained:false,qualified:false,alerts:[],blockedReasons:[]};
   try{
    const weth=await quote(route.buy,USDC,WETH,BigInt(amount)*1000000n);
    const usdc=await quote(route.sell,WETH,USDC,weth);
    row.wethRaw=weth.toString();row.returnedUsdcRaw=usdc.toString();row.quotesObtained=true;Object.assign(row,evaluate(amount,usdc,bps));
    if(!row.positiveAfterAaveBeforeGas)row.blockedReasons.push('NEGATIVE_AFTER_AAVE_PREMIUM');
    if(!row.spreadGreaterThanHalfPercent)row.blockedReasons.push('SPREAD_NOT_GREATER_THAN_0_5_PERCENT');
   }catch(err){row.blockedReasons.push('QUOTE_UNAVAILABLE');row.quoteError=String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,90)}
   row.blockedReasons.push('FLASH_LOAN_LIQUIDITY_UNVERIFIED','GAS_L1_SLIPPAGE_UNVERIFIED','ATOMIC_SETTLEMENT_UNVERIFIED','RISK_UNVERIFIED');
   rows.push(row);
  }
  const promising=rows.filter(x=>x.quotesObtained&&x.positiveAfterAaveBeforeGas&&x.spreadGreaterThanHalfPercent).sort((a,b)=>{const d=BigInt(a.afterAaveBeforeGasRaw)-BigInt(b.afterAaveBeforeGasRaw);return d>0n?-1:d<0n?1:0});
  return {success:true,build:'12.9.38',mode:'BASE_FOUR_VENUE_PINNED_BLOCK_INDICATIVE_COMPARISON',blockNumber:block,enabledVenues:enabled,aeroPoolAddress:aeroAddress,pancakePoolAddress:cakeAddress,attemptedRoutes:rows.length,quotedRoutes:rows.filter(r=>r.quotesObtained).length,promisingBeforeGas:promising.length,topPreGasCandidates:promising.slice(0,10),rows,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(pairs(venues).length,12);assert.equal(LOANS.length,7);assert.equal(pairs(venues).length*LOANS.length,84);
 console.log(JSON.stringify({success:true,build:'12.9.38',unitAssertionsPassed:3,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).then(x=>{console.log(JSON.stringify(x));if(!x.quotedRoutes)process.exitCode=1}).catch(e=>{console.error('MULTI_DEX_12938_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,160));process.exitCode=1});
}
module.exports={run,pairs};
