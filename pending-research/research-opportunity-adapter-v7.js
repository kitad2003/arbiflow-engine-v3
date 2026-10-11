'use strict';
// Conservative adapter between research snapshots and opportunity qualification.
// Explicitly refuses to turn unauthenticated snapshots into verified pool/fee flags.
const {quoteSnapshotRoundTrip}=require('./snapshot-roundtrip-v7');
function inspectResearchOpportunity({firstSnapshot,secondSnapshot,tokenIn,intermediateToken,amountInRaw}={}){
 const base={readOnly:true,alertEligible:false,executionEligible:false,profitVerified:false,identityVerified:false,feeVerified:false};
 const roundTrip=quoteSnapshotRoundTrip({firstSnapshot,secondSnapshot,tokenIn,intermediateToken,amountInRaw});
 if(!roundTrip.valid)return {...base,reason:'RESEARCH_ROUND_TRIP_REJECTED',roundTrip};
 const untrusted=['firstSnapshot','secondSnapshot'].filter(k=>{const x=k==='firstSnapshot'?firstSnapshot:secondSnapshot;return x?.identityVerified!==true||x?.feeVerified!==true});
 // The research snapshot builder never authenticates these flags. Even if forged, do not authorize.
 return {...base,reason:'INDEPENDENT_SNAPSHOT_ATTESTATION_MISSING',grossDeltaRaw:roundTrip.grossDeltaRaw,positiveGross:roundTrip.positiveGross,untrustedSnapshots:untrusted,roundTrip,limitations:['Theoretical output only','No authenticated identity or fee provenance','No executable transaction simulation or gas-adjusted net profit']};
}
module.exports={inspectResearchOpportunity};
