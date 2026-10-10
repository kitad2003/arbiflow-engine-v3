'use strict';
// FORK ONLY. Deliberately funds the premium from impersonated local-fork aToken
// to prove callback and repayment plumbing, NOT profitability or external capital.
const hre=require('hardhat'),fs=require('node:fs');
const {ethers,network}=hre;
async function main(){
 if(!process.env.BASE_RPC_URL?.startsWith('https://'))throw Error('BASE_RPC_URL_REQUIRED');
 const [deployer]=await ethers.getSigners();
 const report=JSON.parse(fs.readFileSync('arbiflow-aave-read-only.json','utf8'));
 const readiness=JSON.parse(fs.readFileSync('arbiflow-aave-fork-readiness.json','utf8'));
 if(readiness.readyToDevelopForkTest!==true)throw Error('AAVE_READINESS_GATE_NOT_PASSED');
 const usdc=report.reserves.find(r=>r.symbol==='USDC');
 if(!usdc?.eligibleForFurtherFlashLoanTesting)throw Error('USDC_RESERVE_NOT_ELIGIBLE');
 const pool=report.pool,amount=ethers.parseUnits('100',6);
 const premium=(amount*BigInt(report.premiumBps)+5000n)/10000n;
 const factory=await ethers.getContractFactory('ResearchAaveSimpleReceiver');
 const receiver=await factory.deploy(pool);await receiver.waitForDeployment();
 const address=await receiver.getAddress();
 const token=new ethers.Contract(usdc.asset,['function transfer(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'],deployer);
 await network.provider.send('hardhat_impersonateAccount',[usdc.aToken]);
 await network.provider.send('hardhat_setBalance',[usdc.aToken,ethers.toBeHex(ethers.parseEther('2'))]);
 const reserveSigner=await ethers.getSigner(usdc.aToken);
 const preFund=await token.connect(reserveSigner).transfer(address,premium);await preFund.wait();
 const before=BigInt(await token.balanceOf(usdc.aToken));
 const tx=await receiver.request(usdc.asset,amount,{gasLimit:3000000});
 const receipt=await tx.wait();
 const after=BigInt(await token.balanceOf(usdc.aToken));
 const result={build:'RESEARCH_ONLY_AAVE_4',mode:'BASE_FORK_AAVE_SIMPLE_CALLBACK_SMOKE',
  forkOnly:true,principalRaw:amount.toString(),premiumRaw:premium.toString(),
  premiumPreFundedFromForkImpersonation:true,borrowAndRepaySucceeded:receipt?.status===1,
  reserveBalanceRestored:after===before,gasUsed:receipt.gasUsed.toString(),
  realSwapExecuted:false,profitVerified:false,qualified:false,mainnetBroadcast:false,executionEligible:false,
  limitations:['TEST_PREMIUM_FUNDED_WITH_LOCAL_FORK_IMPERSONATION','NO_PROFIT_CLAIM','NO_REAL_DEX_SWAPS','NOT_DEPLOYED_ON_BASE_MAINNET']};
 fs.writeFileSync('arbiflow-aave-fork-smoke.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
 if(!result.borrowAndRepaySucceeded||!result.reserveBalanceRestored)process.exitCode=1;
}
main().catch(e=>{console.error('AAVE_FORK_SMOKE_FAILED',String(e.shortMessage||e.message||e).slice(0,260));process.exitCode=1});
