'use strict';
// Build 12.9.12: disposable Base fork REAL router swaps, no Aave loan.
// The scanner's current routes are unprofitable; this test does not approve live trading.
const assert=require('node:assert/strict');
const hre=require('hardhat');
const e=hre.ethers;
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH='0x4200000000000000000000000000000000000006';
const AAVE_POOL='0xa238dd80c259a72e81d7e4664a9801593f98d1c5';
const UNI='0x2626664c2603336e57b271c5c0b26f421741e481';
const AERO='0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5';
const tokenAbi=['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)'];
const uniAbi=['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)'];
const aeroAbi=['function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)'];
async function main(){
 if(hre.network.name!=='hardhat'||!process.env.BASE_RPC_URL)throw Error('LOCAL_FORK_ONLY');
 const network=await e.provider.getNetwork();assert.equal(network.chainId,8453n);
 const [user]=await e.getSigners();const usdc=new e.Contract(USDC,tokenAbi,user),weth=new e.Contract(WETH,tokenAbi,user);
 for(const a of [UNI,AERO])assert.notEqual(await e.provider.getCode(a),'0x','ROUTER_MISSING_'+a);
 const pool=new e.Contract(AAVE_POOL,['function getReserveData(address) view returns((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))'],e.provider);
 const reserve=await pool.getReserveData(USDC);
 await hre.network.provider.send('hardhat_impersonateAccount',[reserve.aTokenAddress]);
 await hre.network.provider.send('hardhat_setBalance',[reserve.aTokenAddress,'0x56BC75E2D63100000']);
 const fund=await e.getSigner(reserve.aTokenAddress);
 const funds=new e.Contract(USDC,tokenAbi,fund);
 const amount=500000000n;
 const results=[];
 for(const direction of ['UNI_TO_AERO','AERO_TO_UNI']){
  const snapshot=await hre.network.provider.send('evm_snapshot');
  await (await funds.transfer(user.address,amount)).wait();
  const first=direction==='UNI_TO_AERO'?UNI:AERO,second=direction==='UNI_TO_AERO'?AERO:UNI;
  const swap=async(router,tokenIn,tokenOut,amt)=>{
    const erc=tokenIn===USDC?usdc:weth;
    await (await erc.approve(router,0)).wait();await (await erc.approve(router,amt)).wait();
    const before=await (tokenOut===USDC?usdc:weth).balanceOf(user.address);
    const deadline=BigInt((await e.provider.getBlock('latest')).timestamp+300);
    const contract=router===UNI?new e.Contract(UNI,uniAbi,user):new e.Contract(AERO,aeroAbi,user);
    const params=router===UNI?[tokenIn,tokenOut,500n,user.address,amt,1n,0n]:[tokenIn,tokenOut,100n,user.address,deadline,amt,1n,0n];
    const receipt=await (await contract.exactInputSingle(params,{gasLimit:1500000})).wait();
    assert.equal(receipt.status,1);
    const after=await (tokenOut===USDC?usdc:weth).balanceOf(user.address);
    assert(after>before,'OUTPUT_BALANCE_NOT_INCREASED');
    return {amount:after-before,gasUsed:receipt.gasUsed.toString()};
  };
  const buy=await swap(first,USDC,WETH,amount);
  const sell=await swap(second,WETH,USDC,buy.amount);
  results.push({direction,wethOutRaw:buy.amount.toString(),usdcReturnedRaw:sell.amount.toString(),grossUsdcRaw:(sell.amount-amount).toString(),firstSwapGasUsed:buy.gasUsed,secondSwapGasUsed:sell.gasUsed,swapReceiptsVerified:true});
  await hre.network.provider.send('evm_revert',[snapshot]);
 }
 console.log(JSON.stringify({success:true,build:'12.9.12',mode:'DISPOSABLE_BASE_FORK_REAL_DEX_SWAP_TEST',results,flashLoanUsed:false,atomicRoundTripVerified:false,gasScope:'SEPARATE_REAL_DEX_SWAPS_EXCLUDES_AAVE_AND_ATOMIC_EXECUTOR',netProfitVerified:false,qualified:0,alerts:[],mainnetBroadcast:false,executionEligible:false}));
}
main().catch(err=>{console.error('REAL_SWAP_FORK_FAILED',String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[RPC_REDACTED]').slice(0,350));process.exitCode=1});
