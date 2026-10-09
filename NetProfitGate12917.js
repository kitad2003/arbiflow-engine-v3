'use strict';
// 12.9.17. Monetary values are exact integer USDC micro-units, never floats.
// Every cost MUST be verified in same currency before emitting a dashboard alert.
function evaluate(x){
 const reasons=[];
 const required=['principalRaw','returnedRaw','premiumRaw','executionGasUsdcRaw','l1FeeUsdcRaw','slippageReserveUsdcRaw'];
 for(const k of required)if(!/^(0|[1-9][0-9]*)$/.test(String(x?.[k]??'')))reasons.push('MISSING_OR_INVALID_'+k);
 if(x?.risk!=='LOW'&&x?.risk!=='MEDIUM')reasons.push('RISK_NOT_LOW_OR_MEDIUM');
 if(x?.atomicSettlementVerified!==true)reasons.push('ATOMIC_SETTLEMENT_UNVERIFIED');
 if(x?.freshSameBlockQuotesVerified!==true)reasons.push('QUOTE_FRESHNESS_UNVERIFIED');
 if(x?.costSourcesVerified!==true)reasons.push('COST_SOURCES_UNVERIFIED');
 if(reasons.length)return {qualified:false,reasons,netProfitUsdcRaw:null,spreadBps:null,alert:null};
 const n={};for(const k of required)n[k]=BigInt(x[k]);
 if(n.principalRaw===0n)reasons.push('ZERO_PRINCIPAL');
 if(n.principalRaw===0n)return {qualified:false,reasons,netProfitUsdcRaw:null,spreadBps:null,alert:null};
 const gross=n.returnedRaw-n.principalRaw;
 const net=gross-n.premiumRaw-n.executionGasUsdcRaw-n.l1FeeUsdcRaw-n.slippageReserveUsdcRaw;
 const spreadPass=gross*10000n>n.principalRaw*50n; // strictly greater than 0.5%
 if(!spreadPass)reasons.push('SPREAD_NOT_ABOVE_0_5_PERCENT');
 if(net<=0n)reasons.push('NONPOSITIVE_NET_PROFIT');
 const qualified=reasons.length===0;
 return {qualified,reasons,netProfitUsdcRaw:net.toString(),spreadBps:(gross*10000n/n.principalRaw).toString(),alert:qualified?{pair:'USDC/WETH',direction:x.direction,loanPrincipalUsdcRaw:n.principalRaw.toString(),risk:x.risk,netProfitUsdcRaw:net.toString()}:null};
}
module.exports={evaluate};
if(require.main===module){
 const assert=require('node:assert/strict');
 const base={principalRaw:'1000000000',returnedRaw:'1010000000',premiumRaw:'500000',executionGasUsdcRaw:'1000000',l1FeeUsdcRaw:'200000',slippageReserveUsdcRaw:'500000',risk:'LOW',atomicSettlementVerified:true,freshSameBlockQuotesVerified:true,costSourcesVerified:true,direction:'UNI_TO_AERO'};
 let count=0;
 const test=(caseName,overrides,pass,reason)=>{const res=evaluate({...base,...overrides});assert.equal(res.qualified,pass,caseName);if(reason)assert(res.reasons.includes(reason),caseName+'_REASON');count++;};
 test('happy-path-fixture',{},true);
 test('exactly-0.5-pct',{returnedRaw:'1005000000'},false,'SPREAD_NOT_ABOVE_0_5_PERCENT');
 test('just-over-0.5-pct',{returnedRaw:'1005000001'},true);
 test('negative-net',{executionGasUsdcRaw:'10000000'},false,'NONPOSITIVE_NET_PROFIT');
 test('missing-l1',{l1FeeUsdcRaw:null},false,'MISSING_OR_INVALID_l1FeeUsdcRaw');
 test('missing-gas',{executionGasUsdcRaw:null},false,'MISSING_OR_INVALID_executionGasUsdcRaw');
 test('unknown-risk',{risk:'HIGH'},false,'RISK_NOT_LOW_OR_MEDIUM');
 test('no-settlement',{atomicSettlementVerified:false},false,'ATOMIC_SETTLEMENT_UNVERIFIED');
 test('stale-quotes',{freshSameBlockQuotesVerified:false},false,'QUOTE_FRESHNESS_UNVERIFIED');
 test('unverified-cost',{costSourcesVerified:false},false,'COST_SOURCES_UNVERIFIED');
 test('zero-principal',{principalRaw:'0'},false,'ZERO_PRINCIPAL');
 console.log(JSON.stringify({success:true,build:'12.9.17',testCasesPassed:count,mode:'STRICT_INTEGER_MATH_PROFIT_GATE_UNIT_TEST',fixturesOnly:true,realNetProfitVerified:false,qualifiedLiveOpportunities:0,mainnetBroadcast:false}));
}
