'use strict';
// Compare observed onchain code hashes against an externally reviewed immutable deployment manifest.
// Manifest contents are untrusted until reviewed and pinned outside the scanner.
const {getAddress}=require('ethers');
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/i.test(x)?x.toLowerCase():null;
const addr=x=>{try{return getAddress(x).toLowerCase()}catch{return null}};
function compareDeploymentEvidence({observation,manifest}={}){
 const base={matched:false,identityVerified:false,feeVerified:false,executionEligible:false,readOnly:true};
 if(!observation?.collected||!manifest||manifest.reviewed!==true||manifest.sourceType!=='PINNED_DEPLOYMENT_MANIFEST')return {...base,reason:'MISSING_REVIEWED_MANIFEST_OR_EVIDENCE'};
 if(!Number.isSafeInteger(manifest.chainId)||manifest.chainId!==observation.chainId)return {...base,reason:'CHAIN_MISMATCH'};
 if(!addr(manifest.pool)||!addr(manifest.factory)||addr(manifest.pool)!==addr(observation.pool)||addr(manifest.factory)!==addr(observation.factory))return {...base,reason:'ADDRESS_MISMATCH'};
 if(!hash(manifest.poolCodeHash)||!hash(manifest.factoryCodeHash)||hash(manifest.poolCodeHash)!==hash(observation.poolCodeHash)||hash(manifest.factoryCodeHash)!==hash(observation.factoryCodeHash))return {...base,reason:'CODE_HASH_MISMATCH'};
 if(!Number.isSafeInteger(manifest.validFromBlock)||observation.blockNumber<manifest.validFromBlock)return {...base,reason:'BLOCK_OUTSIDE_MANIFEST_RANGE'};
 if(manifest.validUntilBlock!==undefined&&(!Number.isSafeInteger(manifest.validUntilBlock)||observation.blockNumber>manifest.validUntilBlock))return {...base,reason:'BLOCK_OUTSIDE_MANIFEST_RANGE'};
 return {...base,matched:true,reason:'MANIFEST_MATCH_NOT_INDEPENDENTLY_AUTHENTICATED',chainId:observation.chainId,blockNumber:observation.blockNumber,pool:observation.pool,factory:observation.factory,limitations:['Reviewed flag and manifest contents can be forged by caller','External provenance and signer verification not implemented','Proxy implementation identity and fee provenance not verified']};
}
module.exports={compareDeploymentEvidence};
