'use strict';
const assert=require('node:assert/strict');
const {simulateResearchTransaction}=require('./eth-call-simulation-v7');
const h='0x'+'a'.repeat(64),b='0x'+'b'.repeat(64);
const transaction={to:'0x1111111111111111111111111111111111111111',data:'0x1234'};
function provider(reorg=false,revert=false){let reads=0;return {async getNetwork(){return {chainId:1n}},async getCode(addr,n){assert.equal(addr,transaction.to);assert.equal(n,123);return '0x6000'},async getBlock(n){assert.equal(n,123);reads++;return {number:123,hash:reorg&&reads>1?b:h}},async send(method,params){assert.equal(method,'eth_call');assert.equal(params[0].to,transaction.to);assert.deepEqual(params[1],{blockHash:h,requireCanonical:true});if(revert)throw Error('reverted');return '0x'}}}
(async()=>{
 const args={provider:provider(),transaction,expectedChainId:1,blockNumber:123,blockHash:h};
 const x=await simulateResearchTransaction(args);assert.equal(x.simulated,true);assert.equal(x.executionEligible,false);assert.equal(x.profitVerified,false);
 assert.equal((await simulateResearchTransaction({...args,provider:provider(true)})).reason,'BLOCK_REORG_DURING_CODE_CHECK');
 assert.equal((await simulateResearchTransaction({...args,provider:provider(false,true)})).reason,'ETH_CALL_REVERTED_OR_FAILED');
 // The block may reorganize after a successful or reverted eth_call.
 for(const revert of [false,true]){
  let reads=0;
  const p={...provider(false,revert),async getBlock(n){assert.equal(n,123);return {number:123,hash:++reads>=3?b:h}}};
  assert.equal((await simulateResearchTransaction({...args,provider:p})).reason,'BLOCK_REORG_DURING_SIMULATION');
 }
 assert.equal((await simulateResearchTransaction({...args,provider:{...provider(),send:async()=> 'invalid'}})).reason,'INVALID_CALL_RESULT');
 assert.equal((await simulateResearchTransaction({...args,provider:{...provider(),send:async()=>{throw Error('blockHash unsupported')}}})).reason,'ETH_CALL_REVERTED_OR_FAILED');
 assert.equal((await simulateResearchTransaction({...args,provider:{...provider(),getCode:async()=> '0x'}})).reason,'TARGET_CONTRACT_CODE_MISSING');
 assert.equal((await simulateResearchTransaction({...args,provider:{...provider(),send:undefined}})).reason,'INVALID_PROVIDER');
 assert.equal((await simulateResearchTransaction({...args,expectedChainId:8453})).reason,'CHAIN_MISMATCH');
 assert.equal((await simulateResearchTransaction({...args,transaction:{...transaction,data:'bad'}})).reason,'INVALID_TRANSACTION');
 console.log('V7_ETH_CALL_SIMULATION_OFFLINE_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
