'use strict';
// 12.9.25 isolated integration report. Test/fork evidence NEVER enables live alerts.
const assert=require('node:assert/strict');
const {evaluate}=require('./NetProfitGate12917');
const {normalize}=require('./VerifiedCostBridge12918');
const {calculate}=require('./BaseGasReceipt12922');
const {convert}=require('./EthUsdcGas12923');
function report(rows){
 if(!Array.isArray(rows))throw Error('ROWS_REQUIRED');
 return rows.map(x=>{
  const reasons=[];
  if(x.sourceMode!=='MAINNET_SETTLED_RECEIPT')reasons.push('NOT_SETTLED_MAINNET_EVIDENCE');
  if(x.repaymentProofVerified!==true)reasons.push('LOAN_REPAYMENT_UNVERIFIED');
  if(x.bothSwapLogsVerified!==true)reasons.push('SWAP_EVENTS_UNVERIFIED');
  const gas=x.rawReceipt?calculate(x.rawReceipt):{verified:false,reasons:['RECEIPT_MISSING']};
  const price=x.oracleProof;
  const costs=convert({gas,priceAnswer:price?.answer,priceDecimals:price?.decimals,priceUpdatedAt:price?.updatedAt,receiptBlockTimestamp:x.receiptBlockTimestamp,sourceVerified:price?.verified===true});
  if(!gas.verified)reasons.push(...gas.reasons);
  if(!costs.verified)reasons.push(...costs.reasons);
  // No amount/risk provenance is established merely by supplying numbers.
  if(x.sameBlockQuotesVerified!==true)reasons.push('QUOTES_UNVERIFIED');
  if(x.riskVerified!==true)reasons.push('RISK_UNVERIFIED');
  if(x.slippageVerified!==true)reasons.push('SLIPPAGE_UNVERIFIED');
  const input={principalRaw:x.principalRaw,returnedRaw:x.returnedRaw,premiumRaw:x.premiumRaw,executionGasUsdcRaw:costs.executionGasUsdcRaw,l1FeeUsdcRaw:costs.l1FeeUsdcRaw,slippageReserveUsdcRaw:x.slippageReserveUsdcRaw,risk:x.risk,direction:x.direction,atomicSettlementVerified:reasons.length===0,freshSameBlockQuotesVerified:x.sameBlockQuotesVerified===true,costSourcesVerified:costs.verified&&x.slippageVerified===true};
  const gate=evaluate(input);
  const checked=normalize({...input,sourceMode:x.sourceMode,receiptStatus:x.rawReceipt?.status==='0x1'?1:0,aaveRepaymentEvidenceVerified:x.repaymentProofVerified===true,dexSwapEvidenceVerified:x.bothSwapLogsVerified===true,l1CostReceiptVerified:gas.verified,gasCostReceiptVerified:gas.verified,oracleConversionVerified:costs.verified,slippageBufferVerified:x.slippageVerified===true,blockQuoteFreshnessVerified:x.sameBlockQuotesVerified===true,riskSourceVerified:x.riskVerified===true});
  // Preflight-only report: never emit a live alert or infer settlement from fixture flags.
  return {loanUsdc:x.principalRaw&&/^\d+$/.test(String(x.principalRaw))?(BigInt(x.principalRaw)/1000000n).toString():null,direction:x.direction||null,sourceMode:x.sourceMode||'UNSPECIFIED',gasCostUsdcRaw:costs.totalGasUsdcRaw,estimatedNetUsdcRaw:gate.netProfitUsdcRaw,spreadBps:gate.spreadBps,mathematicalGateWouldPass:gate.qualified,proofGateWouldPass:checked.qualified,qualified:false,alerts:[],blockedReasons:[...new Set([...reasons,...gate.reasons,...checked.reasons,'LIVE_EXECUTION_AND_ALERT_PIPELINE_DISABLED'])]};
 });
}
if(require.main===module){
 const samples=[];
 for(const n of ['1000','10000','50000'])for(const direction of ['UNI_TO_AERO','AERO_TO_UNI'])samples.push({principalRaw:(BigInt(n)*1000000n).toString(),returnedRaw:(BigInt(n)*1005000n).toString(),premiumRaw:(BigInt(n)*500n).toString(),direction,risk:'LOW',sourceMode:'FORK_REVERTED_ATOMIC_PROBE'});
 const results=report(samples);
 assert.equal(results.length,6);
 assert(results.every(r=>r.qualified===false&&r.alerts.length===0));
 assert(results.every(r=>r.blockedReasons.includes('NOT_SETTLED_MAINNET_EVIDENCE')));
 const synthetic=report([{principalRaw:'1000000000',returnedRaw:'1020000000',premiumRaw:'500000',slippageReserveUsdcRaw:'100000',risk:'LOW',direction:'UNI_TO_AERO',sourceMode:'SYNTHETIC',rawReceipt:{status:'0x1',gasUsed:'0x186a0',effectiveGasPrice:'0x3b9aca00',l1Fee:'0x0'},oracleProof:{answer:'300000000000',decimals:8,updatedAt:1000,verified:true},receiptBlockTimestamp:1001,repaymentProofVerified:true,bothSwapLogsVerified:true,sameBlockQuotesVerified:true,riskVerified:true,slippageVerified:true}])[0];
 assert.equal(synthetic.qualified,false);
 console.log(JSON.stringify({success:true,build:'12.9.25',mode:'FAIL_CLOSED_PROFITABILITY_INTEGRATION_REPORT',loanSizesUsdc:['1000','10000','50000'],directions:['UNI_TO_AERO','AERO_TO_UNI'],rows:results,syntheticPositiveCaseNeverAlerts:true,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false}));
}
module.exports={report};
