'use strict';
const assert=require('node:assert/strict');
const {check}=require('./balancer-readiness-v41');
(async()=>{
 assert.equal((await check()).blockers[0],'ETHEREUM_RPC_REQUIRED');
 assert.equal((await check({provider:{getNetwork:async()=>({chainId:8453n})}})).blockers[0],'ETHEREUM_MAINNET_REQUIRED');
 const mock={getNetwork:async()=>({chainId:1n})};
 const factory=(address,abi)=>abi[0].includes('getProtocolFeesCollector')?{getProtocolFeesCollector:async()=> '0x'+'1'.repeat(40)}:
 abi[0].includes('getFlashLoanFeePercentage')?{getFlashLoanFeePercentage:async()=>0n}:{balanceOf:async()=>123456n};
 const report=await check({provider:mock,contractFactory:factory});
 assert.equal(report.chainVerified,true);
 assert.equal(report.balancerFeeVerified,true);
 assert.equal(report.balancerLiquidityVerified,true);
 assert.equal(report.flashLoanFeePercentageRaw,'0');
 assert.equal(report.vaultWethLiquidityWei,'123456');
 assert.equal(report.v26DeploymentVerified,false);
 assert.ok(report.blockers.includes('V26_CONTRACT_ADDRESS_NOT_CONFIGURED'));
 assert.equal(report.mainnetBroadcast,false);
 assert.equal(report.deployReady,false);
 assert.equal(report.bundlesSubmitted,0);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V41',unitAssertionsPassed:11,mockedFeeAndLiquidityChecks:true,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});