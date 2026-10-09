'use strict';
// Runs ONLY on Hardhat in-memory fork. No actual Base transaction is signed/broadcast.
const assert=require('node:assert/strict');
const hre=require('hardhat');
const POOL='0xa238dd80c259a72e81d7e4664a9801593f98d1c5';
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
async function main(){
 if(hre.network.name!=='hardhat'||!process.env.BASE_RPC_URL)throw Error('LOCAL_FORK_ONLY');
 const provider=hre.ethers.provider;const chain=await provider.getNetwork();
 assert.equal(chain.chainId,8453n,'BASE_FORK_CHAIN_REQUIRED');
 assert.notEqual(await provider.getCode(POOL),'0x','AAVE_POOL_MISSING');
 const [tester]=await hre.ethers.getSigners();
 const Receiver=await hre.ethers.getContractFactory('AaveForkReceiver1299');
 const receiver=await Receiver.deploy(POOL,USDC);await receiver.waitForDeployment();
 const amount=500000000n;
 const token=new hre.ethers.Contract(USDC,['function balanceOf(address) view returns(uint256)'],provider);
 const pool=new hre.ethers.Contract(POOL,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider);
 const premiumBps=await pool.FLASHLOAN_PREMIUM_TOTAL();
 const premium=(amount*premiumBps+9999n)/10000n;
 // Borrowing without funding the premium must fail atomically; no external liquidity manipulation.
 let reverted=false;
 try{await (await receiver.connect(tester).start(amount,{gasLimit:2000000})).wait()}catch{reverted=true}
 assert(reverted,'UNFUNDED_AAVE_FLASH_LOAN_MUST_REVERT');
 const walletBalance=await token.balanceOf(await receiver.getAddress());
 assert.equal(walletBalance,0n,'REVERTED_LOAN_MUST_NOT_LEAVE_TOKENS');
 console.log(JSON.stringify({success:true,build:'12.9.9',test:'BASE_FORK_AAVE_UNFUNDED_PREMIUM_REVERT',forkBlock:await provider.getBlockNumber(),aavePremiumBps:premiumBps.toString(),requiredPremiumRaw:premium.toString(),atomicRevertVerified:true,successfulBorrowRepayVerified:false,gasUnitsMeasured:null,realDexUsed:false,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(e=>{console.error('AAVE_FORK_TEST_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC_REDACTED]').slice(0,240));process.exitCode=1});
