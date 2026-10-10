'use strict';
const {ethers}=require('hardhat');
const assert=require('node:assert/strict');
async function main(){
 const T=await ethers.getContractFactory('ResearchTokenV5');
 const V=await ethers.getContractFactory('MockBalancerVaultV5');
 const R=await ethers.getContractFactory('MockFixedRateRouterV5');
 const E=await ethers.getContractFactory('BalancerTwoSwapResearch');
 const loan=await T.deploy(),intermediate=await T.deploy();
 const vault=await V.deploy(10); // intentionally nonzero fee, 10 bps
 const routerA=await R.deploy(2,1),routerB=await R.deploy(51,100);
 const executor=await E.deploy(await vault.getAddress());
 for(const c of [loan,intermediate,vault,routerA,routerB,executor])await c.waitForDeployment();
 const amt=1000000n,VA=await vault.getAddress(),LA=await loan.getAddress(),IA=await intermediate.getAddress();
 await (await loan.mint(VA,amt*10n)).wait();
 await (await intermediate.mint(await routerA.getAddress(),amt*4n)).wait();
 await (await loan.mint(await routerB.getAddress(),amt*4n)).wait();
 const now=(await ethers.provider.getBlock('latest')).timestamp;
 const plan={loanToken:LA,intermediateToken:IA,routerA:await routerA.getAddress(),routerB:await routerB.getAddress(),principal:amt,minIntermediate:2n*amt,minLoanReturned:101n*amt/100n,minProfit:1000n,deadline:BigInt(now+3600)};
 const before=await loan.balanceOf(VA);
 const tx=await executor.start(plan),receipt=await tx.wait();
 const after=await loan.balanceOf(VA);
 const surplus=await loan.balanceOf(await executor.getAddress());
 assert.equal(after,before+1000n); // actual mock loan fee = 10 bps
 assert.equal(surplus,19000n); // 2x, then 0.51x => 1.02m, repay 1.001m
 assert.equal(receipt.status,1);
 const bad=await E.deploy(VA);await bad.waitForDeployment();
 await assert.rejects(bad.start({...plan,routerB:await (await R.deploy(49,100)).getAddress()})); // missing output inventory MUST revert
 assert.equal(await loan.balanceOf(VA),after,'ATOMIC_ROLLBACK_FAILED');
 assert.equal(await loan.balanceOf(await bad.getAddress()),0n);
 const insufficient=await E.deploy(VA);await insufficient.waitForDeployment();
 await assert.rejects(insufficient.start({...plan,minProfit:25000n}),/INSUFFICIENT_PROFIT_AFTER_REPAYMENT/);
 assert.equal(await loan.balanceOf(VA),after);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V5',mode:'MOCKED_TWO_SWAP_ATOMIC_TEST',
  testLoanRaw:amt.toString(),mockFeeRaw:'1000',mockSurplusRaw:surplus.toString(),repaymentRestored:true,
  lossOrInadequateProfitReverted:true,gasUsed:receipt.gasUsed.toString(),
  realExchangeQuotes:false,realBalancerForkSwaps:false,verifiedNetProfit:false,mainnetBroadcast:false}));
}
main().catch(e=>{console.error('BALANCER_V5_FAILED',String(e.shortMessage||e.message||e).slice(0,250));process.exitCode=1});
