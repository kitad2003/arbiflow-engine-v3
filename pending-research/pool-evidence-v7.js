'use strict';
// Evidence records are explicitly non-authoritative until independently checked against trusted chain state.
// This module rejects inconsistent or untraceable claims; it cannot establish router or factory identity alone.
const {getAddress}=require('ethers');
function addr(x){try{return getAddress(x).toLowerCase()}catch{return null}}
function inspectPoolEvidence(e={}){
 const base={accepted:false,identityVerified:false,feeVerified:false,executionEligible:false,readOnly:true};
 const pool=addr(e.pool),factory=addr(e.factory),token0=addr(e.token0),token1=addr(e.token1);
 if(!pool||!factory||!token0||!token1||token0===token1)return {...base,reason:'INVALID_ADDRESSES'};
 if(!Number.isSafeInteger(e.chainId)||e.chainId<=0||!Number.isSafeInteger(e.blockNumber)||e.blockNumber<0)return {...base,reason:'INVALID_CHAIN_OR_BLOCK'};
 if(!/^0x[0-9a-f]{64}$/i.test(e.blockHash||''))return {...base,reason:'MISSING_BLOCK_HASH'};
 if(!/^0x[0-9a-f]{64}$/i.test(e.poolCodeHash||'')||!/^0x[0-9a-f]{64}$/i.test(e.factoryCodeHash||''))return {...base,reason:'MISSING_CODE_HASHES'};
 if(!Number.isSafeInteger(e.feeBps)||e.feeBps<0||e.feeBps>=10000)return {...base,reason:'INVALID_FEE'};
 if(e.feeSource!=='ONCHAIN_VERIFIED'&&e.feeSource!=='AUDITED_IMMUTABLE_CONFIG')return {...base,reason:'UNVERIFIED_FEE_SOURCE'};
 if(e.factoryPairRegistryMatch!==true||e.poolTokenMatch!==true)return {...base,reason:'POOL_REGISTRY_NOT_CONFIRMED'};
 return {...base,accepted:true,reason:'EVIDENCE_SHAPE_VALID_BUT_NOT_AUTHENTICATED',chainId:e.chainId,blockNumber:e.blockNumber,blockHash:e.blockHash.toLowerCase(),pool,factory,token0,token1,feeBps:e.feeBps,limitations:['Block hash and code hashes are supplied assertions','Onchain proof verification is not implemented','Fee provenance is not independently authenticated']};
}
module.exports={inspectPoolEvidence};
