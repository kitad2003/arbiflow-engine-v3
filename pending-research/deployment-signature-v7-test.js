'use strict';
const assert=require('node:assert/strict');
const {Wallet}=require('ethers');
const {canonicalRecord,verifyDeploymentSignature}=require('./deployment-signature-v7');
const wallet=new Wallet('0x'+'11'.repeat(32));
const r={chainId:1,pool:'0x1111111111111111111111111111111111111111',factory:'0x2222222222222222222222222222222222222222',poolCodeHash:'0x'+'a'.repeat(64),factoryCodeHash:'0x'+'b'.repeat(64),validFromBlock:100};
(async()=>{
 const signature=await wallet.signMessage(canonicalRecord(r));
 const x=verifyDeploymentSignature({record:r,signature,trustedSigner:wallet.address});
 assert.equal(x.signatureValid,true);assert.equal(x.identityVerified,false);assert.equal(x.alertEligible,false);
 assert.equal(verifyDeploymentSignature({record:{...r,chainId:8453},signature,trustedSigner:wallet.address}).signatureValid,false);
 assert.equal(verifyDeploymentSignature({record:r,signature,trustedSigner:'0x3333333333333333333333333333333333333333'}).reason,'SIGNER_MISMATCH');
 assert.equal(verifyDeploymentSignature({record:r,signature:'fake',trustedSigner:wallet.address}).signatureValid,false);
 console.log('V7_DEPLOYMENT_SIGNATURE_OFFLINE_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
