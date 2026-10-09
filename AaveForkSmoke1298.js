'use strict';
// 12.9.8 read-only REAL Base RPC smoke. No Hardhat fork or transaction execution.
const {ethers}=require('ethers');
const assert=require('node:assert/strict');
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const USDC='0x833589fCD6EDB6E08f4c7C32D4f71b54bdA02913';
async function main(){
 const url=(process.env.BASE_RPC_URL||'').trim();
 if(!/^https:\/\//i.test(url)) throw Error('BASE_RPC_URL_HTTPS_REQUIRED');
 const provider=new ethers.JsonRpcProvider(url,8453,{staticNetwork:true});
 const chain=await provider.send('eth_chainId',[]);
 assert.equal(BigInt(chain),8453n,'BASE_MAINNET_RPC_REQUIRED');
 const block=await provider.getBlockNumber();
 assert.notEqual(await provider.getCode(POOL),'0x','AAVE_POOL_MISSING');
 const pool=new ethers.Contract(POOL,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)','function getConfiguration(address) view returns(uint256)'],provider);
 const [premium,configuration]=await Promise.all([pool.FLASHLOAN_PREMIUM_TOTAL(),pool.getConfiguration(USDC)]);
 assert(premium>=0n&&premium<=10000n,'INVALID_FLASH_LOAN_PREMIUM');
 assert(configuration>0n,'INVALID_USDC_CONFIGURATION');
 console.log(JSON.stringify({success:true,build:'12.9.8.1',test:'BASE_AAVE_DIRECT_RPC_READ_ONLY_SMOKE',block,aavePool:POOL,premiumBps:premium.toString(),reserveConfigurationRaw:configuration.toString(),forkExecuted:false,atomicSwapTestPassed:false,gasUnitsMeasured:false,mainnetBroadcast:false,executionEligible:false}));
 provider.destroy();
}
main().catch(e=>{console.error('AAVE_RPC_SMOKE_FAILED',String(e?.shortMessage||e?.code||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC_REDACTED]').slice(0,200));process.exitCode=1});
