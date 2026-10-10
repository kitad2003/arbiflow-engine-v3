'use strict';
const assert=require('node:assert/strict');
const {OBSERVED_POOL,verify}=require('./verify-observed-pool-v15');
const provider={getNetwork:async()=>({chainId:1n})};
const token0='0x'+'1'.repeat(40),token1='0x'+'2'.repeat(40);
(async()=>{
 let calls=0;
 const verified=await verify({provider,discoverImpl:async(_p,log)=>{
  calls++;assert.equal(log.address,OBSERVED_POOL);
  return {recognized:true,blockNumber:123,blockHash:'0x'+'a'.repeat(64),
   identity:{verified:true,venue:'UNISWAP_V2',factory:'0x'+'b'.repeat(40),token0,token1},
   alternative:{found:true,venue:'SUSHISWAP_V2',pool:'0x'+'c'.repeat(40),factory:'0x'+'d'.repeat(40)},
   verifiedCrossVenuePair:true};
 }});
 assert.equal(calls,1);
 assert.equal(verified.originatingPoolVerified,true);
 assert.equal(verified.alternativePairFound,true);
 assert.equal(verified.verifiedCrossVenuePair,true);
 assert.equal(verified.profitVerified,false);
 assert.equal(verified.executionEligible,false);
 assert.equal(verified.mainnetBroadcast,false);
 const rejected=await verify({provider,discoverImpl:async()=>({
  recognized:true,identity:{verified:false,reason:'UNRECOGNIZED_FACTORY'},
  alternative:{found:false,reason:'TRIGGER_PAIR_UNVERIFIED'},verifiedCrossVenuePair:false})});
 assert.equal(rejected.originatingPoolVerified,false);
 assert.equal(rejected.verifiedCrossVenuePair,false);
 assert.equal(rejected.originFailureReason,'UNRECOGNIZED_FACTORY');
 await assert.rejects(verify({provider:{getNetwork:async()=>({chainId:8453n})},discoverImpl:async()=>{throw Error('CALL_UNEXPECTED')}}),/ETHEREUM_MAINNET_REQUIRED/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V15',unitAssertionsPassed:11,
  mockedOnchainResults:true,liveEthereumVerified:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
