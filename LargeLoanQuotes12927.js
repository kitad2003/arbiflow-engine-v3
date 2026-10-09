'use strict';
// 12.9.27. Larger loan PRINCIPAL is Aave-funded, not operator-funded.
// Standalone read-only quote-only scanner; existing production scanner unchanged.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const UNI_QUOTER='0x222ca98f00ed15b1fae10b61c277703a194cf5d2';
const AERO_QUOTER='0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0';
const UNI_ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const AERO_ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const LOANS=[1000,5000,10000,25000,50000];
function calculate(amount,returned,feeBps){
 const principal=BigInt(amount)*1000000n,fee=(principal*BigInt(feeBps)+9999n)/10000n;
 const gross=BigInt(returned)-principal;
 return {grossUsdcRaw:gross.toString(),aavePremiumRaw:fee.toString(),afterPremiumBeforeGasRaw:(gross-fee).toString(),spreadGreaterThanHalfPercent:gross*10000n>principal*50n};
}
async function run(rpcUrl,amounts=LOANS){
 assert(/^https:\/\//.test(rpcUrl||''),'BASE_RPC_REQUIRED');
 assert(amounts.length>=1&&amounts.length<=5&&amounts.every(v=>LOANS.includes(v)),'BAD_LOAN_SIZES');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const block=await p.getBlockNumber();
  const pool=new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)','function getReserveData(address) view returns((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))'],p);
  const [bps,reserve]=await Promise.all([pool.FLASHLOAN_PREMIUM_TOTAL({blockTag:block}),pool.getReserveData(USDC,{blockTag:block})]);
  const usdc=new ethers.Contract(USDC,['function balanceOf(address) view returns(uint256)'],p);
  const liquidity=await usdc.balanceOf(reserve.aTokenAddress,{blockTag:block});
  const quni=new ethers.Contract(UNI_QUOTER,UNI_ABI,p),qaero=new ethers.Contract(AERO_QUOTER,AERO_ABI,p);
  const quote=async(venue,from,to,amount)=>{const q=venue==='UNI'?quni:qaero;const tier=venue==='UNI'?500:100;const raw=await q.quoteExactInputSingle.staticCall([from,to,amount,tier,0],{blockTag:block});return BigInt(raw[0])};
  const rows=[];
  for(const amount of amounts)for(const first of ['UNI','AERO']){
   const size=BigInt(amount)*1000000n,second=first==='UNI'?'AERO':'UNI';
   const row={loanUsdc:amount,direction:first+'_TO_'+second,blockNumber:block,borrowedPrincipalSource:'AAVE_V3',readOnly:true,quoted:false,returnedUsdcRaw:null,aaveLiquidityObservationRaw:liquidity.toString(),liquidityBalanceCoversPrincipal:liquidity>=size,actualFlashLoanAvailabilityProven:false,qualified:false,alerts:[],blockedReasons:[]};
   if(liquidity<size)row.blockedReasons.push('ATOKEN_POOL_BALANCE_BELOW_REQUEST');
   try{
    const weth=await quote(first,USDC,WETH,size);
    const returned=await quote(second,WETH,USDC,weth);
    Object.assign(row,calculate(amount,returned,bps),{wethRaw:weth.toString(),returnedUsdcRaw:returned.toString(),quoted:true});
    if(!row.spreadGreaterThanHalfPercent)row.blockedReasons.push('SPREAD_NOT_ABOVE_0_5_PERCENT');
    if(BigInt(row.afterPremiumBeforeGasRaw)<=0n)row.blockedReasons.push('NO_POSITIVE_RETURN_AFTER_LOAN_PREMIUM');
   }catch(e){row.blockedReasons.push('QUOTE_FAILED');row.quoteError=String(e?.shortMessage||e?.code||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,120)}
   row.blockedReasons.push('FLASH_LOAN_ELIGIBILITY_NOT_PROVEN','GAS_L1_SLIPPAGE_NOT_VERIFIED','ATOMIC_SETTLEMENT_NOT_VERIFIED','RISK_NOT_VERIFIED');
   rows.push(row);
  }
  return {success:true,build:'12.9.27',mode:'BASE_PINNED_BLOCK_MULTI_SIZE_INDICATIVE_QUOTES',blockNumber:block,loanSizesUsdc:amounts,aavePremiumBps:Number(bps),rows,quotedRoutes:rows.filter(r=>r.quoted).length,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy();}
}
if(require.main===module){
 assert.equal(calculate(1000,1005000000n,5).spreadGreaterThanHalfPercent,false);
 assert.equal(calculate(1000,1005000001n,5).spreadGreaterThanHalfPercent,true);
 assert.equal(calculate(50000,49990000000n,5).afterPremiumBeforeGasRaw,'-35000000');
 console.log(JSON.stringify({success:true,build:'12.9.27',unitAssertionsPassed:3,loanSizesUsdc:LOANS,liveQuotesRun:false,qualified:0,alerts:[],mainnetBroadcast:false}));
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).then(x=>{console.log(JSON.stringify(x));if(x.quotedRoutes===0)process.exitCode=1}).catch(e=>{console.error('LARGE_LOAN_QUOTES_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,260));process.exitCode=1});
}
module.exports={run,calculate};
