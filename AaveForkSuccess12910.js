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

 // Fork-only impersonation of the USDC aToken for controlled premium funding.
 // This is a disposable Hardhat state mutation, never a Base mainnet transfer.
 const reserve=new hre.ethers.Contract(POOL,[
  'function getReserveData(address) view returns((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))'
 ],provider);
 const data=await reserve.getReserveData(USDC);
 const aToken=data.aTokenAddress;
 assert.match(aToken,/^0x[0-9a-fA-F]{40}$/,'ATOKEN_ADDRESS_REQUIRED');
 await hre.network.provider.send('hardhat_impersonateAccount',[aToken]);
 await hre.network.provider.send('hardhat_setBalance',[aToken,'0x56BC75E2D63100000']);
 const reserveSigner=await hre.ethers.getSigner(aToken);
 const fundToken=new hre.ethers.Contract(USDC,['function transfer(address,uint256) returns(bool)'],reserveSigner);
 await (await fundToken.transfer(await receiver.getAddress(),premium)).wait();
 const before=await token.balanceOf(await receiver.getAddress());
 assert.equal(before,premium,'PREMIUM_PREFUND_MISMATCH');
 const receipt=await (await receiver.connect(tester).start(amount,{gasLimit:2000000})).wait();
 assert.equal(receipt.status,1,'LOAN_TRANSACTION_REVERTED');
 const after=await token.balanceOf(await receiver.getAddress());
 assert.equal(after,0n,'POOL_DID_NOT_RECEIVE_PREMIUM');
 console.log(JSON.stringify({success:true,build:'12.9.10',test:'BASE_FORK_AAVE_PREFUNDED_PREMIUM_SUCCESS',forkBlock:await provider.getBlockNumber(),aavePremiumBps:premiumBps.toString(),premiumRaw:premium.toString(),premiumFunding:'FORK_ONLY_IMPERSONATED_ATOKEN',successfulBorrowRepayVerified:true,gasUnitsMeasured:receipt.gasUsed.toString(),gasMeasurementScope:'AAVE_ONLY_NO_DEX_SWAPS',realDexUsed:false,mainnetBroadcast:false,executionEligible:false}));

}
main().catch(e=>{console.error('AAVE_FORK_TEST_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC_REDACTED]').slice(0,240));process.exitCode=1});
