'use strict';
// Pure bigint conversion of native-wei research costs into target-token base units.
// Rate is a caller-supplied rational, NOT a verified oracle quote.
function convertGasWeiToTokenRaw({gasWei,tokenRawPerNativeNumerator,tokenRawPerNativeDenominator,rateChainId,expectedChainId,rateBlockNumber,expectedBlockNumber}={}){
 const base={converted:false,rateVerified:false,netVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 const dec=x=>typeof x==='string'&&/^[0-9]+$/.test(x);
 if(!dec(gasWei)||!dec(tokenRawPerNativeNumerator)||!dec(tokenRawPerNativeDenominator))return {...base,reason:'INVALID_DECIMAL_INPUT'};
 if(!Number.isSafeInteger(expectedChainId)||expectedChainId<=0||rateChainId!==expectedChainId)return {...base,reason:'RATE_CHAIN_MISMATCH'};
 if(!Number.isSafeInteger(expectedBlockNumber)||expectedBlockNumber<0||rateBlockNumber!==expectedBlockNumber)return {...base,reason:'RATE_BLOCK_MISMATCH'};
 const n=BigInt(tokenRawPerNativeNumerator),d=BigInt(tokenRawPerNativeDenominator),g=BigInt(gasWei);
 if(n<=0n||d<=0n)return {...base,reason:'INVALID_RATE'};
 // Ceiling prevents understating modeled gas costs by rounding down.
 const tokenGasRaw=(g*n+d-1n)/d;
 return {...base,converted:true,reason:'UNVERIFIED_RATE_CONVERSION_ONLY',tokenGasRaw:String(tokenGasRaw),gasWei,rateChainId,rateBlockNumber,rounding:'CEILING',limitations:['Rate is supplied, not authenticated against on-chain liquidity','No slippage, oracle staleness, or manipulation protection','No executable profit claim']};
}
module.exports={convertGasWeiToTokenRaw};
