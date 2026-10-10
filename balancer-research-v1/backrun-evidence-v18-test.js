'use strict';
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {checkTarget,report}=require('./backrun-evidence-v18');
const wallet=new ethers.Wallet('0x'+'1'.repeat(64));
(async()=>{
 const tx=await wallet.signTransaction({chainId:1,nonce:0,to:'0x'+'2'.repeat(40),gasLimit:21000,gasPrice:1000000000n,value:1n});
 const hash=ethers.Transaction.from(tx).hash;
 assert.equal(checkTarget({}).reason,'TARGET_HASH_REQUIRED');
 assert.equal(checkTarget({targetHash:hash}).reason,'MEV_SHARE_HINT_NOT_SIGNED_TARGET_TRANSACTION');
 assert.equal(checkTarget({targetHash:hash,kind:'BUNDLE',signedRawTransaction:tx,parentBlock:100}).reason,'BUNDLE_HASH_NOT_SINGLE_TARGET_TRANSACTION');
 assert.equal(checkTarget({targetHash:hash,signedRawTransaction:tx}).reason,'PARENT_BLOCK_REQUIRED_FOR_ORDERED_REPLAY');
 assert.equal(checkTarget({targetHash:'0x'+'f'.repeat(64),signedRawTransaction:tx,parentBlock:100}).reason,'TARGET_HASH_MISMATCH');
 const valid=checkTarget({targetHash:hash,signedRawTransaction:tx,parentBlock:100});
 assert.equal(valid.ready,true);
 assert.equal(valid.actualReplayVerified,false);
 assert.equal(report({targetHash:hash}).targetTransactionReplayed,false);
 assert.equal(report({targetHash:hash}).executionEligible,false);
 assert.equal(report({targetHash:hash}).status,'BLOCKED_INSUFFICIENT_TARGET_INFORMATION');
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V18',unitAssertionsPassed:10,mockSignedTx:true,
  pendingTransactionReplayed:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
