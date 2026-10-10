'use strict';
const assert=require('node:assert/strict');
const {investigate,VAULT}=require('./ethereum-preflight-v16');
const p='0x'+'1'.repeat(40),q='0x'+'2'.repeat(40);
const pool='0x'+'3'.repeat(40),alt='0x'+'4'.repeat(40);
const provider={getNetwork:async()=>({chainId:1n}),getBlock:async()=>({number:123,hash:'0x'+'f'.repeat(64)})};
const pair={verifiedCrossVenuePair:true,observedPool:pool,alternativePool:alt,token0:p,token1:q,originVenue:'UNISWAP_V2',alternativeVenue:'SUSHISWAP_V2'};
(async()=>{
 let calls=0;
 const r=await investigate({provider,verifiedPairResult:pair,
 reserveReader:async(_provider,address,_a,_b,block)=>{calls++;assert.equal(block,123);return {verified:true,pool:address,reserve0Raw:'100',reserve1Raw:'200',nonzeroReserves:true}},
 balancerVerifier:async x=>{assert.equal(x.expectedChainId,1);assert.equal(x.tokenAddress,p);return {vaultReadMethodsVerified:true,blockNumber:123,blockHash:'0x'+'f'.repeat(64),token:{vaultBalanceRaw:'1000'},flashLoanFeePercentageRaw:'0',feeDenominator:'1000000000000000000'}}});
 assert.equal(calls,2);
 assert.equal(r.status,'READ_ONLY_PREFLIGHT_COMPLETED');
 assert.equal(r.crossVenuePairVerified,true);
 assert.equal(r.liquidityReadOnly,true);
 assert.equal(r.balancerVaultReadsVerified,true);
 assert.equal(r.balancerFlashLoanExecuted,false);
 assert.equal(r.profitVerified,false);
 assert.equal(r.executionEligible,false);
 assert.equal(VAULT.toLowerCase(),'0xba12222222228d8ba445958a75a0704d566bf2c8');
 const blocked=await investigate({provider,verifiedPairResult:{verifiedCrossVenuePair:false}});
 assert.equal(blocked.status,'BLOCKED_UNVERIFIED_PAIR');
 await assert.rejects(investigate({provider:{getNetwork:async()=>({chainId:8453n})},verifiedPairResult:pair}),/ETHEREUM_MAINNET_REQUIRED/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V16',unitAssertionsPassed:11,mockedEthereumReads:true,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
