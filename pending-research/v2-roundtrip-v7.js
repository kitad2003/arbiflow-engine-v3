'use strict';
// Pure two-pool V2 constant-product theoretical round-trip. No executable quote or profit claim.
const {quoteV2ExactIn}=require('./v2-theoretical-quote-v7');
function estimateV2RoundTrip({amountInRaw,first,second}={}){
 const base={valid:false,executionEligible:false,profitVerified:false,kind:'V2_THEORETICAL_ROUND_TRIP'};
 if(!first||!second)return {...base,reason:'MISSING_POOLS'};
 const leg1=quoteV2ExactIn({amountInRaw,...first});
 if(!leg1.valid)return {...base,reason:'FIRST_LEG_INVALID',first:leg1};
 const leg2=quoteV2ExactIn({amountInRaw:leg1.amountOutRaw,...second});
 if(!leg2.valid)return {...base,reason:'SECOND_LEG_INVALID',first:leg1,second:leg2};
 const input=BigInt(leg1.amountInRaw),output=BigInt(leg2.amountOutRaw);
 const gross=output-input;
 return {...base,valid:true,reason:'THEORETICAL_ONLY',amountInRaw:String(input),amountOutRaw:String(output),grossDeltaRaw:String(gross),positiveGross:gross>0n,first:leg1,second:leg2,gasNotIncluded:true,slippageNotIncluded:true,executionSimulationMissing:true,requiresSameStartAndEndToken:true,note:'Caller must independently verify token path, block consistency, fees, pool identity and executable settlement'};
}
module.exports={estimateV2RoundTrip};
