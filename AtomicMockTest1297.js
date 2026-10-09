'use strict';
// Disposable Hardhat local EVM test; never signs/broadcasts to Base mainnet.
const hre=require('hardhat');
const assert=require('node:assert/strict');
async function main(){
 const e=hre.ethers;const [owner,attacker]=await e.getSigners();
 const T=await e.getContractFactory('MockToken1297');const usdc=await T.deploy();const weth=await T.deploy();
 const L=await e.getContractFactory('MockLender1297');const lender=await L.deploy();
 const V=await e.getContractFactory('MockVenue1297');const buy=await V.deploy(1,1);const sell=await V.deploy(1002,1000);
 const F=await e.getContractFactory('ArbiFlowAtomicFixture1296');
 const fixture=await F.deploy(await lender.getAddress(),await usdc.getAddress(),await weth.getAddress(),await buy.getAddress(),await sell.getAddress());
 const unit=1000000n;
 await (await usdc.mint(await lender.getAddress(),100000n*unit)).wait();
 await (await weth.mint(await buy.getAddress(),100000n*unit)).wait();
 await (await usdc.mint(await sell.getAddress(),100000n*unit)).wait();
 const now=(await e.provider.getBlock('latest')).timestamp;
 const plan={amount:500n*unit,minWeth:499n*unit,minUsdc:500n*unit,minProfit:1n,deadline:BigInt(now+3600),buyAtA:true};
 let unauthorized=false;
 try{await (await fixture.connect(attacker).runFixture(plan)).wait()}catch{unauthorized=true}
 assert(unauthorized,'non-owner must be rejected');
 let badCallback=false;
 try{await (await fixture.connect(attacker).executeOperation(await usdc.getAddress(),1,0,attacker.address,'0x')).wait()}catch{badCallback=true}
 assert(badCallback,'forged callback must be rejected');
 const before=await usdc.balanceOf(await lender.getAddress());
 const receipt=await (await fixture.runFixture(plan)).wait();
 const after=await usdc.balanceOf(await lender.getAddress());
 assert.equal(after-before,250000n,'lender premium should be repaid');
 const lowProfit={...plan,minProfit:2000000n};
 let reverted=false;
 try{await (await fixture.runFixture(lowProfit)).wait()}catch{reverted=true}
 assert(reverted,'insufficient profit must revert');
 const expired={...plan,deadline:0n};
 let expiredRejected=false;
 try{await (await fixture.runFixture(expired)).wait()}catch{expiredRejected=true}
 assert(expiredRejected,'expired plan must revert');
 console.log(JSON.stringify({success:true,build:'12.9.7',test:'DETERMINISTIC_LOCAL_EVM_ATOMIC_MOCK',tests:{authorizedSuccess:true,unauthorizedRejected:true,forgedCallbackRejected:true,unprofitableReverted:true,expiredRejected:true,premiumRepaid:true},mockFixtureGasUsed:receipt.gasUsed.toString(),gasUnitsAreActualArbitrage:false,realAaveUsed:false,realDexUsed:false,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
