'use strict';
const hre=require('hardhat');const {ethers,network}=hre;
const {FACTORIES}=require('./verified-pairs-v12');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
async function main(){
 if((await ethers.provider.getNetwork()).chainId!==31337n)throw Error('FORK_ONLY');
 const [owner,outsider]=await ethers.getSigners();
 const Factory=await ethers.getContractFactory('BalancerEthereumAtomicV26',owner);
 const contract=await Factory.deploy(VAULT,WETH,MLN,FACTORIES.UNISWAP_V2,FACTORIES.SUSHISWAP_V2);
 await contract.waitForDeployment();
 const token=new ethers.Contract(WETH,['function deposit() payable','function transfer(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'],owner);
 const amount=ethers.parseEther('0.001');
 await (await token.deposit({value:amount})).wait();
 await (await token.transfer(await contract.getAddress(),amount)).wait();
 // Compare actual Error(string) return data, not framework-dependent error messages.
 async function expectReason(from,value,expected){
  const data=contract.interface.encodeFunctionData('withdrawSurplus',[value]);
  try{await ethers.provider.call({from,to:await contract.getAddress(),data});return {blocked:false,reason:'CALL_SUCCEEDED'};}
  catch(e){
   const raw=[e.data,e.error?.data,e.info?.error?.data].find(x=>typeof x==='string'&&ethers.isHexString(x));
   let reason=null;
   if(raw?.slice(0,10)==='0x08c379a0'){
    try{reason=ethers.AbiCoder.defaultAbiCoder().decode(['string'],'0x'+raw.slice(10))[0]}catch{}
   }
   return {blocked:reason===expected,reason:reason||'UNDECODED_REVERT'};
  }
 }
 const outsiderCheck=await expectReason(outsider.address,amount,'NOT_OPERATOR');
 const zeroCheck=await expectReason(owner.address,0n,'BAD_AMOUNT');
 const overspendCheck=await expectReason(owner.address,amount+1n,'BAD_AMOUNT');
 const outsiderBlocked=outsiderCheck.blocked,zeroBlocked=zeroCheck.blocked,overspendBlocked=overspendCheck.blocked;
 const balanceBefore=await token.balanceOf(owner.address);
 const receipt=await (await contract.withdrawSurplus(amount)).wait();
 const balanceAfter=await token.balanceOf(owner.address);
 const remaining=await token.balanceOf(await contract.getAddress());
 const pass=outsiderBlocked&&zeroBlocked&&overspendBlocked&&receipt.status===1&&balanceAfter-balanceBefore===amount&&remaining===0n;
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V26',mode:'LOCAL_FORK_POST_LOAN_WITHDRAWAL_TEST',outsiderBlocked,zeroBlocked,overspendBlocked,revertReasons:{outsider:outsiderCheck.reason,zero:zeroCheck.reason,overspend:overspendCheck.reason},withdrawalReceiptStatus:receipt.status,amountWithdrawnRaw:(balanceAfter-balanceBefore).toString(),contractBalanceAfterRaw:remaining.toString(),passed:pass,syntheticDepositedTokenNotArbitrageProfit:true,mainnetBroadcast:false,deploymentReady:false}));
 if(!pass)process.exitCode=1;
}
main().catch(e=>{console.error('V26_FAILED',String(e.message).slice(0,180));process.exitCode=1});
