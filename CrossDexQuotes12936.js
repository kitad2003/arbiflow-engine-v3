'use strict';
// 12.9.36 read-only, pinned-block cross-pool exact-size indicative quote comparison.
// All opportunities remain NON-QUALIFIED until atomic settlement, costs and risk proven.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {FEES,LOANS}=require('./MultiPoolDiscovery12935');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const U='0x222ca98f00ed15b1fae10b61c277703a194cf5d2',A='0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0';
const ua=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const aa=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const routes=FEES.flatMap(f=>[{first:'UNI',second:'AERO',feeTier:f,tickSpacing:100},{first:'AERO',second:'UNI',feeTier:f,tickSpacing:100}]);
function evaluate(loanUsdc,receivedRaw,bps){
 const principal=BigInt(loanUsdc)*1000000n,fee=(principal*BigInt(bps)+9999n)/10000n,gross=BigInt(receivedRaw)-principal,after=gross-fee;
 return {grossUsdcRaw:gross.toString(),aavePremiumRaw:fee.toString(),afterAaveBeforeGasRaw:after.toString(),spreadGreaterThanHalfPercent:gross*10000n>principal*50n,positiveAfterAaveBeforeGas:after>0n};
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const block=await p.getBlockNumber();
  const pool=new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p);
  const bps=Number(await pool.FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const uni=new ethers.Contract(U,ua,p),aero=new ethers.Contract(A,aa,p);
  const quote=async(venue,fee,tokenIn,tokenOut,amount)=>{
   const result=venue==='UNI'?await uni.quoteExactInputSingle.staticCall([tokenIn,tokenOut,amount,fee,0],{blockTag:block}):await aero.quoteExactInputSingle.staticCall([tokenIn,tokenOut,amount,100,0],{blockTag:block});
   return BigInt(result[0]);
  };
  const rows=[];
  for(const amount of LOANS)for(const rt of routes){
   const row={loanUsdc:amount,direction:rt.first+'_TO_'+rt.second,uniFeeTier:rt.feeTier,aeroTickSpacing:100,blockNumber:block,quotesObtained:false,qualified:false,alerts:[],blockedReasons:[]};
   try{
    const weth=await quote(rt.first,rt.feeTier,USDC,WETH,BigInt(amount)*1000000n);
    const usdc=await quote(rt.second,rt.feeTier,WETH,USDC,weth);
    row.wethRaw=weth.toString();row.returnedUsdcRaw=usdc.toString();row.quotesObtained=true;Object.assign(row,evaluate(amount,usdc,bps));
    if(!row.positiveAfterAaveBeforeGas)row.blockedReasons.push('NEGATIVE_AFTER_AAVE_PREMIUM');
    if(!row.spreadGreaterThanHalfPercent)row.blockedReasons.push('SPREAD_NOT_GREATER_THAN_0_5_PERCENT');
   }catch(err){row.blockedReasons.push('QUOTE_UNAVAILABLE');row.quoteError=String(err?.shortMessage||err?.code||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,105);}
   row.blockedReasons.push('FLASH_LOAN_ELIGIBILITY_NOT_PROVEN','ATOMIC_SETTLEMENT_NOT_PROVEN','GAS_L1_SLIPPAGE_NOT_VERIFIED','RISK_NOT_VERIFIED');
   rows.push(row);
  }
  const ranked=rows.filter(x=>x.quotesObtained).sort((a,b)=>{const d=BigInt(a.afterAaveBeforeGasRaw)-BigInt(b.afterAaveBeforeGasRaw);return d>0n?-1:d<0n?1:0}).slice(0,10);
  return {success:true,build:'12.9.36',mode:'PINNED_BASE_CROSS_DEX_MULTITIER_READ_ONLY_QUOTES',blockNumber:block,loanSizesUsdc:LOANS,uniFeeTiers:FEES,attemptedRoutes:rows.length,quotedRoutes:rows.filter(r=>r.quotesObtained).length,positiveAfterPremium:rows.filter(r=>r.positiveAfterAaveBeforeGas).length,indicativeCandidates:ranked,rows,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(routes.length,8);assert.equal(routes.length*LOANS.length,56);
 assert.equal(evaluate(10000,10060000000n,5).spreadGreaterThanHalfPercent,true);
 assert.equal(evaluate(10000,10050000000n,5).spreadGreaterThanHalfPercent,false);
 console.log(JSON.stringify({build:'12.9.36',unitAssertionsPassed:4,attemptedRoutes:56,liveQuotesRun:!!process.env.BASE_RPC_URL,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).then(x=>{console.log(JSON.stringify(x));if(x.quotedRoutes===0)process.exitCode=1}).catch(e=>{console.error('MULTI_TIER_COMPARISON_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,evaluate};
