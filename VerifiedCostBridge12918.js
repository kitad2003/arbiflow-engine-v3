'use strict';
// 12.9.18: enforce provenance when connecting fork diagnostics to 12.9.17.
// No fork probe, reverted trace, or predicted fees can be marked settled/verified.
const assert=require('node:assert/strict');
const {evaluate}=require('./NetProfitGate12917');
function normalize(input){
 const x=input||{},reasons=[];
 if(x.sourceMode!=='MAINNET_SETTLED_RECEIPT')reasons.push('NOT_MAINNET_SETTLED_RECEIPT');
 if(x.receiptStatus!==1)reasons.push('NO_SUCCESSFUL_RECEIPT');
 if(x.aaveRepaymentEvidenceVerified!==true)reasons.push('AAVE_REPAYMENT_NOT_VERIFIED');
 if(x.dexSwapEvidenceVerified!==true)reasons.push('BOTH_SWAPS_NOT_VERIFIED');
 if(x.l1CostReceiptVerified!==true)reasons.push('L1_COST_NOT_RECEIPT_VERIFIED');
 if(x.gasCostReceiptVerified!==true)reasons.push('GAS_COST_NOT_RECEIPT_VERIFIED');
 if(x.oracleConversionVerified!==true)reasons.push('ETH_USDC_CONVERSION_NOT_VERIFIED');
 if(x.slippageBufferVerified!==true)reasons.push('SLIPPAGE_BUFFER_NOT_VERIFIED');
 if(x.blockQuoteFreshnessVerified!==true)reasons.push('SAME_BLOCK_QUOTE_NOT_VERIFIED');
 if(x.riskSourceVerified!==true)reasons.push('RISK_SOURCE_NOT_VERIFIED');
 const eligible=reasons.length===0;
 const row={...x,atomicSettlementVerified:eligible,freshSameBlockQuotesVerified:eligible&&x.blockQuoteFreshnessVerified===true,costSourcesVerified:eligible};
 const gate=evaluate(row);
 return {qualified:eligible&&gate.qualified,reasons:[...reasons,...gate.reasons],netProfitUsdcRaw:eligible?gate.netProfitUsdcRaw:null,spreadBps:eligible?gate.spreadBps:null,alert:eligible?gate.alert:null,sourceMode:x.sourceMode||'UNSPECIFIED',readOnly:true,mainnetBroadcast:false};
}
if(require.main===module){
 const common={principalRaw:'1000000000',returnedRaw:'1020000000',premiumRaw:'500000',executionGasUsdcRaw:'1000000',l1FeeUsdcRaw:'500000',slippageReserveUsdcRaw:'2000000',risk:'LOW',direction:'UNI_TO_AERO'};
 const checks=[
  ['reverted-fork-probe',{...common,sourceMode:'FORK_REVERTED_ATOMIC_PROBE',receiptStatus:0}],
  ['successful-fork-receipt',{...common,sourceMode:'FORK_SIMULATED_RECEIPT',receiptStatus:1}],
  ['missing-cost-conversion',{...common,sourceMode:'MAINNET_SETTLED_RECEIPT',receiptStatus:1,aaveRepaymentEvidenceVerified:true,dexSwapEvidenceVerified:true,l1CostReceiptVerified:true,gasCostReceiptVerified:true,oracleConversionVerified:false,slippageBufferVerified:true,blockQuoteFreshnessVerified:true,riskSourceVerified:true}],
  ['missing-proof',{...common,sourceMode:'MAINNET_SETTLED_RECEIPT',receiptStatus:1,aaveRepaymentEvidenceVerified:false,dexSwapEvidenceVerified:true,l1CostReceiptVerified:true,gasCostReceiptVerified:true,oracleConversionVerified:true,slippageBufferVerified:true,blockQuoteFreshnessVerified:true,riskSourceVerified:true}]
 ];
 for(const [name,row] of checks){const out=normalize(row);assert.equal(out.qualified,false,name);assert.equal(out.alert,null,name);}
 const synthetic={...common,sourceMode:'MAINNET_SETTLED_RECEIPT',receiptStatus:1,aaveRepaymentEvidenceVerified:true,dexSwapEvidenceVerified:true,l1CostReceiptVerified:true,gasCostReceiptVerified:true,oracleConversionVerified:true,slippageBufferVerified:true,blockQuoteFreshnessVerified:true,riskSourceVerified:true};
 assert.equal(normalize(synthetic).qualified,true,'complete-synthetic-fixture');
 // The positive test above is purely synthetic, not a permission to enable execution.
 console.log(JSON.stringify({success:true,build:'12.9.18',testsPassed:checks.length+1,positiveCaseSynthetic:true,liveProofsProcessed:0,qualifiedLiveOpportunities:0,alerts:[],mainnetBroadcast:false,executionEligible:false}));
}
module.exports={normalize};
