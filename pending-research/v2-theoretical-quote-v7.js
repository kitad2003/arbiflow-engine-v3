'use strict';
// Pure read-only V2 constant-product estimator; never an executable quote.
// feeBps is an explicit caller-provided pool fee, not inferred from a DEX name.
function quoteV2ExactIn({amountInRaw,reserveInRaw,reserveOutRaw,feeBps}={}){
 const base={valid:false,executionEligible:false,profitVerified:false,kind:'V2_THEORETICAL_EXACT_IN'};
 try{
  const a=BigInt(amountInRaw),ri=BigInt(reserveInRaw),ro=BigInt(reserveOutRaw);
  if(!Number.isSafeInteger(feeBps)||feeBps<0||feeBps>=10000||a<=0n||ri<=0n||ro<=0n)return {...base,reason:'INVALID_INPUT_OR_FEE'};
  const adjusted=a*BigInt(10000-feeBps);
  const out=adjusted*ro/(ri*10000n+adjusted);
  if(out<=0n||out>=ro)return {...base,reason:'INSUFFICIENT_OUTPUT_OR_LIQUIDITY'};
  return {...base,valid:true,reason:'THEORETICAL_QUOTE_ONLY',amountInRaw:String(a),amountOutRaw:String(out),feeBps,priceImpactNotComputed:true,gasNotIncluded:true,slippageNotIncluded:true,tokenDecimalsNotApplied:true};
 }catch{return {...base,reason:'INVALID_INPUT_OR_FEE'}}
}
module.exports={quoteV2ExactIn};
