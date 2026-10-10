'use strict';
// Base fork, read-only QuoterV2 diagnostic. Detect loss before attempting Aave repayment.
const hre=require('hardhat'),fs=require('node:fs');
const {ethers}=hre;
const QUOTER='0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'];
async function main(){
 const report=JSON.parse(fs.readFileSync('arbiflow-aave-read-only.json','utf8'));
 const usdc=report.reserves.find(r=>r.symbol==='USDC'),weth=report.reserves.find(r=>r.symbol==='WETH');
 if(!usdc?.eligibleForFurtherFlashLoanTesting||!weth?.eligibleForFurtherFlashLoanTesting)throw Error('AAVE_RESERVES_NOT_VERIFIED');
 const q=new ethers.Contract(QUOTER,ABI,ethers.provider),amount=ethers.parseUnits('100',6);
 const fee=(amount*BigInt(report.premiumBps)+5000n)/10000n;
 const result={build:'RESEARCH_ONLY_AAVE_5_QUOTES',mode:'FORK_TWO_LEG_EXECUTABLE_SIZE_QUOTE',
  amountInRaw:amount.toString(),aaveFeeRaw:fee.toString(),debtRaw:(amount+fee).toString(),
  quoter:QUOTER,firstFeeTier:500,secondFeeTier:3000,
  firstLeg:null,secondLeg:null,expectedSurplusRaw:null,repaymentFeasibleFromQuotes:false,
  transactionExecuted:false,profitVerified:false,mainnetBroadcast:false,executionEligible:false};
 try{
  const one=await q.quoteExactInputSingle.staticCall([usdc.asset,weth.asset,amount,500,0]);
  result.firstLeg={amountOutRaw:one[0].toString(),gasEstimate:one[3].toString()};
  const two=await q.quoteExactInputSingle.staticCall([weth.asset,usdc.asset,one[0],3000,0]);
  result.secondLeg={amountOutRaw:two[0].toString(),gasEstimate:two[3].toString()};
  const difference=BigInt(two[0])-(amount+fee);
  result.expectedSurplusRaw=difference.toString();
  result.repaymentFeasibleFromQuotes=difference>=0n;
  result.estimatedOutcome=difference<0n?'INSUFFICIENT_REPAYMENT_FROM_QUOTES':'REPAYMENT_POSSIBLE_GAS_UNVERIFIED';
 }catch(e){result.quoteError=String(e.shortMessage||e.reason||e.message||e).slice(0,350);result.estimatedOutcome='QUOTE_FAILED'}
 fs.writeFileSync('arbiflow-aave-two-swap-quotes.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error('AAVE5_QUOTE_DIAGNOSTIC_FAILED',String(e.message||e).slice(0,240));process.exitCode=1});
