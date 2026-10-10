'use strict';
const assert=require('node:assert/strict');
const {ADAPTERS,deduplicate,audit}=require('./dynamic-dex-registry-v1');
const a={chainId:1,adapter:'V2_CONSTANT_PRODUCT',factory:'0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',token0:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',token1:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',source:'FACTORY'};
const b={...a,token0:a.token1,token1:a.token0};
const d=deduplicate([a,b,{...a,adapter:'FAKE'}]);
assert.equal(d.entries.length,1);assert.equal(d.invalidEntries,1);
assert(ADAPTERS.includes('V3_CONCENTRATED'));
(async()=>{
 const missing=await audit([a],{providers:{},delayMs:0});assert.equal(missing.contractsVerified,0);assert.equal(missing.results[0].reason,'CHAIN_RPC_NOT_CONFIGURED');
 const mocked=await audit([a],{providers:{1:{}},delayMs:0,waitImpl:async()=>{},verifyImpl:async(_,row)=>({...row,verified:true})});
 assert.equal(mocked.contractsVerified,1);assert.equal(mocked.quotesVerified,0);assert.equal(mocked.executionEligible,false);
 console.log(JSON.stringify({build:'ARBIFLOW_DYNAMIC_DEX_REGISTRY_V1',tests:'PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1});
