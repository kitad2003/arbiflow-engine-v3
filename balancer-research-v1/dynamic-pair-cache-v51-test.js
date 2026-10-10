'use strict';
const assert=require('node:assert/strict');
const {VerifiedPoolCache,inspect}=require('./dynamic-pair-cache-v51');
const A='0x'+'a'.repeat(40),B='0x'+'b'.repeat(40),C='0x'+'c'.repeat(40),D='0x'+'d'.repeat(40);
const provider={getNetwork:async()=>({chainId:1n})};
let calls=0,clock=1000;
const discoverImpl=async(_provider,log)=>{
 calls++;
 return {verifiedCrossVenuePair:true,blockNumber:123,identity:{pool:log.address,token0:C,token1:D,venue:'UNISWAP_V2'},
 alternative:{pool:B,venue:'SUSHISWAP_V2',found:true}};
};
(async()=>{
 const cache=new VerifiedPoolCache({discoverImpl,ttlMs:100,clock:()=>clock});
 const event={kind:'PENDING_TRANSACTION',pendingHash:'0x'+'f'.repeat(64),swapPools:[A,A.toUpperCase().replace('0X','0x')]};
 const first=await inspect(event,{provider,cache});
 assert.equal(first.pairs.length,1);assert.equal(first.pairs[0].cacheHit,false);
 assert.equal(first.pairs[0].token0,C);assert.equal(calls,1);
 const second=await inspect(event,{provider,cache});
 assert.equal(second.pairs[0].cacheHit,true);assert.equal(calls,1);
 clock+=101;await inspect(event,{provider,cache});assert.equal(calls,2);
 const concurrent=new VerifiedPoolCache({discoverImpl});
 await Promise.all([concurrent.resolve(provider,A),concurrent.resolve(provider,A)]);
 assert.equal(calls,3);
 // Two distinct disclosed pools must be inspected without any token allowlist.
 const multi=await inspect({kind:'PENDING_TRANSACTION',pendingHash:event.pendingHash,
  swapPools:[A,B]},{provider,cache});
 assert.equal(multi.pairs.length,2);
 assert.equal(multi.pairs[0].pool,A);
 assert.equal(multi.pairs[1].pool,B);
 assert.equal(multi.pairs[0].token1,D);
 assert.equal(multi.executionEligible,false);
 const bundle=await inspect({kind:'BUNDLE',swapPools:[A]},{provider,cache});
 assert.equal(bundle.pairs.length,0);
 assert.equal(first.executionEligible,false);assert.equal(first.mainnetBroadcast,false);
 assert.deepEqual(first.alerts,[]);assert.equal(first.simulationAttempted,false);
 const wrong={getNetwork:async()=>({chainId:8453n})};
 await assert.rejects(()=>inspect(event,{provider:wrong,cache}),/ETHEREUM_MAINNET_REQUIRED/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V51',status:'UNIT_TEST_PASS',discoveryCalls:calls,readOnly:true,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
