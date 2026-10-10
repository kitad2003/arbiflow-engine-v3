'use strict';
// Attribution only: report exact fee relationships; no state mutation or release gate changes.
function attribute(sim,post,details){
 const lookup=(address)=>details?.items?.find(x=>x.address?.toLowerCase()===address&&x.field==='balance');
 const f=sim?.targetFeeReconciliation,base=sim?.blockEnvironment?.historical?.baseFeePerGas;
 const out={mode:'HISTORICAL_FEE_ATTRIBUTION',diagnosticOnly:true,provesCompleteReplay:false,priorityFeeIdentityVerified:false,operatorFeeTransferIdentityVerified:false};
 if(!f||!base||!sim?.historicalGasUsed)return {...out,reason:'FEE_INPUTS_UNAVAILABLE'};
 const l2=BigInt(f.historicalL2ExecutionWei),gas=BigInt(sim.historicalGasUsed),baseCost=gas*BigInt(base);
 const priority=l2-baseCost;
 const vault=lookup('0x4200000000000000000000000000000000000011');
 const opVault=lookup('0x420000000000000000000000000000000000001a');
 const sender=lookup('0xd14602c85a25a4e520441c47a97a2c9da63ae1be');
 out.l2BaseCostWei=baseCost.toString();
 out.l2PriorityCostWei=priority.toString();
 out.sequencerVaultDeficitWei=vault?.localMinusHistoricalWeiOrUnits??null;
 out.priorityFeeIdentityVerified=vault!=null&&BigInt(vault.localMinusHistoricalWeiOrUnits)===-priority;
 out.operatorVaultDeficitWei=opVault?.localMinusHistoricalWeiOrUnits??null;
 out.senderSurplusWei=sender?.localMinusHistoricalWeiOrUnits??null;
 out.operatorFeeTransferIdentityVerified=opVault!=null&&sender!=null&&BigInt(opVault.localMinusHistoricalWeiOrUnits)===-BigInt(sender.localMinusHistoricalWeiOrUnits);
 out.inferredOperatorFeeWei=out.operatorFeeTransferIdentityVerified?sender.localMinusHistoricalWeiOrUnits:null;
 out.historicalL1DataFeeWei=f.historicalL1DataFeeWei??null;
 out.reason='ACCOUNTING_IDENTITIES_ONLY_NOT_PROOF_OF_OP_STACK_IMPLEMENTATION';
 return out;
}
module.exports={attribute};
