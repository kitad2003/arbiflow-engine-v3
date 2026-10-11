'use strict';
const assert=require('node:assert/strict');
const {calculate}=require('./LargeLoanQuotes12927');
function diagnose(rows){
 assert(Array.isArray(rows),'ROWS_REQUIRED');
 const quoted=rows.filter(r=>r.quoted===true);
 const pairs=new Set(rows.map(r=>r.tokenPair||'USDC/WETH'));
 const configurations=new Set(rows.map(r=>r.venueConfiguration||r.direction||'UNKNOWN'));
 const positive=quoted.filter(r=>BigInt(r.afterPremiumBeforeGasRaw||'0')>0n);
 const quoteFailures=rows.filter(r=>r.blockedReasons?.includes('QUOTE_FAILED'));
 const blocked={};
 for(const row of rows)for(const reason of row.blockedReasons||[])blocked[reason]=(blocked[reason]||0)+1;
 return {mode:'READ_ONLY_COVERAGE_DIAGNOSTICS',rows:rows.length,quoted:quoted.length,
  distinctPairs:pairs.size,venueConfigurations:configurations.size,
  positiveAfterPremiumBeforeGas:positive.length,quoteFailures:quoteFailures.length,
  reasons:blocked,discoveryComplete:false,netProfitVerified:false,
  qualified:0,alerts:[],executionEligible:false,mainnetBroadcast:false};
}
if(require.main===module){
 const rows=[{quoted:true,direction:'UNI_TO_AERO',afterPremiumBeforeGasRaw:'-100',blockedReasons:['NO_POSITIVE_RETURN_AFTER_LOAN_PREMIUM']},{quoted:false,direction:'AERO_TO_UNI',blockedReasons:['QUOTE_FAILED']}];
 const d=diagnose(rows);
 assert.equal(d.distinctPairs,1);assert.equal(d.quoteFailures,1);
 assert.equal(d.positiveAfterPremiumBeforeGas,0);assert.equal(d.qualified,0);
 assert.equal(calculate(10000,10050000001n,5).spreadMetricMeaning,'EXECUTABLE_ROUND_TRIP_RETURN_NOT_SPOT_PRICE_DISCREPANCY');
 console.log('BASE_QUOTE_COVERAGE_DIAGNOSTICS_V1_TEST_PASS');
}
module.exports={diagnose};
