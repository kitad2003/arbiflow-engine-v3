'use strict';
// New research-only Aave flash loan capacity and exact premium cost screening.
// Principal is discovered as fractions of current observed reserve liquidity, never a required user deposit.
const {ethers}=require('ethers');
const {feeFor}=require('./ResearchAaveBaseFlashLoan');
function screen(report){
 if(report?.chainId!==8453||!Number.isInteger(report.premiumBps))throw Error('VERIFIED_BASE_AAVE_REPORT_REQUIRED');
 const candidates=[];
 for(const r of report.reserves||[]){
  if(!r.eligibleForFurtherFlashLoanTesting)continue;
  const liquidity=BigInt(r.availableUnderlyingRaw),decimals=Number(r.decimals);
  if(liquidity<=0n||!Number.isInteger(decimals))continue;
  // Screening probes only; never imply borrowability or optimal execution size.
  for(const fractionBps of [1n,10n,100n]){
   const principal=liquidity*fractionBps/10000n;
   if(principal===0n)continue;
   const fee=feeFor(principal,BigInt(report.premiumBps));
   candidates.push({asset:r.asset,symbol:r.symbol,liquidityFractionBps:Number(fractionBps),
    principalRaw:principal.toString(),principal:ethers.formatUnits(principal,decimals),
    feeRaw:fee.toString(),fee:ethers.formatUnits(fee,decimals),
    repaymentRaw:(principal+fee).toString(),repayment:ethers.formatUnits(principal+fee,decimals),
    availableLiquidityObserved:true,borrowabilityVerified:false,gasVerified:false,
    dexQuotesVerified:false,atomicForkPassed:false,positiveNetVerified:false,executionEligible:false});
  }
 }
 return {build:'RESEARCH_ONLY_AAVE_2',mode:'AAVE_RESERVE_FRACTION_COST_SCREEN',premiumBps:report.premiumBps,
  testedSizes:candidates.length,candidates,qualified:0,alerts:[],executionEligible:false,
  limitations:['ILLUSTRATIVE_FRACTIONS_NOT_OPTIMAL_LOAN_AMOUNTS','LIQUIDITY_MAY_CHANGE',
   'NO_TRANSACTION_SIMULATION','NO_DEX_QUOTES','NO_GAS_COST','NO_NET_PROFIT_VERIFICATION']};
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const r=screen({chainId:8453,premiumBps:5,reserves:[{eligibleForFurtherFlashLoanTesting:true,
  symbol:'USDC',asset:'0x'+'1'.repeat(40),decimals:6,availableUnderlyingRaw:'1000000000'}]});
 assert.equal(r.testedSizes,3);assert.equal(r.candidates[0].feeRaw,'50');
 assert.equal(r.candidates.every(x=>x.executionEligible===false),true);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_AAVE_2',unitAssertionsPassed:3}));
}
module.exports={screen};
