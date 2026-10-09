'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),hre=require('hardhat');
const LENDER='0xb639D208Bcf0589D54FaC24E655C79EC529762B8';
const TOKEN='0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';
async function main(){
 assert.equal(hre.network.name,'hardhat','FORK_ONLY');
 assert(/^https:\/\//.test(process.env.ETHEREUM_RPC_URL||''),'ETHEREUM_RPC_URL_REQUIRED');
 const e=hre.ethers,p=e.provider;assert.equal((await p.getNetwork()).chainId,1n);
 const origin=await p.getBlockNumber();await hre.network.provider.send('evm_mine');
 assert.notEqual(await p.getCode(LENDER),'0x','LENDER_NOT_DEPLOYED');
 assert.notEqual(await p.getCode(TOKEN),'0x','TOKEN_NOT_DEPLOYED');
 const lender=new e.Contract(LENDER,['function maxFlashLoan(address) view returns(uint256)','function flashFee(address,uint256) view returns(uint256)'],p);
 const asset=new e.Contract(TOKEN,['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)'],p);
 const decimals=Number(await asset.decimals());const cap=BigInt(await lender.maxFlashLoan(TOKEN));
 const factory=await e.getContractFactory('ERC3156ForkReceiver12976');const receiver=await factory.deploy(LENDER,TOKEN);await receiver.waitForDeployment();
 const amounts=[500,1000,2500,5000,10000,25000,50000],checks=[];
 for(const size of amounts){
  const principal=BigInt(size)*10n**BigInt(decimals),row={amountTokens:size,capacityEnough:cap>=principal};
  if(!row.capacityEnough){row.status='INSUFFICIENT_MINT_CAPACITY';checks.push(row);continue}
  const fee=BigInt(await lender.flashFee(TOKEN,principal));row.feeRaw=fee.toString();
  if(fee>0n){row.status='FEE_REQUIRES_FUNDING_NO_EXTERNAL_TOKENS_INJECTED';checks.push(row);continue}
  const snapshot=await hre.network.provider.send('evm_snapshot');
  try{
   const tx=await receiver.start(principal,{gasLimit:3000000});const receipt=await tx.wait();
   row.status=receipt.status===1?'CALLBACK_REPAYMENT_SUCCEEDED':'TRANSACTION_FAILED';
   row.callbackVerified=BigInt(await receiver.lastAmount())===principal&&BigInt(await receiver.lastFee())===fee;
   row.gasUnits=receipt.gasUsed.toString();
   row.atomicSucceeded=row.status==='CALLBACK_REPAYMENT_SUCCEEDED'&&row.callbackVerified;
  }catch(err){row.status='FORK_EXECUTION_REVERTED';row.error=String(err?.shortMessage||err?.message||err).slice(0,160);row.atomicSucceeded=false}
  checks.push(row);await hre.network.provider.send('evm_revert',[snapshot]);
 }
 const report={build:'12.9.76',mode:'ETHEREUM_GHO_ERC3156_FORK_CALLBACK_ONLY',originBlock:origin,lender:LENDER,token:TOKEN,decimals,
  maxFlashLoanRaw:cap.toString(),checks,callbackRepaymentSuccesses:checks.filter(x=>x.atomicSucceeded).length,
  positiveProfitDemonstrated:false,profitAfterGas:null,swapOrLiquidationExecuted:false,
  qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,
  limitations:['CALLBACK_BORROW_AND_REPAY_ONLY','NO_ARB_OR_LIQUIDATION_STRATEGY','NO_POSITIVE_PROFIT_PROOF','FEE_BEARING_MINT_NOT_PREFUNDED']};
 fs.writeFileSync('arbiflow-flash-mint-fork-12976.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 if(report.callbackRepaymentSuccesses===0)process.exitCode=1;
}
main().catch(e=>{console.error('ERC3156_FORK_FAILED',String(e?.shortMessage||e?.message||e).slice(0,180));process.exitCode=1});
