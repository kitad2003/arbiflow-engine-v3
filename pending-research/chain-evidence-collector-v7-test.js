'use strict';
const assert=require('node:assert/strict');
const {collectPoolChainEvidence}=require('./chain-evidence-collector-v7');
const pool='0x1111111111111111111111111111111111111111',factory='0x2222222222222222222222222222222222222222';
const blockHash='0x'+'a'.repeat(64);
function provider(code='0x6000'){return {async getNetwork(){return {chainId:1n}},async getBlockNumber(){return 123},async getBlock(n){assert.equal(n,123);return {hash:blockHash}},async getCode(_address,n){assert.equal(n,123);return code}}}
(async()=>{
 const args={provider:provider(),pool,factory,expectedChainId:1};
 const r=await collectPoolChainEvidence(args);
 assert.equal(r.collected,true);assert.equal(r.identityVerified,false);assert.equal(r.executionEligible,false);
 assert.equal(r.poolCodeHash.length,66);assert.equal(r.factoryCodeHash.length,66);
 assert.equal((await collectPoolChainEvidence({...args,expectedChainId:8453})).reason,'CHAIN_ID_MISMATCH');
 assert.equal((await collectPoolChainEvidence({...args,provider:provider('0x')})).reason,'CONTRACT_CODE_MISSING');
 assert.equal((await collectPoolChainEvidence({...args,provider:{}})).reason,'INVALID_INPUT_OR_PROVIDER');
 let reads=0;
 const reorgProvider={...provider(),async getBlock(n){assert.equal(n,123);reads++;return {hash:reads===1?blockHash:'0x'+'b'.repeat(64)}}};
 assert.equal((await collectPoolChainEvidence({...args,provider:reorgProvider})).reason,'BLOCK_REORG_OR_INCONSISTENT_PROVIDER');
 console.log('V7_CHAIN_EVIDENCE_COLLECTOR_OFFLINE_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
