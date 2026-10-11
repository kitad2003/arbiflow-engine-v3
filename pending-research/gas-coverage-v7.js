'use strict';
// Gas coverage classification only; never claims complete transaction cost or net profit.
// L2 chains can have additional data/DA costs not captured by standard estimateGas.
const L2_CHAIN_IDS=new Set([10,8453,42161,81457,34443,59144,534352,7777777]);
function assessGasCoverage({estimate,chainId,l1DataFeeWei,builderPaymentWei}={}){
 const base={costComplete:false,netVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 if(!estimate?.estimated||estimate.chainId!==chainId||!Number.isSafeInteger(chainId)||chainId<=0)return {...base,reason:'INVALID_ESTIMATE_OR_CHAIN'};
 if(typeof estimate.maximumEstimatedGasWei!=='string'||!/^[0-9]+$/.test(estimate.maximumEstimatedGasWei))return {...base,reason:'INVALID_BASE_GAS'};
 const isL2=L2_CHAIN_IDS.has(chainId);
 if(isL2&&(typeof l1DataFeeWei!=='string'||!/^[0-9]+$/.test(l1DataFeeWei)))return {...base,reason:'L2_DATA_FEE_NOT_ESTABLISHED',isL2};
 if(builderPaymentWei!==undefined&&(typeof builderPaymentWei!=='string'||!/^[0-9]+$/.test(builderPaymentWei)))return {...base,reason:'INVALID_BUILDER_PAYMENT'};
 const dataFee=isL2?BigInt(l1DataFeeWei):0n;
 const builder=builderPaymentWei===undefined?0n:BigInt(builderPaymentWei);
 const total=BigInt(estimate.maximumEstimatedGasWei)+dataFee+builder;
 return {...base,reason:'RESEARCH_COST_COMPONENTS_ONLY',isL2,baseGasWei:estimate.maximumEstimatedGasWei,l1DataFeeWei:String(dataFee),builderPaymentWei:String(builder),estimatedComponentsWei:String(total),limitations:['Additional chain-specific fees may apply','Caller-supplied fee components are not authenticated','No actual inclusion cost or native-to-traded-token conversion']};
}
module.exports={assessGasCoverage,L2_CHAIN_IDS};
