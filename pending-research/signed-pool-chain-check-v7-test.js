'use strict';
const assert=require('node:assert/strict');
const {Wallet}=require('ethers');
const {canonicalRecord}=require('./deployment-signature-v7');
const {inspectSignedPoolOnChain}=require('./signed-pool-chain-check-v7');
const pool='0x1111111111111111111111111111111111111111',factory='0x2222222222222222222222222222222222222222';
const signer=new Wallet('0x'+'11'.repeat(32));
const provider={async getNetwork(){return {chainId:1n}},async getBlockNumber(){return 123},async getBlock(){return {hash:'0x'+'a'.repeat(64)}},async getCode(){return '0x6000'}};
(async()=>{
 const {collectPoolChainEvidence}=require('./chain-evidence-collector-v7');
 const observed=await collectPoolChainEvidence({provider,pool,factory,expectedChainId:1});
 const manifest={reviewed:true,sourceType:'PINNED_DEPLOYMENT_MANIFEST',chainId:1,pool,factory,poolCodeHash:observed.poolCodeHash,factoryCodeHash:observed.factoryCodeHash,validFromBlock:100};
 const signature=await signer.signMessage(canonicalRecord(manifest));
 const result=await inspectSignedPoolOnChain({provider,pool,factory,expectedChainId:1,manifest,signature,trustedSigner:signer.address});
 assert.equal(result.observation.collected,true);assert.equal(result.review.signatureResult.signatureValid,true);
 assert.equal(result.identityVerified,false);assert.equal(result.alertEligible,false);assert.equal(result.executionEligible,false);
 assert.equal((await inspectSignedPoolOnChain({provider,pool,factory,expectedChainId:8453,manifest,signature,trustedSigner:signer.address})).reason,'CHAIN_COLLECTION_FAILED');
 console.log('V7_SIGNED_POOL_CHAIN_CHECK_OFFLINE_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
