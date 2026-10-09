'use strict';
const hre=require('hardhat');const assert=require('node:assert/strict');
async function main(){
 if(hre.network.name!=='hardhat'||!process.env.BASE_RPC_URL)throw Error('FORK_ONLY');
 const e=hre.ethers;assert.equal((await e.provider.getNetwork()).chainId,8453n);
 await hre.network.provider.send('evm_mine');
 const F=await e.getContractFactory('AaveDexAtomicFork12913');
 const ex=await F.deploy();await ex.waitForDeployment();
 const amount=500000000n;
 // Worst-case deliberately impossible output floor: an unprofitable route must never settle.
 const t=BigInt((await e.provider.getBlock('latest')).timestamp);
 const plan={amount,minWeth:1n,minUsdc:1000000000000000n,minProfit:1n,deadline:t+3600n,uniFirst:true};
 let reverted=false;let reason=null;
 try {await (await ex.start(plan,{gasLimit:2500000})).wait();}
 catch(err){reverted=true;reason=String(err?.shortMessage||err?.message||err).slice(0,120);}
 assert(reverted,'UNSAFE_ROUTE_DID_NOT_REVERT');
 const token=new e.Contract('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',['function balanceOf(address) view returns(uint256)'],e.provider);
 assert.equal(await token.balanceOf(await ex.getAddress()),0n,'LOAN_LEFT_USDC_AFTER_REVERT');
 console.log(JSON.stringify({success:true,build:'12.9.13',test:'REAL_AAVE_TWO_VENUE_FAIL_CLOSED_FORK',forkRevertVerified:true,reason,successfulAtomicRoundTrip:false,gasUnitsMeasured:null,netProfitVerified:false,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(err=>{console.error('ATOMIC_FORK_FAILED',String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,230));process.exitCode=1});
