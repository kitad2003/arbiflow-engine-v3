'use strict';
// Fail-closed cross-module evidence consistency check; does not authenticate source provenance.
const {getAddress}=require('ethers');
const addr=x=>{try{return getAddress(x).toLowerCase()}catch{return null}};
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/i.test(x)?x.toLowerCase():null;
function correlatePoolEvidence({chainEvidence,poolState,manifest}={}){
 const base={consistent:false,identityVerified:false,feeVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 if(!chainEvidence?.collected||!poolState?.verified||!manifest)return {...base,reason:'INCOMPLETE_EVIDENCE'};
 if(!Number.isSafeInteger(chainEvidence.chainId)||!Number.isSafeInteger(chainEvidence.blockNumber)||!hash(chainEvidence.blockHash))return {...base,reason:'INVALID_CHAIN_EVIDENCE'};
 if(!addr(chainEvidence.pool)||!addr(chainEvidence.factory)||!addr(poolState.pool)||!addr(poolState.factory)||!addr(manifest.pool)||!addr(manifest.factory))return {...base,reason:'INVALID_ADDRESSES'};
 if(chainEvidence.chainId!==manifest.chainId||chainEvidence.blockNumber!==poolState.blockTag)return {...base,reason:'CHAIN_OR_BLOCK_MISMATCH'};
 if(addr(chainEvidence.pool)!==addr(poolState.pool)||addr(chainEvidence.factory)!==addr(poolState.factory)||addr(chainEvidence.pool)!==addr(manifest.pool)||addr(chainEvidence.factory)!==addr(manifest.factory))return {...base,reason:'POOL_OR_FACTORY_MISMATCH'};
 if(hash(chainEvidence.poolCodeHash)!==hash(manifest.poolCodeHash)||hash(chainEvidence.factoryCodeHash)!==hash(manifest.factoryCodeHash)||!hash(chainEvidence.poolCodeHash)||!hash(chainEvidence.factoryCodeHash))return {...base,reason:'CODE_HASH_MISMATCH'};
 if(!Number.isSafeInteger(manifest.validFromBlock)||chainEvidence.blockNumber<manifest.validFromBlock||(manifest.validUntilBlock!==undefined&&(!Number.isSafeInteger(manifest.validUntilBlock)||chainEvidence.blockNumber>manifest.validUntilBlock)))return {...base,reason:'MANIFEST_BLOCK_RANGE_MISMATCH'};
 return {...base,consistent:true,reason:'EVIDENCE_CONSISTENT_BUT_UNAUTHENTICATED',chainId:chainEvidence.chainId,blockNumber:chainEvidence.blockNumber,blockHash:chainEvidence.blockHash.toLowerCase(),pool:addr(chainEvidence.pool),factory:addr(chainEvidence.factory),limitations:['Source trust not independently established','Fee source not authenticated','Atomic execution and net profit not verified']};
}
module.exports={correlatePoolEvidence};
