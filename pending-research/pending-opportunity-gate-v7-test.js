'use strict';
const assert=require('node:assert/strict');
const {evaluate,summarize}=require('./pending-opportunity-gate-v7');
const base={chain:'ethereum',hash:'0x'+'a'.repeat(64),chainIdVerified:true,subscriptionAcknowledged:true,routerVerified:true,decoded:true,kind:'DECODED_V2_SWAP_INTENT',router:'UNISWAP_V2_ROUTER02',path:['0x'+'1'.repeat(40),'0x'+'2'.repeat(40)]};
const good=evaluate(base);
assert.equal(good.eligibleForPoolResearch,true);
assert.equal(good.dashboardAlertEligible,false);
assert.equal(good.executionEligible,false);
for(const change of [{chainIdVerified:false},{subscriptionAcknowledged:false},{routerVerified:false},{decoded:false},{path:[]}]){
 const bad=evaluate({...base,...change});assert.equal(bad.eligibleForPoolResearch,false);assert.equal(bad.dashboardAlertEligible,false);
}
const result=summarize([base,{...base,routerVerified:false}]);
assert.equal(result.eligibleForPoolResearch,1);
assert.equal(result.dashboardAlerts.length,0);
assert.equal(result.mainnetBroadcast,false);
console.log('PENDING_OPPORTUNITY_GATE_V7_TEST_PASS');
