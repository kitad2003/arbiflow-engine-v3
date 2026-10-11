'use strict';
// Pending intent is never a confirmed swap, pool reserve change, or arbitrage profit.
// Only chain-verified, allowlisted decoded swaps can enter the research handoff.
function evaluate(observation){
 const reasons=[];
 if(!observation?.chainIdVerified)reasons.push('CHAIN_NOT_VERIFIED');
 if(!observation?.subscriptionAcknowledged)reasons.push('SUBSCRIPTION_NOT_ACKNOWLEDGED');
 if(!observation?.routerVerified)reasons.push('ROUTER_IDENTITY_NOT_VERIFIED');
 if(!observation?.decoded||observation?.kind!=='DECODED_V2_SWAP_INTENT')reasons.push('SWAP_INTENT_NOT_DECODED');
 if(!Array.isArray(observation?.path)||observation.path.length<2)reasons.push('TOKEN_PATH_MISSING');
 return {chain:observation?.chain||null,hash:observation?.hash||null,router:observation?.router||null,
  path:reasons.length===0?observation.path:null,
  intentObserved:reasons.length===0,eligibleForPoolResearch:reasons.length===0,
  poolImpactVerified:false,executableQuoteVerified:false,spreadGreaterThanHalfPercentVerified:false,
  gasAdjustedNetProfitVerified:false,riskVerified:false,executionEligible:false,dashboardAlertEligible:false,
  blockedReasons:[...reasons,'POOL_STATE_AND_PRICE_IMPACT_NOT_VERIFIED','CROSS_VENUE_EXECUTABLE_QUOTES_NOT_VERIFIED','GAS_ADJUSTED_NET_PROFIT_NOT_VERIFIED','RISK_NOT_VERIFIED']};
}
function summarize(observations){const results=observations.map(evaluate);return {
 mode:'READ_ONLY_PENDING_INTENT_RESEARCH_GATE',observed:results.length,
 eligibleForPoolResearch:results.filter(x=>x.eligibleForPoolResearch).length,
 dashboardAlerts:[],bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false,
 results};}
module.exports={evaluate,summarize};
