'use strict';
// Hardhat in-memory Base fork only. Never broadcast to Base mainnet.
const hre=require('hardhat');
const assert=require('node:assert/strict');
function contractError(err,contract){
 const data=err?.data||err?.error?.data||err?.info?.error?.data;
 if(typeof data!=='string')return null;
 try{return contract.interface.parseError(data)?.name||null}catch{return null}
}
async function main(){
 if(hre.network.name!=='hardhat'||!/^https:\/\//.test(process.env.BASE_RPC_URL||''))throw Error('FORK_ONLY');
 const e=hre.ethers;
 assert.equal((await e.provider.getNetwork()).chainId,8453n);
 await hre.network.provider.send('evm_mine');
 const F=await e.getContractFactory('AaveDexAtomicFork12913');
 const ex=await F.deploy();await ex.waitForDeployment();
 const amount=500000000n;
 const t=BigInt((await e.provider.getBlock('latest')).timestamp);
 // A valid Plan ABI with low swap minimums and deliberately impossible required profit.
 const plan={amount,minWeth:1n,minUsdc:1n,minProfit:1000000000000000n,deadline:t+3600n,uniFirst:true,probeAfterSwaps:false};
 const token=new e.Contract('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',['function balanceOf(address) view returns(uint256)'],e.provider);
 const before=await token.balanceOf(await ex.getAddress());
 let probeError=null;
 try{await ex.start.staticCall({...plan,probeAfterSwaps:true},{gasLimit:7000000});}
 catch(err){probeError=contractError(err,ex)}
 assert.equal(probeError,'BothSwapsReached','TWO_REAL_SWAP_CALLS_NOT_CONFIRMED');
 let settlementError=null;
 try{await ex.start.staticCall(plan,{gasLimit:7000000});}
 catch(err){settlementError=contractError(err,ex)}
 assert.equal(settlementError,'Unprofitable','EXPECTED_CONTRACT_PROFIT_REJECTION_NOT_REACHED');
 const after=await token.balanceOf(await ex.getAddress());
 assert.equal(after,before,'FORK_BALANCE_CHANGED_AFTER_REVERT');
 console.log(JSON.stringify({success:true,build:'12.9.13.1',test:'REAL_AAVE_TWO_VENUE_FAIL_CLOSED_FORK',bothSwapsReached:true,forkRevertVerified:true,contractRevert: settlementError,abiEncodingFailure:false,successfulAtomicRoundTrip:false,gasUnitsMeasured:null,netProfitVerified:false,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(err=>{console.error('ATOMIC_FORK_FAILED',String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,250));process.exitCode=1});
