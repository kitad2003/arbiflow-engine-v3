'use strict';
// Fail-closed provenance review of deployment records.
// No caller-supplied 'reviewed' boolean is treated as cryptographic attestation.
const {getAddress}=require('ethers');
const address=x=>{try{return getAddress(x).toLowerCase()}catch{return null}};
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/i.test(x)?x.toLowerCase():null;
function reviewDeploymentProvenance({observation,manifest,approval}={}){
 const base={provenanceAuthenticated:false,identityVerified:false,feeVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 if(!observation?.collected||!manifest||!approval)return {...base,reason:'MISSING_EVIDENCE'};
 if(!hash(observation.blockHash)||!hash(observation.poolCodeHash)||!hash(observation.factoryCodeHash))return {...base,reason:'INVALID_CHAIN_EVIDENCE'};
 if(!address(observation.pool)||!address(observation.factory)||!Number.isSafeInteger(observation.chainId)||!Number.isSafeInteger(observation.blockNumber))return {...base,reason:'INVALID_CHAIN_EVIDENCE'};
 if(!hash(manifest.poolCodeHash)||!hash(manifest.factoryCodeHash)||!address(manifest.pool)||!address(manifest.factory))return {...base,reason:'INVALID_MANIFEST'};
 if(observation.chainId!==manifest.chainId||address(observation.pool)!==address(manifest.pool)||address(observation.factory)!==address(manifest.factory)||hash(observation.poolCodeHash)!==hash(manifest.poolCodeHash)||hash(observation.factoryCodeHash)!==hash(manifest.factoryCodeHash))return {...base,reason:'OBSERVATION_MANIFEST_MISMATCH'};
 if(!Number.isSafeInteger(manifest.validFromBlock)||observation.blockNumber<manifest.validFromBlock||(manifest.validUntilBlock!==undefined&&(!Number.isSafeInteger(manifest.validUntilBlock)||observation.blockNumber>manifest.validUntilBlock)))return {...base,reason:'BLOCK_OUTSIDE_MANIFEST_RANGE'};
 // Approval data is retained for review, but cannot become an authorization bypass.
 return {...base,reason:'INDEPENDENT_ATTESTATION_NOT_IMPLEMENTED',recordMatches:true,claimedApproval:approval.approverId||null,limitations:['No cryptographic signature verification','No pinned trust root or verified source','No verified fee provenance or execution simulation']};
}
module.exports={reviewDeploymentProvenance};
