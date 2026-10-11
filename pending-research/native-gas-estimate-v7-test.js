'use strict';
const assert=require('node:assert/strict');
const {estimateNativeGasResearch}=require('./native-gas-estimate-v7');
const transaction={to:'0x1111111111111111111111111111111111111111',data:'0x1234'};
const provider={async getNetwork(){return {chainId:1n}},async estimateGas(){return 21000n},async getFeeData(){return {maxFeePerGas:1000000000n}}};
(async()=>{
 const args={provider,transaction,expectedChainId:1};
 const r=await estimateNativeGasResearch(args);
 assert.equal(r.estimated,true);assert.equal(r.maximumEstimatedGasWei,'21000000000000');assert.equal(r.netVerified,false);assert.equal(r.executionEligible,false);
 assert.equal((await estimateNativeGasResearch({...args,expectedChainId:8453})).reason,'CHAIN_MISMATCH');
 assert.equal((await estimateNativeGasResearch({...args,transaction:{...transaction,data:'bad'}})).reason,'INVALID_TRANSACTION');
 assert.equal((await estimateNativeGasResearch({...args,provider:{...provider,async getFeeData(){return {}}}})).reason,'GAS_OR_FEE_UNAVAILABLE');
 console.log('V7_NATIVE_GAS_ESTIMATE_OFFLINE_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
