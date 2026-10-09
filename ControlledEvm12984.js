'use strict';
const hre=require('hardhat'),assert=require('node:assert/strict'),fs=require('node:fs');
async function main(){
 const e=hre.ethers,[owner,other]=await e.getSigners();
 const T=await e.getContractFactory('ControlToken12984'),U=await T.deploy('USD Coin','USDC',6),E=await T.deploy('Ether','WETH',18);
 const P=await e.getContractFactory('ConstantProductPool12984'),A=await P.deploy(await U.getAddress(),await E.getAddress()),B=await P.deploy(await U.getAddress(),await E.getAddress());
 const L=await e.getContractFactory('LoanFixture12984'),lender=await L.deploy(await U.getAddress());
 const C=await e.getContractFactory('AtomicController12984'),bot=await C.deploy(await U.getAddress(),await E.getAddress(),await lender.getAddress(),await A.getAddress(),await B.getAddress());
 const u=10n**6n,w=10n**18n; await (await U.mint(owner.address,410000n*u)).wait();await (await E.mint(owner.address,200n*w)).wait();
 await (await U.approve(await A.getAddress(),200000n*u)).wait();await (await E.approve(await A.getAddress(),100n*w)).wait();await (await A.seed(200000n*u,100n*w)).wait();
 await (await U.approve(await B.getAddress(),210000n*u)).wait();await (await E.approve(await B.getAddress(),100n*w)).wait();await (await B.seed(210000n*u,100n*w)).wait();
 await (await U.mint(await lender.getAddress(),100000n*u)).wait();
 const baseline=await U.balanceOf(await lender.getAddress()),target=2146n*u;
 const bought=await A.quote(target,200000n*u,100n*w);
 const sold=await B.quote(bought,100n*w,210000n*u);
 const fee=(target*5n+9999n)/10000n,expected=sold-target-fee;
 assert(expected>0n,'positive case must have a surplus');
 let blocked=false;
 try{await (await bot.connect(other).run(target,1,1,1)).wait()}catch{blocked=true}assert(blocked,'owner protection');
 blocked=false;try{await (await bot.connect(other).onLoan(target,fee)).wait()}catch{blocked=true}assert(blocked,'callback protection');
 const tx=await bot.run(target,bought,sold,1),receipt=await tx.wait(),got=await U.balanceOf(await bot.getAddress());
 assert.equal(got,expected,'actual onchain residual should match deterministic quote');
 assert.equal(await U.balanceOf(await lender.getAddress()),baseline+fee,'flash lender repaid with premium');
 assert.equal(await E.balanceOf(await bot.getAddress()),0n,'no leftover WETH');
 const beforeA=await A.reserveUSD(),beforeB=await B.reserveUSD(),beforeLoan=await U.balanceOf(await lender.getAddress());
 blocked=false;try{await (await bot.run(500n*u,1,1,100000n*u)).wait()}catch{blocked=true}
 assert(blocked,'unprofitable min-profit trade should revert');
 assert.equal(await A.reserveUSD(),beforeA,'buy pool unchanged after reverted trade');
 assert.equal(await B.reserveUSD(),beforeB,'sell pool unchanged after reverted trade');
 assert.equal(await U.balanceOf(await lender.getAddress()),beforeLoan,'lender unchanged after reverted trade');
 const gasPrice=receipt.gasPrice||0n,gasWei=receipt.gasUsed*gasPrice;
 const out={build:'12.9.84',status:'PASS',testsPassed:8,chainId:(await e.provider.getNetwork()).chainId.toString(),
 principalUSDC:Number(target)/1e6,profitBeforeGasUSDC:Number(got)/1e6,
 expectedProfitBeforeGasUSDC:Number(expected)/1e6,flashLoanPremiumUSDC:Number(fee)/1e6,
 gasUsed:receipt.gasUsed.toString(),gasPriceWei:gasPrice.toString(),gasCostWei:gasWei.toString(),
 gasAdjustedProfitUSD:null,gasAdjustedProfitVerified:false,
 note:'EVM gas is paid in ETH and no oracle conversion is assumed. This is a local mock atomic flash loan and DEX execution, not a real protocol fork.',
 unauthorizedRejected:true,forgedCallbackRejected:true,negativeTradeReverted:true,negativeRollbackVerified:true,
 mainnetBroadcast:false,externalRpcUsed:false,fundsMovedOnMainnet:false,executionEligible:false};
 fs.writeFileSync('arbiflow-controlled-evm-12984.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
}
main().catch(e=>{console.error('CONTROLLED_EVM_12984_FAILED',e);process.exitCode=1});
