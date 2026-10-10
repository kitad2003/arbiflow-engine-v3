'use strict';
// Never broadcast to Ethereum. Local Hardhat fork of the verified V15 pair.
const hre=require('hardhat');
const {ethers,network}=hre;
const {verify,OBSERVED_POOL}=require('./verify-observed-pool-v15');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
async function main(){
 const chain=await ethers.provider.getNetwork();
 if(chain.chainId!==31337n)throw Error('LOCAL_FORK_CHAIN_REQUIRED');
 const origin=OBSERVED_POOL,alternate='0x2F8AC927aa94293461C75406e90Ec0cCFb2748d9';
 const [wallet]=await ethers.getSigners();
 const vaultToken=new ethers.Contract(WETH,['function balanceOf(address) view returns(uint256)'],ethers.provider);
 const initialVault=await vaultToken.balanceOf(VAULT);
 const Factory=await ethers.getContractFactory('BalancerEthereumAtomicV17',wallet);
 const loan=await Factory.deploy(VAULT,WETH,MLN);
 await loan.waitForDeployment();
 const principal=10n**14n; // 0.0001 WETH, safety-sized research input
 if(initialVault<principal)throw Error('BALANCER_VAULT_WETH_UNDERFUNDED');
 const directions=[{name:'UNISWAP_TO_SUSHI',first:origin,second:alternate},
  {name:'SUSHI_TO_UNISWAP',first:alternate,second:origin}];
 const outcomes=[];
 for(const x of directions){
  const snapshot=await network.provider.send('evm_snapshot');
  const before=await vaultToken.balanceOf(VAULT);
  let status='REVERTED',gasUsed=null,reason=null,repaymentObserved=false,profitObserved=false;
  try{
   const tx=await loan.makeFlashLoan(x.first,x.second,principal,1n,{gasLimit:3500000});
   const receipt=await tx.wait();
   const after=await vaultToken.balanceOf(VAULT);
   const event=receipt.logs.map(y=>{try{return loan.interface.parseLog(y)}catch{return null}})
    .find(y=>y?.name==='ForkAtomicResult');
   repaymentObserved=after>=before&&Boolean(event);
   profitObserved=Boolean(event)&&event.args.surplus>0n;
   status=repaymentObserved&&profitObserved?'FORK_ATOMIC_SURPLUS_OBSERVED':'FORK_UNVERIFIED_SUCCESS';
   gasUsed=receipt.gasUsed.toString();
  }catch(e){reason=String(e.shortMessage||e.reason||e.message||e).slice(0,170)}
  outcomes.push({direction:x.name,status,principalRaw:principal.toString(),gasUsed,
   repaymentObserved,profitObserved,reason});
  await network.provider.send('evm_revert',[snapshot]);
 }
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V17',mode:'LOCAL_ETHEREUM_FORK_REAL_BALANCER_TWO_V2_SWAP_ATOMIC',
  localChainId:31337,mainnetBroadcast:false,pairAddresses:[origin,alternate],balancerVault:VAULT,
  loanToken:WETH,intermediateToken:MLN,vaultInitialWethRaw:initialVault.toString(),
  outcomes,successfulDirections:outcomes.filter(x=>x.profitObserved&&x.repaymentObserved).length,
  pendingTargetTransactionReplayed:false,postTargetStateSimulated:false,
  backrunOrderingVerified:false,realMainnetProfitVerified:false,executionEligible:false,
  limitations:['LOCAL_FORK_ONLY','NO_PENDING_TARGET_TRANSACTION_APPLIED',
   'NO_BUILDER_SIMULATION_OR_BUNDLE','SUCCESS_BEFORE_PENDING_TX_DOES_NOT_PROVE_BACKRUN_PROFIT']}));
}
main().catch(e=>{console.error('V17_FORK_FAILED',String(e.shortMessage||e.message||e).slice(0,220));process.exitCode=1});
