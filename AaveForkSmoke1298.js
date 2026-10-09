'use strict';
// Base fork Aave V3 smoke test, no DEX swaps, no mainnet transaction broadcast.
const hre=require('hardhat');const assert=require('node:assert/strict');
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const USDC='0x833589fCD6EDB6E08f4c7C32D4f71b54bdA02913';
async function main(){
 if(!process.env.BASE_RPC_URL)throw Error('BASE_RPC_URL_REQUIRED');
 const n=await hre.ethers.provider.getNetwork();
 assert.equal(n.chainId,8453n,'BASE_FORK_REQUIRED');
 const block=await hre.ethers.provider.getBlockNumber();
 const code=await hre.ethers.provider.getCode(POOL);assert.notEqual(code,'0x','AAVE_POOL_MISSING');
 const pool=new hre.ethers.Contract(POOL,[
  'function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)',
  'function getConfiguration(address) view returns(uint256 data)'
 ],hre.ethers.provider);
 const [premium,configuration]=await Promise.all([pool.FLASHLOAN_PREMIUM_TOTAL(),pool.getConfiguration(USDC)]);
 assert(premium>=0n&&premium<=10000n,'INVALID_FLASH_LOAN_PREMIUM');
 assert(configuration>=0n,'INVALID_CONFIGURATION');
 console.log(JSON.stringify({success:true,build:'12.9.8',test:'BASE_FORK_AAVE_READ_ONLY_SMOKE',forkBlock:block,aavePool:POOL,premiumBps:premium.toString(),reserveConfigurationRaw:configuration.toString(),actualFlashLoanRequested:false,atomicSwapTestPassed:false,gasUnitsMeasured:false,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
