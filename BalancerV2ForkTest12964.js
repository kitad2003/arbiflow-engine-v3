'use strict';
// Balancer V2 only; all writes happen inside a disposable Hardhat Base fork.
const assert=require('node:assert/strict'),hre=require('hardhat');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8',USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',AMOUNT=10000n*1000000n;
async function main(){
 assert.equal(hre.network.name,'hardhat','HARDHAT_ONLY');
 assert(process.env.BASE_RPC_URL?.startsWith('https://'),'RPC_REQUIRED');
 const p=hre.ethers.provider;assert.equal((await p.getNetwork()).chainId,8453n,'BASE_FORK_REQUIRED');
 assert.notEqual(await p.getCode(VAULT),'0x','BALANCER_V2_NOT_DEPLOYED');
 const token=new hre.ethers.Contract(USDC,['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)'],p);
 const before=await token.balanceOf(VAULT);
 assert(before>=AMOUNT,'INSUFFICIENT_VAULT_USDC_FOR_10000');
 const Receiver=await hre.ethers.getContractFactory('BalancerV2ForkReceiver12964');
 const receiver=await Receiver.deploy(VAULT,USDC);await receiver.waitForDeployment();
 // Calculate fee from registered protocol fees collector if callable.
 const vault=new hre.ethers.Contract(VAULT,['function getProtocolFeesCollector() view returns(address)'],p);
 const feeCollector=await vault.getProtocolFeesCollector();
 const collector=new hre.ethers.Contract(feeCollector,['function getFlashLoanFeePercentage() view returns(uint256)'],p);
 const pct=BigInt(await collector.getFlashLoanFeePercentage()); // WAD-scaled
 const fee=(AMOUNT*pct+999999999999999999n)/1000000000000000000n;
 if(fee>0n){
  // Provide fee only on the isolated fork; does NOT mean zero cost on real trades.
  await hre.network.provider.send('hardhat_impersonateAccount',[VAULT]);
  await hre.network.provider.send('hardhat_setBalance',[VAULT,'0x56BC75E2D63100000']);
  const signer=await hre.ethers.getSigner(VAULT);
  const fund=new hre.ethers.Contract(USDC,['function transfer(address,uint256) returns(bool)'],signer);
  await (await fund.transfer(await receiver.getAddress(),fee)).wait();
 }
 const [tester]=await hre.ethers.getSigners();
 const receipt=await (await receiver.connect(tester).start(AMOUNT,{gasLimit:3000000})).wait();
 assert.equal(receipt.status,1,'FLASHLOAN_REVERTED');
 assert.equal(await receiver.callbackSeen(),true,'CALLBACK_NOT_VERIFIED');
 assert.equal(await receiver.borrowed(),AMOUNT,'PRINCIPAL_MISMATCH');
 assert.equal(await receiver.paidFee(),fee,'FEE_MISMATCH');
 const after=await token.balanceOf(VAULT);
 assert(after>=before-fee,'VAULT_UNDERPAID');
 console.log(JSON.stringify({success:true,build:'BALANCER_V2_FORK_1',test:'BASE_HARDHAT_BALANCER_V2_10000_USDC',block:await p.getBlockNumber(),vault:VAULT,loanPrincipalUsdc:10000,vaultUsdcBefore:Number(before)/1e6,feeRaw:fee.toString(),feePercentageWad:pct.toString(),callbackVerified:true,repaymentVerified:true,gasUnits:receipt.gasUsed.toString(),premiumFundedOnForkOnly:fee>0n,profitVerified:false,realDexUsed:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false}));
}
main().catch(e=>{console.error('BALANCER_V2_FORK_FAILED',String(e?.shortMessage||e?.message||e).slice(0,210));process.exitCode=1});
