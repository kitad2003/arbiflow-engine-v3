'use strict';
// Offline assessment of a hypothetical atomic flash-loan settlement.
// Inputs are externally supplied research values, NOT an EVM state-transition proof.
function assessAtomicSettlementResearch({borrowedRaw,flashFeeRaw,returnedToLenderRaw,endingBalanceRaw,startingBalanceRaw,gasCostTokenRaw}={}){
 const base={settlementVerified:false,simulationVerified:false,profitVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 const valid=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x);
 const fields=[borrowedRaw,flashFeeRaw,returnedToLenderRaw,endingBalanceRaw,startingBalanceRaw,gasCostTokenRaw];
 if(fields.some(x=>!valid(x)))return {...base,reason:'INVALID_RAW_AMOUNTS'};
 const [borrowed,fee,returned,ending,starting,gas]=fields.map(BigInt);
 if(borrowed===0n)return {...base,reason:'ZERO_BORROW'};
 const required=borrowed+fee;
 const repaymentCovered=returned>=required;
 const balanceDelta=ending-starting;
 const theoreticalNet=balanceDelta-gas;
 return {...base,reason:repaymentCovered?'UNVERIFIED_ATOMIC_SETTLEMENT_MODEL':'REPAYMENT_SHORTFALL',repaymentCovered,requiredRepaymentRaw:String(required),repaymentShortfallRaw:String(returned<required?required-returned:0n),balanceDeltaRaw:String(balanceDelta),gasCostTokenRaw:String(gas),theoreticalNetRaw:String(theoreticalNet),positiveTheoreticalNet:repaymentCovered&&theoreticalNet>0n,limitations:['Caller-supplied balances and repayments are not verified EVM state changes','Requires atomic fork replay of real executor and protocol callbacks','Gas conversion, MEV ordering, inclusion and builder payments unverified']};
}
module.exports={assessAtomicSettlementResearch};
