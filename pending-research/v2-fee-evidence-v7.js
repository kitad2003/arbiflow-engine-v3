'use strict';
// Read-only V2-style fee evidence collector. Standard Uniswap V2 pairs do not expose feeBps;
// an externally provided fee is NEVER marked verified by this module.
function assessV2FeeEvidence({poolEvidence,feeBps,source}={}){
 const base={feeVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 if(!poolEvidence?.consistent)return {...base,reason:'POOL_EVIDENCE_NOT_CONSISTENT'};
 if(!Number.isSafeInteger(feeBps)||feeBps<0||feeBps>=10000)return {...base,reason:'INVALID_FEE_BPS'};
 if(!source||typeof source!=='object')return {...base,reason:'MISSING_FEE_PROVENANCE'};
 if(source.kind==='HARDCODED'||source.kind==='USER_SUPPLIED'||source.kind==='ROUTER_ASSUMPTION')return {...base,reason:'UNVERIFIED_FEE_SOURCE',feeBps};
 if(source.kind!=='ONCHAIN_FEE_QUERY'&&source.kind!=='AUDITED_IMMUTABLE_FEE')return {...base,reason:'UNSUPPORTED_FEE_SOURCE',feeBps};
 if(!Number.isSafeInteger(source.chainId)||source.chainId!==poolEvidence.chainId||source.blockNumber!==poolEvidence.blockNumber)return {...base,reason:'FEE_CHAIN_OR_BLOCK_MISMATCH',feeBps};
 // No authenticated factory-specific fee ABI or immutable code provenance is implemented.
 return {...base,reason:'FEE_SOURCE_AUTHENTICATION_NOT_IMPLEMENTED',feeBps,claimedSource:source.kind,limitations:['Fee must be independently verified against protocol-specific deployed code','Caller-supplied fee provenance cannot authorize quotes or alerts']};
}
module.exports={assessV2FeeEvidence};
