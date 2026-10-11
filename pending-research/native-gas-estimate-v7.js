'use strict';
// Read-only gas estimate in native wei; never converts to token profit or submits a transaction.
async function estimateNativeGasResearch({provider,transaction,expectedChainId}={}){
 const base={estimated:false,readOnly:true,alertEligible:false,executionEligible:false,netVerified:false};
 if(!provider||typeof provider.getNetwork!=='function'||typeof provider.estimateGas!=='function'||typeof provider.getFeeData!=='function')return {...base,reason:'INVALID_PROVIDER'};
 if(!transaction||typeof transaction!=='object'||typeof transaction.to!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(transaction.to)||typeof transaction.data!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(transaction.data))return {...base,reason:'INVALID_TRANSACTION'};
 if(transaction.from!==undefined&&(!/^0x[0-9a-fA-F]{40}$/.test(transaction.from)))return {...base,reason:'INVALID_FROM'};
 if(transaction.value!==undefined&&(!/^[0-9]+$/.test(String(transaction.value))))return {...base,reason:'INVALID_VALUE'};
 if(!Number.isSafeInteger(expectedChainId)||expectedChainId<=0)return {...base,reason:'INVALID_CHAIN'};
 try{
  const network=await provider.getNetwork();
  if(Number(network.chainId)!==expectedChainId)return {...base,reason:'CHAIN_MISMATCH'};
  const gas=await provider.estimateGas(transaction);
  const fee=await provider.getFeeData();
  const gasUnits=BigInt(gas);
  const weiPerGas=fee?.maxFeePerGas!=null?BigInt(fee.maxFeePerGas):fee?.gasPrice!=null?BigInt(fee.gasPrice):null;
  if(gasUnits<=0n||weiPerGas===null||weiPerGas<=0n)return {...base,reason:'GAS_OR_FEE_UNAVAILABLE'};
  return {...base,estimated:true,reason:'NATIVE_GAS_ESTIMATE_ONLY',chainId:expectedChainId,gasUnits:String(gasUnits),weiPerGas:String(weiPerGas),maximumEstimatedGasWei:String(gasUnits*weiPerGas),nativeTokenOnly:true,limitations:['estimateGas is not an atomic success guarantee','Fee data can change before inclusion','L2 additional data fees and builder payments not included','No native-to-profit-token conversion']};
 }catch{return {...base,reason:'PROVIDER_ESTIMATION_FAILED'}}
}
module.exports={estimateNativeGasResearch};
