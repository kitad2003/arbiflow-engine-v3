'use strict';
// Research-only atomic fork readiness. No broadcast or permission to execute.
function gate(reserve,cost){
 const errors=[];
 if(reserve?.chainId!==8453||reserve?.mode!=='AAVE_V3_FLASHLOAN_READ_ONLY_RESERVE_CHECK')errors.push('AAVE_BASE_REPORT_MISSING');
 if(cost?.mode!=='AAVE_RESERVE_FRACTION_COST_SCREEN'||cost?.premiumBps!==reserve?.premiumBps)errors.push('COST_SCREEN_MISSING_OR_PREMIUM_MISMATCH');
 const assets=new Map((reserve?.reserves||[]).map(x=>[String(x.asset).toLowerCase(),x]));
 let valid=0;
 for(const c of cost?.candidates||[]){
  const asset=assets.get(String(c.asset).toLowerCase());
  if(!asset?.eligibleForFurtherFlashLoanTesting){errors.push('INELIGIBLE_RESERVE');continue}
  try{
   const p=BigInt(c.principalRaw),f=BigInt(c.feeRaw),r=BigInt(c.repaymentRaw),liq=BigInt(asset.availableUnderlyingRaw);
   if(p<=0n||p>liq||r!==p+f||f!==(p*BigInt(reserve.premiumBps)+5000n)/10000n)errors.push('PREMIUM_OR_REPAYMENT_MISMATCH');
   else valid++;
  }catch{errors.push('INVALID_RAW_AMOUNT')}
 }
 if(valid===0)errors.push('NO_VALID_COST_CANDIDATES');
 return {build:'RESEARCH_ONLY_AAVE_3',mode:'ATOMIC_FORK_PREREQUISITE_GATE',
  loanCostCandidatesValidated:valid,errors:[...new Set(errors)],
  readyToDevelopForkTest:errors.length===0,
  atomicForkPassed:false,swapQuotesVerified:false,repaymentTestPassed:false,gasVerified:false,
  netProfitVerified:false,qualified:0,alerts:[],executionEligible:false,mainnetBroadcast:false,
  requiredNextEvidence:['ATOMIC_AAVE_FLASHLOAN_CALLBACK_ON_BASE_FORK','REAL_VENUE_TRADE_SIZE_QUOTES','FULL_PRINCIPAL_PLUS_PREMIUM_REPAYMENT','ACTUAL_FORK_GAS_COST','POSITIVE_NET_AFTER_ALL_COSTS']};
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const reserve={chainId:8453,mode:'AAVE_V3_FLASHLOAN_READ_ONLY_RESERVE_CHECK',premiumBps:5,
  reserves:[{asset:'0x'+'1'.repeat(40),eligibleForFurtherFlashLoanTesting:true,availableUnderlyingRaw:'10000000'}]};
 const cost={mode:'AAVE_RESERVE_FRACTION_COST_SCREEN',premiumBps:5,
  candidates:[{asset:'0x'+'1'.repeat(40),principalRaw:'1000000',feeRaw:'500',repaymentRaw:'1000500'}]};
 const pass=gate(reserve,cost);
 assert.equal(pass.readyToDevelopForkTest,true);assert.equal(pass.executionEligible,false);
 cost.candidates[0].feeRaw='499';assert.equal(gate(reserve,cost).readyToDevelopForkTest,false);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_AAVE_3',unitAssertionsPassed:3}));
}
module.exports={gate};
