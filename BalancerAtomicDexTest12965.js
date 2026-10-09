'use strict';
// Full atomic Balancer V2 + actual DEX swaps on disposable Hardhat Base fork only.
const assert=require('node:assert/strict'),hre=require('hardhat');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const UNI='0x2626664c2603336e57b271c5c0b26f421741e481';
const AERO='0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5';
async function main(){
 assert.equal(hre.network.name,'hardhat','FORK_ONLY');assert(/^https:\/\//.test(process.env.BASE_RPC_URL||''),'RPC_REQUIRED');
 const e=hre.ethers,p=e.provider;assert.equal((await p.getNetwork()).chainId,8453n,'BASE_REQUIRED');
 const origin=await p.getBlockNumber();await hre.network.provider.send('evm_mine');
 for(const addr of [VAULT,USDC,WETH,UNI,AERO])assert.notEqual(await p.getCode(addr),'0x','MISSING_CONTRACT_'+addr);
 const usdc=new e.Contract(USDC,['function balanceOf(address) view returns(uint256)'],p),principal=10000000000n;
 const vaultBalance=await usdc.balanceOf(VAULT);assert(vaultBalance>=principal,'INSUFFICIENT_BALANCER_V2_USDC');
 const Receiver=await e.getContractFactory('BalancerAtomicDex12965');const c=await Receiver.deploy(VAULT,USDC,WETH,UNI,AERO);await c.waitForDeployment();
 const [owner]=await e.getSigners();
 const directions=[{name:'UNISWAP_TO_AERODROME',uniFirst:true},{name:'AERODROME_TO_UNISWAP',uniFirst:false}],results=[];
 for(const d of directions){
  const snapshot=await hre.network.provider.send('evm_snapshot');
  const deadline=BigInt((await p.getBlock('latest')).timestamp)+1800n;
  let reverted=false,reason=null,gasUnits=null;
  try{
   const tx=await c.connect(owner).start(principal,d.uniFirst,1n,deadline,{gasLimit:3000000});
   const receipt=await tx.wait();assert.equal(receipt.status,1);
   assert.equal(await c.callbackSeen(),true);gasUnits=receipt.gasUsed.toString();
  }catch(err){reverted=true;reason=String(err?.shortMessage||err?.message||err).slice(0,160)}
  // A profitable route is required to satisfy the contract's minimum profit floor.
  // Do not interpret failed swaps as successful arbitrage.
  const verified=!reverted;
  results.push({direction:d.name,atomicSucceeded:verified,reverted,revertReason:reason,gasUnits,
   successfulRepaymentAndPositiveProfitVerified:verified,profitUsdc:verified?Number(await c.lastSurplus())/1e6:null});
  await hre.network.provider.send('evm_revert',[snapshot]);
 }
 const out={build:'BALANCER_ATOMIC_DEX_12965',success:true,testCompleted:true,forkOriginBlock:origin,simulatedBlock:await p.getBlockNumber(),loanPrincipalUsdc:10000,vaultUsdc:Number(vaultBalance)/1e6,results,
  profitableRoutes:results.filter(x=>x.atomicSucceeded).length,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,
  interpretation:'A revert proves no successful atomic route in this attempted configuration; it does not prove that Balancer borrowing failed'};
 console.log(JSON.stringify(out));
}
main().catch(err=>{console.error('BALANCER_ATOMIC_DEX_TEST_FAILED',String(err?.shortMessage||err?.message||err).slice(0,200));process.exitCode=1});
