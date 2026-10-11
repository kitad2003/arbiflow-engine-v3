'use strict';
// Read-only economic feasibility gate. Gas must be denominated in the same raw token units as gross delta.
// A conversion quote supplied by a caller is not authenticated and cannot qualify an alert.
function assessResearchNet({roundTrip,gasCostRaw,conversionEvidence}={}){
 const base={netVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 if(!roundTrip?.valid||typeof roundTrip.grossDeltaRaw!=='string'||!/^[-]?[0-9]+$/.test(roundTrip.grossDeltaRaw))return {...base,reason:'INVALID_ROUND_TRIP'};
 if(typeof gasCostRaw!=='string'||!/^[0-9]+$/.test(gasCostRaw))return {...base,reason:'INVALID_GAS_COST'};
 if(!conversionEvidence||conversionEvidence.token!==roundTrip.tokenIn||conversionEvidence.sameTokenUnits!==true)return {...base,reason:'GAS_UNIT_CONVERSION_UNVERIFIED'};
 const gross=BigInt(roundTrip.grossDeltaRaw),gas=BigInt(gasCostRaw),net=gross-gas;
 return {...base,reason:'THEORETICAL_NET_ONLY',grossDeltaRaw:String(gross),gasCostRaw:String(gas),netDeltaRaw:String(net),positiveNet:net>0n,limitations:['Caller-provided conversion evidence is not authenticated','No EVM gas estimation or native-token price verification','No atomic execution simulation or real profit claim']};
}
module.exports={assessResearchNet};
