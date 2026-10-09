'use strict';
// 12.9.31 interpret the actual 12.9.30 fork output; never fabricate settlement.
// Input may be captured as JSON from test stdout or explicit on-disk report.
const fs=require('node:fs'),assert=require('node:assert/strict');
function analyze(x){
 if(!x||x.build!=='12.9.30'||!Array.isArray(x.rows))throw Error('ACTUAL_BUILD_12930_RESULT_REQUIRED');
 const rows=x.rows.map(r=>{
  const principal=Number(r.loanUsdc),settled=r.forkSettlementSucceeded===true,swaps=r.bothSwapsReached===true;
  const gas=/^[0-9]+$/.test(String(r.fullAtomicReceiptGasUsed??''))&&settled?r.fullAtomicReceiptGasUsed:null;
  const rejection=!swaps?'SWAP_PATH_NOT_VERIFIED':!settled?('SETTLEMENT_NOT_COMPLETED_'+(r.revertReason||r.settlementError||'UNKNOWN')):'SETTLEMENT_SUCCEEDED_FORK_ONLY';
  return {loanUsdc:principal,direction:r.direction,bothSwapsReached:swaps,forkSettlementSucceeded:settled,actualSwapReturnUsdcRaw:r.actualReturnRaw??null,gasUsedFromSuccessfulReceipt:gas,revertedDiagnosticGas:r.revertedExecutionTraceGas??null,rejectionOrStatus:rejection,blockedReasons:r.blockedReasons||[],qualified:false};
 });
 const counts={tested:rows.length,bothSwapsReached:rows.filter(r=>r.bothSwapsReached).length,settledOnFork:rows.filter(r=>r.forkSettlementSucceeded).length,successfulReceiptGasRows:rows.filter(r=>r.gasUsedFromSuccessfulReceipt!==null).length};
 const next=counts.settledOnFork>0?'VERIFY_BASE_L1_PRICE_SLIPPAGE_AND_ACTUAL_REPAYMENT_PROOFS':counts.bothSwapsReached>0?'INVESTIGATE_UNPROFITABLE_ROUTES_AND_EXECUTION_PRICE_IMPACT':'INVESTIGATE_CALLBACK_AND_DEX_FAILURE';
 return {success:true,build:'12.9.31',sourceBuild:'12.9.30',source:'ACTUAL_FORK_TEST_OUTPUT',counts,rows,nextInvestigation:next,verifiedPositiveNetProfit:false,qualified:0,alerts:[],mainnetBroadcast:false,executionEligible:false};
}
if(require.main===module){
 const fixture={build:'12.9.30',rows:[{loanUsdc:1000,direction:'UNI_TO_AERO',bothSwapsReached:true,forkSettlementSucceeded:false,revertReason:'Unprofitable',fullAtomicReceiptGasUsed:null}]};
 const t=analyze(fixture);
 assert.equal(t.counts.tested,1);assert.equal(t.counts.settledOnFork,0);assert.equal(t.rows[0].gasUsedFromSuccessfulReceipt,null);
 console.log(JSON.stringify({success:true,build:'12.9.31',unitAssertionsPassed:3,fixtureOnly:true,actualReportParsed:false,qualified:0,alerts:[]}));
 const file=process.env.ATOMIC_REPORT_PATH;
 if(file){const actual=analyze(JSON.parse(fs.readFileSync(file,'utf8')));assert(actual.counts.tested>0,'EMPTY_ACTUAL_REPORT');console.log('ATOMIC_SETTLEMENT_ANALYSIS '+JSON.stringify(actual));}
}
module.exports={analyze};
