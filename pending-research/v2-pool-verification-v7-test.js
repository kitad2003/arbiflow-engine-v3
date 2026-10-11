'use strict';
const assert=require('node:assert/strict');
const {Interface}=require('ethers');
const {verifyV2Pool}=require('./v2-pool-verification-v7');
const I=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function factory() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)']);
const pool='0x1111111111111111111111111111111111111111',a='0x2222222222222222222222222222222222222222',b='0x3333333333333333333333333333333333333333',factory='0x4444444444444444444444444444444444444444';
function provider(factoryOverride=factory,zero=false){return {async call({data}){const name=I.getFunction(data.slice(0,10)).name;const values={token0:[a],token1:[b],factory:[factoryOverride],getReserves:[zero?0n:1000n,2000n,0]};return I.encodeFunctionResult(name,values[name])}}}
(async()=>{
 const args={provider:provider(),pool,tokenA:a,tokenB:b,expectedFactory:factory};
 const valid=await verifyV2Pool(args);assert.equal(valid.verified,true);assert.equal(valid.executionEligible,false);
 assert.equal((await verifyV2Pool({...args,provider:provider(a)})).reason,'FACTORY_MISMATCH');
 assert.equal((await verifyV2Pool({...args,provider:provider(factory,true)})).reason,'ZERO_RESERVES');
 assert.equal((await verifyV2Pool({...args,tokenB:factory})).reason,'TOKEN_PAIR_MISMATCH');
 assert.equal((await verifyV2Pool({...args,expectedFactory:null})).reason,'INVALID_OR_UNVERIFIED_INPUT');
 console.log('V7_V2_POOL_OFFLINE_TEST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
