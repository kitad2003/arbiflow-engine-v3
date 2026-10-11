'use strict';
// Safe verification orchestration: all claims remain non-actionable until a pinned external trust root exists.
const {collectPoolChainEvidence}=require('./chain-evidence-collector-v7');
const {evaluateSignedPoolDeployment}=require('./signed-pool-deployment-v7');
async function inspectSignedPoolOnChain({provider,pool,factory,expectedChainId,manifest,signature,trustedSigner}={}){
 const base={readOnly:true,identityVerified:false,feeVerified:false,alertEligible:false,executionEligible:false};
 const observation=await collectPoolChainEvidence({provider,pool,factory,expectedChainId});
 if(!observation.collected)return {...base,reason:'CHAIN_COLLECTION_FAILED',observation};
 const review=evaluateSignedPoolDeployment({observation,manifest,signature,trustedSigner});
 return {...base,reason:review.reason,observation,review};
}
module.exports={inspectSignedPoolOnChain};
