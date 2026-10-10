'use strict';
// Local-fork-only Aave -> V3 swap -> V3 reverse swap -> Aave repayment probe.
// Uses two fee tiers as a research route, not proof of a cross-DEX opportunity.
const hre=require('hardhat'),fs=require('node:fs');
const {ethers}=hre;
async function main(){
 const reserve=JSON.parse(fs.readFileSync('arbiflow-aave-read-only.json','utf8'));
 const readiness=JSON.parse(fs.readFileSync('arbiflow-aave-fork-readiness.json','utf8'));
 if(!readiness.readyToDevelopForkTest)throw Error('FORK_READINESS_FAILED');
 const usdc=reserve.reserves.find(x=>x.symbol==='USDC'),weth=reserve.reserves.find(x=>x.symbol==='WETH');
 if(!usdc?.eligibleForFurtherFlashLoanTesting||!weth?.eligibleForFurtherFlashLoanTesting)throw Error('RESERVES_NOT_ELIGIBLE');
 const router=process.env.AAVE5_V3_ROUTER||'0x2626664c2603336E57B271c5C0b26F421741e481';
 if((await ethers.provider.getCode(router))==='0x')throw Error('V3_ROUTER_NOT_A_CONTRACT');
 const quotePath='arbiflow-aave-two-swap-quotes.json';
 if(fs.existsSync(quotePath)){
  const quote=JSON.parse(fs.readFileSync(quotePath,'utf8'));
  if(quote.quoteError||!quote.repaymentFeasibleFromQuotes){
   const blocked={build:'RESEARCH_ONLY_AAVE_5',mode:'BASE_FORK_TWO_V3_POOL_ROUND_TRIP',forkOnly:true,
    skippedAtomicAttempt:true,reason:quote.quoteError?'QUOTE_UNAVAILABLE':'QUOTED_RETURN_BELOW_AAVE_REPAYMENT',
    quoteError:quote.quoteError||null,quotedSurplusRaw:quote.expectedSurplusRaw??null,
    borrowAndRepaySucceeded:false,realSwapExecuted:false,premiumPreFunded:false,profitVerified:false,
    qualified:false,mainnetBroadcast:false,executionEligible:false};
   fs.writeFileSync('arbiflow-aave-two-swap-fork.json',JSON.stringify(blocked,null,2)+'\\n');
   console.log(JSON.stringify(blocked));
   return;
  }
 }
 const [operator]=await ethers.getSigners();
 const factory=await ethers.getContractFactory('ResearchAaveTwoSwapReceiver');
 const receiver=await factory.deploy(reserve.pool);await receiver.waitForDeployment();
 const principal=ethers.parseUnits('100',6),fee=(principal*BigInt(reserve.premiumBps)+5000n)/10000n;
 const report={build:'RESEARCH_ONLY_AAVE_5',mode:'BASE_FORK_TWO_V3_POOL_ROUND_TRIP',forkOnly:true,
  router,feeTierOut:500,feeTierBack:3000,principalRaw:principal.toString(),
  expectedAaveFeeRaw:fee.toString(),premiumPreFunded:false,realSwapExecuted:false,
  borrowAndRepaySucceeded:false,netProfitVerified:false,qualified:false,gasUsed:null,
  executionEligible:false,mainnetBroadcast:false,
  limitations:['FEE_TIERS_ARE_RESEARCH_CANDIDATES_NOT_LIQUIDITY_VERIFIED','NOT_A_CROSS_VENUE_PROOF','NO_PRECONFIRMED_STATE_REPLAY','NO_USD_GAS_NET_PROFIT']};
 try{
  // Gas limit makes failure predictable. No minimum-out quote is inferred or claimed.
  const tx=await receiver.request(usdc.asset,weth.asset,principal,router,router,500,3000,1,principal+fee,{gasLimit:6500000});
  const receipt=await tx.wait();
  report.borrowAndRepaySucceeded=receipt?.status===1;
  report.realSwapExecuted=receipt?.status===1;
  report.gasUsed=receipt.gasUsed.toString();
  if(receipt?.status===1)report.limitations.push('ROUND_TRIP_REPAYMENT_PASSED_BUT_GAS_PROFIT_UNVERIFIED');
 }catch(e){
  report.failure=String(e.shortMessage||e.reason||e.message||e).slice(0,400);
  report.limitations.push('ATOMIC_TRANSACTION_REVERTED_NO_LOAN_SETTLED');
 }
 fs.writeFileSync('arbiflow-aave-two-swap-fork.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 // Expected unprofitable round trips are diagnostic, not a CI infrastructure error.
}
main().catch(e=>{console.error('AAVE5_PRECONDITION_FAILED',String(e.message||e).slice(0,250));process.exitCode=1});
