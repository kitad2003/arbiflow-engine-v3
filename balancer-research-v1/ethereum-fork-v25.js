'use strict';
// V25 local fork only: demonstrate Balancer repayment using an explicitly ARTIFICIAL
// pool reserve change. Not a live pending target, opportunity or profitable trade.
const hre=require('hardhat');const {ethers,network}=hre;
const {FACTORIES}=require('./verified-pairs-v12');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
const UNI='0x15ab0333985fd1e289adf4fbbe19261454776642';
const SUSHI='0x2F8AC927aa94293461C75406e90Ec0cCFb2748d9';
const PRINCIPAL=100000000000000n;
function failText(e){return String(e.shortMessage||e.reason||e.message||e).slice(0,190)}
async function main(){
 if((await ethers.provider.getNetwork()).chainId!==31337n)throw Error('LOCAL_FORK_ONLY');
 const [operator]=await ethers.getSigners();
 const token=new ethers.Contract(WETH,['function balanceOf(address) view returns(uint256)',
  'function deposit() payable','function transfer(address,uint256) returns(bool)'],operator);
 const sushi=new ethers.Contract(SUSHI,['function sync()','function factory() view returns(address)'],operator);
 const uni=new ethers.Contract(UNI,['function factory() view returns(address)'],operator);
 if((await uni.factory()).toLowerCase()!==FACTORIES.UNISWAP_V2.toLowerCase()||
    (await sushi.factory()).toLowerCase()!==FACTORIES.SUSHISWAP_V2.toLowerCase())
  throw Error('V15_FACTORY_IDENTITY_CHANGED');
 const F=await ethers.getContractFactory('BalancerEthereumAtomicV23',operator);
 const c=await F.deploy(VAULT,WETH,MLN,FACTORIES.UNISWAP_V2,FACTORIES.SUSHISWAP_V2);
 await c.waitForDeployment();
 const snap=await network.provider.send('evm_snapshot');
 const vaultBefore=await token.balanceOf(VAULT),poolBefore=await token.balanceOf(SUSHI);
 let baseline={reverted:false,reason:null};
 try{await (await c.makeFlashLoan(UNI,SUSHI,PRINCIPAL,1n,1n,1n,{gasLimit:4000000})).wait()}
 catch(e){baseline={reverted:true,reason:failText(e)}}
 // Artificial test environment only: the operator adds local-fork WETH to Sushi,
 // altering the price through a real pool sync. No pending user transaction replay.
 const injected=ethers.parseEther('0.3');
 await (await token.deposit({value:injected})).wait();
 await (await token.transfer(SUSHI,injected)).wait();
 await (await sushi.sync()).wait();
 const artificialPoolBalance=await token.balanceOf(SUSHI);
 let controlled={completed:false,error:null};
 try{
  const tx=await c.makeFlashLoan(UNI,SUSHI,PRINCIPAL,1n,1n,1n,{gasLimit:4000000});
  const receipt=await tx.wait();const vaultAfter=await token.balanceOf(VAULT);
  const event=receipt.logs.map(x=>{try{return c.interface.parseLog(x)}catch{return null}})
   .find(x=>x?.name==='ForkAtomicResult');
  const repaymentVerified=Boolean(event)&&vaultAfter>=vaultBefore;
  const surplus=event?.args.surplus||0n;
  const gasUsed=receipt.gasUsed;
  const effectiveGasPrice=receipt.gasPrice??0n;
  const gasCost=gasUsed*effectiveGasPrice;
  controlled={completed:true,receiptStatus:receipt.status,gasUsed:gasUsed.toString(),
   gasPriceWei:effectiveGasPrice.toString(),gasCostWei:gasCost.toString(),
   vaultBalanceBeforeRaw:vaultBefore.toString(),vaultBalanceAfterRaw:vaultAfter.toString(),
   borrowedRaw:PRINCIPAL.toString(),feeRaw:event?.args.fee?.toString()||null,
   returnedRaw:event?.args.returned?.toString()||null,surplusRaw:surplus.toString(),
   repaymentVerified,positiveTokenSurplus:surplus>0n,
   operatorSurplusAfterGasWei:(surplus-gasCost).toString(),
   operatorProfitVerified:false};
 }catch(e){controlled={completed:false,error:failText(e)}}
 await network.provider.send('evm_revert',[snap]);
 const restoredPool=await token.balanceOf(SUSHI);
 const restoredVault=await token.balanceOf(VAULT);
 const cleanupVerified=restoredPool===poolBefore&&restoredVault===vaultBefore;
 const pass=baseline.reverted&&controlled.completed&&controlled.repaymentVerified&&
  controlled.positiveTokenSurplus&&cleanupVerified;
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V25',mode:'ARTIFICIAL_LOCAL_FORK_BALANCER_REPAYMENT',
  baseline,controlled,artificialWethAddedToPoolRaw:injected.toString(),
  poolWethAfterInjectionRaw:artificialPoolBalance.toString(),cleanupVerified,
  forkAtomicExecutionPassed:pass,realMEVOpportunityFound:false,
  pendingTargetReplayed:false,gasAdjustedLiveProfitVerified:false,
  mevSimBundleCalled:false,mainnetBroadcast:false,executionEligible:false,
  limitations:['ARTIFICIAL_POOL_RESERVE_CHANGE_DOES_NOT_REPRESENT_LIVE_MARKET',
  'ETHEREUM_FORK_LOCAL_ONLY','GAS_COST_WITH_LOCAL_BASE_FEE_NOT_RELIABLE_MAINNET_BID',
  'NO_TARGET_FIRST_FLASHBOTS_SIMULATION','NO_DEPLOYMENT_OR_TRANSACTION_BROADCAST']}));
 if(!pass)process.exitCode=1;
}
main().catch(e=>{console.error('V25_FORK_FAILED',failText(e));process.exitCode=1});
