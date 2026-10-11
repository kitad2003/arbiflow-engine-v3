'use strict';
// A deliberately conservative boundary between untrusted research calculations and dashboard alerts.
// This module never authorizes trades or fabricates gas-adjusted profits.
function assessV7Opportunity(candidate={}){
 const required=['poolIdentityVerified','factoryIdentityVerified','feeSourceVerified','blockConsistent','tokenPathVerified','executableQuotesVerified','atomicSimulationPassed','gasEstimateVerified','netProfitVerified','riskAssessed'];
 const missing=required.filter(k=>candidate[k]!==true);
 const spread=typeof candidate.spreadPct==='number'&&Number.isFinite(candidate.spreadPct)?candidate.spreadPct:null;
 const risk=['LOW','MEDIUM','HIGH'].includes(candidate.risk)?candidate.risk:null;
 const eligible=missing.length===0&&spread!==null&&spread>0.5&&['LOW','MEDIUM'].includes(risk)&&candidate.netProfitRaw!==undefined&&/^[1-9][0-9]*$/.test(String(candidate.netProfitRaw));
 // Even when all supplied booleans pass, evidence authentication is not implemented here.
 return {alertEligible:false,executionEligible:false,readOnly:true,reason:eligible?'EVIDENCE_ATTESTATION_NOT_IMPLEMENTED':'UNQUALIFIED_OPPORTUNITY',requirementsSatisfiedByClaim:eligible,missingRequirements:missing,spreadPct:spread,risk,notes:'Untrusted candidate flags do not establish independently verified evidence; fail closed until evidence attestation exists'};
}
module.exports={assessV7Opportunity};
