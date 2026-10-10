'use strict';
// Source: Flashbots MEV-Share Automated Arbitrage Bot, "Sending Backrun Bundles".
// The required ordering is [target tx, Balancer makeFlashLoan tx].
// Hint-only events do not contain a signed target transaction. Never invent one.
const HASH=/^0x[0-9a-f]{64}$/i,RAW=/^0x[0-9a-f]+$/i;
const {ethers}=require('ethers');
function checkTarget(input={}){
 const hash=String(input.targetHash||'');
 if(!HASH.test(hash))return {ready:false,reason:'TARGET_HASH_REQUIRED'};
 if(input.kind==='BUNDLE')return {ready:false,reason:'BUNDLE_HASH_NOT_SINGLE_TARGET_TRANSACTION'};
 if(typeof input.signedRawTransaction!=='string'||!RAW.test(input.signedRawTransaction))
  return {ready:false,reason:'MEV_SHARE_HINT_NOT_SIGNED_TARGET_TRANSACTION'};
 if(!Number.isSafeInteger(input.parentBlock)||input.parentBlock<1)
  return {ready:false,reason:'PARENT_BLOCK_REQUIRED_FOR_ORDERED_REPLAY'};
 let tx;
 try{tx=ethers.Transaction.from(input.signedRawTransaction)}catch{return {ready:false,reason:'RAW_TARGET_TRANSACTION_INVALID'}}
 if(tx.hash?.toLowerCase()!==hash.toLowerCase())return {ready:false,reason:'TARGET_HASH_MISMATCH'};
 if(tx.chainId!==1n)return {ready:false,reason:'TARGET_NOT_ETHEREUM_MAINNET'};
 return {ready:true,targetHash:hash.toLowerCase(),parentBlock:input.parentBlock,
  targetTxType:tx.type,rawTxValidated:true,
  // Validation is only input readiness, not proof that replay will succeed.
  actualReplayVerified:false};
}
function report(input={}){
 const target=checkTarget(input);
 return {build:'BALANCER_RESEARCH_V18',mode:'FLASHBOTS_TARGET_FIRST_BACKRUN_REPLAY_READINESS',
  network:'ethereum-mainnet',researchSequence:['TARGET_TRANSACTION','BALANCER_FLASH_LOAN_ARBITRAGE_TRANSACTION'],
  target,simulationEligible:target.ready,
  status:target.ready?'TARGET_BYTES_VALIDATED_REPLAY_STILL_REQUIRED':'BLOCKED_INSUFFICIENT_TARGET_INFORMATION',
  targetTransactionReplayed:false,postTargetStateVerified:false,balancerBackrunExecuted:false,
  netProfitVerified:false,builderSimulationVerified:false,executionEligible:false,
  bundlesSubmitted:0,mainnetBroadcast:false,
  limitations:['FLASHBOTS_HINTS_ARE_NOT_RAW_SIGNED_TRANSACTIONS',
   'BUNDLE_HASH_NOT_SINGLE_TX_HASH','VALID_RAW_TX_NOT_PROOF_OF_REPLAY_SUCCESS',
   'NO_FABRICATED_TARGET_OR_AFTER_STATE','NO_SUBMISSION']};
}
module.exports={checkTarget,report};
if(require.main===module)console.log(JSON.stringify(report({
 targetHash:process.env.V18_TARGET_HASH,
 signedRawTransaction:process.env.V18_TARGET_RAW_TX,
 parentBlock:process.env.V18_PARENT_BLOCK?Number(process.env.V18_PARENT_BLOCK):undefined,
 kind:process.env.V18_TARGET_KIND||'TRANSACTION'
})));
