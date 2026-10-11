'use strict';
// Connects chain observation, deployment comparison and signature check.
// Never promotes a caller-supplied signer to a trusted root.
const {compareDeploymentEvidence}=require('./deployment-manifest-check-v7');
const {verifyDeploymentSignature}=require('./deployment-signature-v7');
function evaluateSignedPoolDeployment({observation,manifest,signature,trustedSigner}={}){
 const base={identityVerified:false,feeVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 const comparison=compareDeploymentEvidence({observation,manifest});
 if(!comparison.matched)return {...base,reason:'DEPLOYMENT_MISMATCH',comparison};
 const signatureResult=verifyDeploymentSignature({record:manifest,signature,trustedSigner});
 if(!signatureResult.signatureValid)return {...base,reason:'DEPLOYMENT_SIGNATURE_REJECTED',comparison,signatureResult};
 return {...base,reason:'SIGNATURE_MATCH_ONLY_TRUST_ROOT_NOT_ESTABLISHED',comparison,signatureResult,limitations:['Caller-supplied trustedSigner is not independently authenticated','Factory and pool deployment source review remains required','No verified fee or execution simulation']};
}
module.exports={evaluateSignedPoolDeployment};
