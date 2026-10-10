'use strict';
// All transactions below run against Hardhat's IN-MEMORY Base fork.
const {ethers}=require('hardhat');
const assert=require('node:assert/strict');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
async function main(){
 const provider=ethers.provider;
 const network=await provider.getNetwork();
 assert.equal(network.chainId,31337n,'ISOLATED_LOCAL_CHAIN_REQUIRED');
 const upstream=new ethers.JsonRpcProvider(process.env.BALANCER_FORK_RPC_URL);
 try{assert.equal((await upstream.getNetwork()).chainId,8453n,'UPSTREAM_BASE_REQUIRED')}
 finally{upstream.destroy()}

 // On Base forks, Hardhat can classify eth_call at the fork's exact block as
 // historical and fail before executing. Mine an isolated LOCAL successor block
 // so all following eth_call invocations run at a post-fork block.
 const forkHeight=await provider.getBlockNumber();
 await provider.send('evm_mine',[]);
 const localHeight=await provider.getBlockNumber();
 assert.equal(localHeight,forkHeight+1,'LOCAL_POST_FORK_BLOCK_NOT_MINED');
 const vaultCode=await provider.getCode(VAULT);
 assert.notEqual(vaultCode,'0x','NO_VAULT_CODE');
 const token=new ethers.Contract(USDC,[
  'function balanceOf(address) view returns(uint256)',
  'function decimals() view returns(uint8)'
 ],provider);
 const vault=new ethers.Contract(VAULT,['function getProtocolFeesCollector() view returns(address)'],provider);
 const feeCollector=await vault.getProtocolFeesCollector();
 const fees=new ethers.Contract(feeCollector,['function getFlashLoanFeePercentage() view returns(uint256)'],provider);
 const feePct=await fees.getFlashLoanFeePercentage();
 const decimals=Number(await token.decimals());
 assert.equal(decimals,6,'UNEXPECTED_USDC_DECIMALS');
 const principal=ethers.parseUnits('100',decimals);
 const before=await token.balanceOf(VAULT);
 const base={build:'BALANCER_RESEARCH_V4',mode:'ISOLATED_BASE_FORK_REAL_BALANCER_VAULT',
  forkBlockNumber:forkHeight,localBlockNumber:localHeight,vault:VAULT,token:USDC,
  vaultBalanceRaw:before.toString(),principalRaw:principal.toString(),
  feePercentageRaw:feePct.toString(),feeDenominator:'1000000000000000000',
  mainnetBroadcast:false,mainnetFundsMoved:false,profitVerified:false,executionEligible:false};
 if(before<principal){
  console.log(JSON.stringify({...base,status:'INSUFFICIENT_VAULT_BALANCE',loanSucceeded:false}));
  process.exitCode=2;return;
 }
 // Without a verified source for additional fee tokens, test refuses to fake profits or mint into real USDC.
 if(feePct!==0n){
  console.log(JSON.stringify({...base,status:'NONZERO_FEE_NEEDS_REPAYMENT_PREFUNDING_RESEARCH',loanSucceeded:false}));
  process.exitCode=2;return;
 }
 const receiver=await (await ethers.getContractFactory('BalancerFlashLoanResearch')).deploy(VAULT);
 await receiver.waitForDeployment();
 const tx=await receiver.begin([USDC],[principal]);
 const receipt=await tx.wait();
 const after=await token.balanceOf(VAULT);
 assert.equal(after,before,'VAULT_BALANCE_NOT_RESTORED');
 assert.equal(await token.balanceOf(await receiver.getAddress()),0n,'RECEIVER_HAS_UNEXPECTED_BALANCE');
 const iface=new ethers.Interface(['event RepaymentTest(address indexed token,uint256 amount,uint256 fee)']);
 const repayment=receipt.logs.some(log=>{
  if(log.address.toLowerCase()!==(receiver.target).toLowerCase())return false;
  try{const event=iface.parseLog(log);return event.name==='RepaymentTest'&&event.args.amount===principal&&event.args.fee===0n}catch{return false}
 });
 assert.equal(repayment,true,'CALLBACK_REPAYMENT_EVENT_NOT_OBSERVED');
 console.log(JSON.stringify({...base,status:'FORK_FLASH_LOAN_REPAID',loanSucceeded:true,repaymentVerified:true,
  gasUsed:receipt.gasUsed.toString(),vaultBalanceAfterRaw:after.toString(),callbackEventObserved:true}));
}
main().catch(e=>{console.error('BALANCER_V4_FORK_FAILED',String(e.shortMessage||e.message||e).slice(0,320));process.exitCode=1});
