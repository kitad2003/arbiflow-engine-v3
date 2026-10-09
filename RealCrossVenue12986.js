'use strict';
// Pinned Base USDC/WETH executable quote comparison: Uniswap V3 vs Aerodrome Slipstream.
// Read-only. Optimizes quote size, with no fictional opportunities or mainnet orders.
const assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const U='0x222ca98f00ed15b1fae10b61c277703a194cf5d2',A='0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const FEE_TIERS=[100,500,3000,10000],SIZES=[100,150,250,350,500,700,1000,1500,2000,3000,5000,7500,10000];
function err(e){return String(e?.shortMessage||e?.reason||e?.code||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC_URL]').slice(0,160)}
async function main(){
 const url=process.env.BASE_RPC_URL;assert(/^https:\/\//.test(url||''),'BASE_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(url,8453,{staticNetwork:true});
 const output={build:'12.9.86',mode:'PINNED_BASE_CROSS_VENUE_USDC_WETH_SIZE_OPTIMIZATION',status:'BLOCKED',
  chainId:8453,pair:'USDC/WETH',venues:['UNISWAP_V3','AERODROME_SLIPSTREAM'],sizesUsdc:SIZES,
  attempts:0,completed:0,failures:0,positiveBeforeGas:0,quotes:[],errors:[],qualified:0,alerts:[],
  forkAtomicExecutionVerified:false,netProfitVerified:false,readOnly:true,mainnetBroadcast:false,executionEligible:false,fundsMovedOnMainnet:false};
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const block=await p.getBlockNumber();output.block=block;
  const uni=new ethers.Contract(U,['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'],p);
  const aero=new ethers.Contract(A,['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'],p);
  const lender=new ethers.Contract(POOL,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p);
  const bps=BigInt(await lender.FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));output.flashFeeBps=bps.toString();
  const qu=async(v,tokenIn,tokenOut,amount,fee)=>{const args=[tokenIn,tokenOut,amount,v==='UNI'?fee:100,0];return (v==='UNI'?await uni.quoteExactInputSingle.staticCall(args,{blockTag:block}):await aero.quoteExactInputSingle.staticCall(args,{blockTag:block}))[0]};
  for(const fee of FEE_TIERS)for(const dir of [['UNI','AERO'],['AERO','UNI']])for(const size of SIZES){
   output.attempts++;
   try{
    const principal=BigInt(size)*1000000n,mid=await qu(dir[0],USDC,WETH,principal,fee),back=await qu(dir[1],WETH,USDC,mid,fee);
    const flashFee=(principal*bps+9999n)/10000n,after=back-principal-flashFee;
    const row={first:dir[0],second:dir[1],uniFeeTier:fee,aeroTickSpacing:100,sizeUsdc:size,
     wethOutRaw:mid.toString(),returnUsdcRaw:back.toString(),flashFeeUsdcRaw:flashFee.toString(),
     afterFundingBeforeGasRaw:after.toString(),afterFundingBeforeGasUsdc:Number(after)/1e6,
     grossSpreadPct:100*(Number(back)/Number(principal)-1),positiveBeforeGas:after>0n};
    output.completed++;if(after>0n)output.positiveBeforeGas++;output.quotes.push(row);
   }catch(e){output.failures++;if(output.errors.length<16)output.errors.push({direction:dir.join('->'),fee,size,error:err(e)})}
  }
  output.quotes.sort((a,b)=>b.afterFundingBeforeGasUsdc-a.afterFundingBeforeGasUsdc);
  output.bestRoutes=output.quotes.slice(0,12);
  output.bestByDirection=['UNI->AERO','AERO->UNI'].map(d=>({direction:d,best:output.quotes.find(q=>q.first+'->'+q.second===d)||null}));
  // No gas in USDC has been verified; positives here remain indicative, never dashboard-qualified.
  output.status=output.completed?'QUOTE_DISCOVERY_COMPLETE':'NO_EXECUTABLE_QUOTES';
  output.reason=output.positiveBeforeGas?'POSITIVE_PRE_GAS_QUOTES_REQUIRE_GAS_AND_ATOMIC_FORK':'NO_POSITIVE_AFTER_FLASH_FEE_IN_COMPLETED_QUOTES';
  output.limits=['Both swap legs priced at same block; not validated as one atomic execution','No gas conversion or final slip risk','No fork execution in this read-only comparison','Cross-venue availability is not guaranteed by quotes alone'];
 }catch(e){output.status='BLOCKED';output.reason=err(e)}
 finally{p.destroy()}
 fs.writeFileSync('arbiflow-real-cross-venue-12986.json',JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({...output,quotes:undefined,bestRoutes:output.bestRoutes}));
}
main().catch(e=>{console.error('CROSS_VENUE_12986_FAILED',err(e));process.exitCode=1});
