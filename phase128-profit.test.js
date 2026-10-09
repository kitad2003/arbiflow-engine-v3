'use strict';
const assert=require('node:assert/strict');
const {assess}=require('./phase128-profit');
const quotes={build:'12.7.7',blockTag:'0x123',loanSizeUsdc:500,routes:[
 {buyDex:'UNISWAP_V3',sellDex:'AERODROME_SLIPSTREAM',quoteSuccess:true,returnUsdcRaw:'499604094'},
 {buyDex:'AERODROME_SLIPSTREAM',sellDex:'UNISWAP_V3',quoteSuccess:true,returnUsdcRaw:'520000000'}
]};
const aave={success:true,provider:'AAVE_V3',premiumBps:5,reserveConfiguration:{reserveReadEligible:true},liquidityObservation:{readVerified:true,underlyingBalanceRaw:'1000000000'}};
const r=assess(quotes,aave);
assert.equal(r.routeAssessments[0].grossUsdcRaw,'-395906');
assert.equal(r.routeAssessments[0].aavePremiumUsdcRaw,'250000');
assert.equal(r.routeAssessments[1].afterAavePremiumUsdcRaw,'19750000');
assert.equal(r.routeAssessments[1].qualifiedForDashboard,false);
assert.equal(r.routeAssessments[1].netProfitUsdcRaw,null);
assert.equal(r.providerOptions[1].executionEligible,false);
assert.equal(r.qualified,0);
assert.deepEqual(r.alerts,[]);
assert.equal(assess(null,null).success,true);
console.log('PASS 12.8 hypothetical quote assessment and no-execution invariants');
