'use strict';
// Offline signature validation for canonical deployment records.
// A public key must be pinned by trusted configuration; caller-supplied signer is never a trust root.
const {verifyMessage,getAddress,keccak256,toUtf8Bytes}=require('ethers');
function canonicalRecord(r){
 if(!r||!Number.isSafeInteger(r.chainId)||r.chainId<=0||!Number.isSafeInteger(r.validFromBlock)||r.validFromBlock<0)throw Error('INVALID_RECORD');
 const address=x=>getAddress(x).toLowerCase();
 const hash=x=>{if(typeof x!=='string'||!/^0x[0-9a-f]{64}$/i.test(x))throw Error('INVALID_HASH');return x.toLowerCase()};
 const o={version:'ARBIFLOW_DEPLOYMENT_V7',chainId:r.chainId,pool:address(r.pool),factory:address(r.factory),poolCodeHash:hash(r.poolCodeHash),factoryCodeHash:hash(r.factoryCodeHash),validFromBlock:r.validFromBlock,validUntilBlock:r.validUntilBlock??null};
 if(o.validUntilBlock!==null&&(!Number.isSafeInteger(o.validUntilBlock)||o.validUntilBlock<o.validFromBlock))throw Error('INVALID_BLOCK_RANGE');
 return JSON.stringify(o);
}
function verifyDeploymentSignature({record,signature,trustedSigner}={}){
 const base={signatureValid:false,identityVerified:false,feeVerified:false,executionEligible:false,alertEligible:false,readOnly:true};
 try{
  if(typeof trustedSigner!=='string'||typeof signature!=='string')return {...base,reason:'MISSING_TRUST_ANCHOR_OR_SIGNATURE'};
  const signer=getAddress(trustedSigner).toLowerCase();
  const payload=canonicalRecord(record);
  const recovered=verifyMessage(payload,signature).toLowerCase();
  if(recovered!==signer)return {...base,reason:'SIGNER_MISMATCH'};
  return {...base,signatureValid:true,reason:'SIGNATURE_MATCHES_SUPPLIED_SIGNER_NOT_AUTHENTICATED',recordHash:keccak256(toUtf8Bytes(payload)),signer,limitations:['Trusted signer must be independently pinned outside user input','Signature alone does not verify contract identity or fee source','No opportunity execution is permitted']};
 }catch{return {...base,reason:'INVALID_RECORD_OR_SIGNATURE'}}
}
module.exports={canonicalRecord,verifyDeploymentSignature};
