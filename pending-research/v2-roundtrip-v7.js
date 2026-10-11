'use strict';
// Pure two-pool V2 constant-product theoretical round-trip. No executable quote or profit claim.
const {quoteV2ExactIn}=require('./v2-theoretical-quote-v7');
const {getAddress}=require('ethers');
function addr(value){try{return getAddress(value).toLowerCase()}catch{return null}}
function estimateV2RoundTrip({amountInRaw,first,second}={}){
 const base={valid:false,executionEligible:false,profitVerified:false,kind:'V2_THEORETICAL_ROUND_TRIP'};
 if(!first||!second)return {...base,reason:'MISSING_POOLS'};
 const firstIn=addr(first.tokenIn),firstOut=addr(first.tokenOut),secondIn=addr(second.tokenIn),secondOut=addr(second.tokenOut);
 if(!firstIn||!firstOut||!secondIn||!secondOut||firstIn===firstOut||firstOut!==secondIn||secondOut!==firstIn)return {...base,reason:'INVALID_ROUND_TRIP_TOKEN_PATH'};
 if(!first.pool||!second.pool||!addr(first.pool)||!addr(second.pool)||addr(first.pool)===addr(second.pool))return {...base,reason:'INVALID_OR_DUPLICATE_POOLS'};
 if(!Number.isSafeInteger(first.blockTag)||first.blockTag<0||first.blockTag!==second.blockTag)return {...base,reason:'BLOCK_MISMATCH'};
 const leg1=quoteV2ExactIn({amountInRaw,...first});
 if(!leg1.valid)return {...base,reason:'FIRST_LEG_INVALID',first:leg1};
 const leg2=quoteV2ExactIn({amountInRaw:leg1.amountOutRaw,...second});
 if(!leg2.valid)return {...base,reason:'SECOND_LEG_INVALID',first:leg1,second:leg2};
 const input=BigInt(leg1.amountInRaw),output=BigInt(leg2.amountOutRaw);
 const gross=output-input;
 return {...base,valid:true,reason:'THEORETICAL_ONLY',blockTag:first.blockTag,tokenIn:firstIn,intermediateToken:firstOut,amountInRaw:String(input),amountOutRaw:String(output),grossDeltaRaw:String(gross),positiveGross:gross>0n,first:leg1,second:leg2,gasNotIncluded:true,slippageNotIncluded:true,executionSimulationMissing:true,requiresSameStartAndEndToken:true,note:'Caller must independently verify token path, block consistency, fees, pool identity and executable settlement'};
}
module.exports={estimateV2RoundTrip};
