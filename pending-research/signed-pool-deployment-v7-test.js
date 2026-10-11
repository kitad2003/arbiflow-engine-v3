'use strict';
const assert=require('node:assert/strict');
const {Wallet}=require('ethers');
const {canonicalRecord}=require('./deployment-signature-v7');
const {evaluateSignedPoolDeployment}=require('./signed-pool-deployment-v7');
const signer=new Wallet('0x'+'11'.repeat(32));
const pool='0x1111111111111111111111111111111111111111',factory='0x2222222222222222222222222222222222222222',poolCodeHash='0x'+'a'.repeat(64),factoryCodeHash='0x'+'b'.repeat(64);
const manifest={reviewed:true,sourceType:'PINNED_DEPLOYMENT_MANIFEST',chainId:1,pool,factory,poolCodeHash,factoryCodeHash,validFromBlock:100};
const observation={collected:true,chainId:1,blockNumber:123,pool,factory,poolCodeHash,factoryCodeHash};
(async()=>{
 const signature=await signer.signMessage(canonicalRecord(manifest));
 const args={observation,manifest,signature,trustedSigner:signer.address};
 const good=evaluateSignedPoolDeployment(args);
 assert.equal(good.reason,'SIGNATURE_MATCH_ONLY_TRUST_ROOT_NOT_ESTABLISHED');
 assert.equal(good.identityVerified,false);assert.equal(good.alertEligible,false);
 assert.equal(evaluateSignedPoolDeployment({...args,observation:{...observation,poolCodeHash:'0x'+'c'.repeat(64)}}).reason,'DEPLOYMENT_MISMATCH');
 assert.equal(evaluateSignedPoolDeployment({...args,trustedSigner:'0x3333333333333333333333333333333333333333'}).reason,'DEPLOYMENT_SIGNATURE_REJECTED');
 console.log('V7_SIGNED_POOL_DEPLOYMENT_OFFLINE_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
