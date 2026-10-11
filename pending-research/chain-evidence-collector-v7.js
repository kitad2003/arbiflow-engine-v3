'use strict';
// Collect independently queried block and contract-code hashes at a single block.
// This is evidence acquisition, not identity attestation. Requires trusted provider selection.
const {getAddress,keccak256}=require('ethers');
function addr(x){try{return getAddress(x).toLowerCase()}catch{return null}}
async function collectPoolChainEvidence({provider,pool,factory,expectedChainId}={}){
 const base={collected:false,identityVerified:false,feeVerified:false,executionEligible:false,readOnly:true};
 const p=addr(pool),f=addr(factory);
 if(!p||!f||p===f||!provider||typeof provider.getNetwork!=='function'||typeof provider.getBlockNumber!=='function'||typeof provider.getBlock!=='function'||typeof provider.getCode!=='function')return {...base,reason:'INVALID_INPUT_OR_PROVIDER'};
 try{
  const network=await provider.getNetwork(),chainId=Number(network.chainId);
  if(!Number.isSafeInteger(chainId)||chainId!==expectedChainId)return {...base,reason:'CHAIN_ID_MISMATCH'};
  const blockNumber=await provider.getBlockNumber();
  if(!Number.isSafeInteger(blockNumber)||blockNumber<0)return {...base,reason:'INVALID_BLOCK_NUMBER'};
  const block=await provider.getBlock(blockNumber);
  if(!block||!/^0x[0-9a-f]{64}$/i.test(block.hash||''))return {...base,reason:'BLOCK_HASH_UNAVAILABLE'};
  const [poolCode,factoryCode]=await Promise.all([provider.getCode(p,blockNumber),provider.getCode(f,blockNumber)]);
  if(!/^0x(?:[0-9a-f]{2})+$/i.test(poolCode||'')||!/^0x(?:[0-9a-f]{2})+$/i.test(factoryCode||''))return {...base,reason:'CONTRACT_CODE_MISSING'};
  // Reject observations if the canonical block changes during asynchronous code reads.
  const blockAfter=await provider.getBlock(blockNumber);
  if(!blockAfter||typeof blockAfter.hash!=='string'||blockAfter.hash.toLowerCase()!==block.hash.toLowerCase())return {...base,reason:'BLOCK_REORG_OR_INCONSISTENT_PROVIDER'};
  return {...base,collected:true,reason:'CHAIN_EVIDENCE_COLLECTED_NOT_AUTHENTICATED',chainId,blockNumber,blockHash:block.hash.toLowerCase(),pool:p,factory:f,poolCodeHash:keccak256(poolCode),factoryCodeHash:keccak256(factoryCode),limitations:['Provider trust and chain finality not independently established','Proxy implementations and factory identity not authenticated','Pool tokens, registry and fee must be checked separately']};
 }catch{return {...base,reason:'PROVIDER_QUERY_FAILED'}}
}
module.exports={collectPoolChainEvidence};
