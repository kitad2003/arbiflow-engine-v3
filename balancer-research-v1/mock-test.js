'use strict';
const assert=require('node:assert/strict'),hre=require('hardhat');
async function main(){
 const {ethers}=hre;const [operator]=await ethers.getSigners();
 const token=await (await ethers.getContractFactory('MockResearchToken')).deploy();
 const zeroVault=await (await ethers.getContractFactory('MockBalancerVault')).deploy(0);
 const receiver=await (await ethers.getContractFactory('BalancerFlashLoanResearch')).deploy(await zeroVault.getAddress());
 const amount=100000000n;await (await token.mint(await zeroVault.getAddress(),amount*10n)).wait();
 await (await receiver.begin([await token.getAddress()],[amount])).wait();
 assert.equal(await token.balanceOf(await zeroVault.getAddress()),amount*10n);
 const feeVault=await (await ethers.getContractFactory('MockBalancerVault')).deploy(10);
 const feeReceiver=await (await ethers.getContractFactory('BalancerFlashLoanResearch')).deploy(await feeVault.getAddress());
 await (await token.mint(await feeVault.getAddress(),amount*10n)).wait();
 await assert.rejects(feeReceiver.begin([await token.getAddress()],[amount]),/INSUFFICIENT_REPAYMENT/);
 assert.equal(await token.balanceOf(await feeVault.getAddress()),amount*10n);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V2',mode:'LOCAL_MOCK_CALLBACK_TEST',zeroFeeLoanRepaid:true,
  nonzeroFeeWithoutPrefundingReverted:true,mainnetBroadcast:false,realVaultTested:false,profitVerified:false,assertionsPassed:3}));
}
main().catch(e=>{console.error('BALANCER_MOCK_TEST_FAILED',String(e.shortMessage||e.message||e).slice(0,250));process.exitCode=1});
