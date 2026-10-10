'use strict';
// Local Ethereum fork only. Existing factory-verified V15 Uniswap/Sushi WETH-MLN pools.
const hre=require('hardhat');const {ethers,network}=hre;
const {FACTORIES}=require('./verified-pairs-v12');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
const UNI='0x15ab0333985fd1e289adf4fbbe19261454776642';
const SUSHI='0x2F8AC927aa94293461C75406e90Ec0cCFb2748d9';
async function main(){
 if((await ethers.provider.getNetwork()).chainId!==31337n)throw Error('LOCAL_FORK_ONLY');
 const [signer,outsider]=await ethers.getSigners();
 const Factory=await ethers.getContractFactory('BalancerEthereumAtomicV23',signer);
 const c=await Factory.deploy(VAULT,WETH,MLN,FACTORIES.UNISWAP_V2,FACTORIES.SUSHISWAP_V2);
 await c.waitForDeployment();
 const amount=10n**14n;
 const tests=[];
 async function expectFailure(name,runner){
  const id=await network.provider.send('evm_snapshot');
  try{await (await runner()).wait();tests.push({name,reverted:false,reason:'UNEXPECTED_SUCCESS'});}
  catch(e){tests.push({name,reverted:true,reason:String(e.shortMessage||e.reason||e.message).slice(0,140)});}
  await network.provider.send('evm_revert',[id]);
 }
 await expectFailure('UNAUTHORIZED_OPERATOR',()=>c.connect(outsider).makeFlashLoan(UNI,SUSHI,amount,1,1,1,{gasLimit:3500000}));
 await expectFailure('UNREGISTERED_FIRST_POOL',()=>c.makeFlashLoan(outsider.address,SUSHI,amount,1,1,1,{gasLimit:3500000}));
 await expectFailure('WRONG_FACTORY_ORDER',()=>c.makeFlashLoan(SUSHI,UNI,amount,1,1,1,{gasLimit:3500000}));
 await expectFailure('FIRST_LEG_MIN_OUTPUT_TOO_HIGH',()=>c.makeFlashLoan(UNI,SUSHI,amount,ethers.MaxUint256,1,1,{gasLimit:3500000}));
 await expectFailure('SECOND_LEG_MIN_OUTPUT_TOO_HIGH',()=>c.makeFlashLoan(UNI,SUSHI,amount,1,ethers.MaxUint256,1,{gasLimit:3500000}));
 const passed=tests.filter(t=>t.reverted).length;
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V23',mode:'LOCAL_ETHEREUM_FORK_GUARDRAIL_REVERT_TESTS',
  tests,passed,total:tests.length,mainnetBroadcast:false,deployedOnMainnet:false,
  pendingTargetReplayed:false,operatorNetProfitVerified:false,deploymentReady:false}));
 if(passed!==tests.length)process.exitCode=1;
}
main().catch(e=>{console.error('V23_FORK_FAILED',String(e.shortMessage||e.message||e).slice(0,180));process.exitCode=1});
