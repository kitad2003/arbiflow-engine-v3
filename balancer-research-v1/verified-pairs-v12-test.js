'use strict';
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {SWAP_TOPIC}=require('./bot');
const {FACTORIES,identifyPair,alternative,discover}=require('./verified-pairs-v12');
const invalid={getCode:async()=> '0x'};
const pool='0x'+'a'.repeat(40);
(async()=>{
 assert.equal((await identifyPair(invalid,pool,123)).reason,'PAIR_CODE_ABSENT');
 assert.equal((await identifyPair(invalid,'invalid',123)).reason,'INVALID_PAIR_ADDRESS');
 assert.equal((await alternative(invalid,{verified:false},123)).found,false);
 assert.equal((await discover(invalid,{address:pool,topics:['0x'+'0'.repeat(64)]})).recognized,false);
 assert.equal(Object.keys(FACTORIES).length,2);
 assert.equal(ethers.isAddress(FACTORIES.UNISWAP_V2),true);
 assert.equal(ethers.isAddress(FACTORIES.SUSHISWAP_V2),true);
 const wrongNetwork={getNetwork:async()=>({chainId:8453n})};
 await assert.rejects(discover(wrongNetwork,{address:pool,topics:[SWAP_TOPIC]}),/ETHEREUM_MAINNET_REQUIRED/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V12',unitAssertionsPassed:8,
  venueRegistry:'FLASHBOTS_TUTORIAL_V2_FACTORIES_ONLY',mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
