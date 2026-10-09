'use strict';
// A reverted call cannot give a mined receipt; decode our unique post-second-swap revert.
const hre=require('hardhat');const assert=require('node:assert/strict');
async function main(){
 if(hre.network.name!=='hardhat'||!process.env.BASE_RPC_URL)throw Error('FORK_ONLY');
 const e=hre.ethers;assert.equal((await e.provider.getNetwork()).chainId,8453n);
 await hre.network.provider.send('evm_mine');
 const F=await e.getContractFactory('AaveDexAtomicFork12913');
 const ex=await F.deploy();await ex.waitForDeployment();
 const token=new e.Contract('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',['function balanceOf(address) view returns(uint256)'],e.provider);
 const results=[];
 for(const uniFirst of [true,false]){
  const plan={amount:500000000n,minWeth:1n,minUsdc:1n,minProfit:1n,deadline:BigInt((await e.provider.getBlock('latest')).timestamp+3600),uniFirst,probeAfterSwaps:true};
  let reached=false,actual=null,errorText=null;
  try {await ex.start.staticCall(plan,{gasLimit:4000000});}
  catch(err){
   const data=err?.data||err?.error?.data||err?.info?.error?.data;
   if(typeof data==='string'){
    try{const parsed=ex.interface.parseError(data);if(parsed?.name==='BothSwapsReached'){reached=true;actual={wethRaw:parsed.args[0].toString(),usdcRaw:parsed.args[1].toString()}}}catch{}
   }
   errorText=String(err?.shortMessage||err?.message||err).slice(0,200);
  }
  assert(reached, (uniFirst?'UNI_TO_AERO':'AERO_TO_UNI')+'_DID_NOT_REACH_BOTH_SWAPS: '+errorText);
  assert.equal(await token.balanceOf(await ex.getAddress()),0n,'FORK_PROBE_MUST_ROLL_BACK');
  results.push({direction:uniFirst?'UNI_TO_AERO':'AERO_TO_UNI',bothRealSwapsReached:true,...actual,atomicRollbackVerified:true});
 }
 console.log(JSON.stringify({success:true,build:'12.9.14',test:'ATOMIC_POST_TWO_REAL_SWAPS_REVERT_PROBE',results,profitableExecutionPassed:false,gasUsedForSuccessfulAtomicTx:null,netProfitVerified:false,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(e=>{console.error('ATOMIC_PROBE_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,350));process.exitCode=1});
