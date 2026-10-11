'use strict';
// Bind a caller-provided conversion rate to chain, block hash and token denomination.
// These checks establish consistency, not rate authenticity.
function validateResearchRate({rate,chainId,blockNumber,blockHash,profitToken}={}){
 const base={consistent:false,authenticated:false,readOnly:true,alertEligible:false,executionEligible:false};
 const address=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x);
 const hash=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{64}$/.test(x);
 const raw=x=>typeof x==='string'&&/^[0-9]+$/.test(x);
 if(!rate||!Number.isSafeInteger(chainId)||chainId<=0||!Number.isSafeInteger(blockNumber)||blockNumber<0||!hash(blockHash)||!address(profitToken))return {...base,reason:'INVALID_CONTEXT'};
 if(rate.chainId!==chainId||rate.blockNumber!==blockNumber||!hash(rate.blockHash)||rate.blockHash.toLowerCase()!==blockHash.toLowerCase())return {...base,reason:'RATE_CONTEXT_MISMATCH'};
 if(!address(rate.profitToken)||rate.profitToken.toLowerCase()!==profitToken.toLowerCase())return {...base,reason:'RATE_TOKEN_MISMATCH'};
 if(!raw(rate.numerator)||!raw(rate.denominator)||BigInt(rate.numerator)===0n||BigInt(rate.denominator)===0n)return {...base,reason:'INVALID_RATE_RATIO'};
 return {...base,consistent:true,reason:'RATE_CONTEXT_CONSISTENT_NOT_AUTHENTICATED',numerator:rate.numerator,denominator:rate.denominator,blockHash:blockHash.toLowerCase(),limitations:['Rate provenance and manipulation resistance unverified','Context consistency does not prove token valuation','No permission to alert or execute']};
}
module.exports={validateResearchRate};
