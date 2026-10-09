'use strict';
// Isolated Base fork: execute real DEX swaps with fork-only funded account,
// measure exact realized legs, then test Balancer V2 atomic revert/success.
// Diagnostic seed capital is NOT a live funding requirement.
const assert=require('node:assert/strict'),hre=require('hardhat');
const e=hre.ethers;
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const BAL='0xBA12222222228d8Ba445958a75a0704d566BF2C8',UNI='0x2626664c2603336e57b271c5c0b26f421741e481',AERO='0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5';
const AMOUNTS=[500,1000,2500,5000,10000];
const TOKEN=['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)'];
const UNI_ABI=['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)'];
const AERO_ABI=['function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)'];
const RESERVE=['function getReserveData(address) view returns((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))'];
async function main(){
 assert.equal(hre.network.name,'hardhat');assert(/^https:\/\//.test(process.env.BASE_RPC_URL||''));
 const p=e.provider;assert.equal((await p.getNetwork()).chainId,8453n);const origin=await p.getBlockNumber();await hre.network.provider.send('evm_mine');
 for(const addr of [USDC,WETH,BAL,UNI,AERO])assert.notEqual(await p.getCode(addr),'0x','MISSING_'+addr);
 const [owner]=await e.getSigners(),account=owner.address;
 const usdc=new e.Contract(USDC,TOKEN,owner),weth=new e.Contract(WETH,TOKEN,owner);
 const vaultUsdc=await usdc.balanceOf(BAL);assert(vaultUsdc>=10000n*1000000n,'LOW_BALANCER_LIQUIDITY');
 // Get temporary fork-only USDC from Aave reserve aToken for independent swap diagnostics.
 const aave=new e.Contract('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',RESERVE,p);
 const reserve=await aave.getReserveData(USDC);const holder=reserve.aTokenAddress;
 await hre.network.provider.send('hardhat_impersonateAccount',[holder]);
 await hre.network.provider.send('hardhat_setBalance',[holder,'0x56BC75E2D63100000']);
 const donor=new e.Contract(USDC,TOKEN,await e.getSigner(holder));
 const uni=new e.Contract(UNI,UNI_ABI,owner),aero=new e.Contract(AERO,AERO_ABI,owner);
 const Executor=await e.getContractFactory('BalancerAtomicDex12965');
 const atomic=await Executor.deploy(BAL,USDC,WETH,UNI,AERO);await atomic.waitForDeployment();
 async function swap(router,from,to,amount,deadline){
  const token=from===USDC?usdc:weth,output=to===USDC?usdc:weth;
  await (await token.approve(router,0)).wait();await (await token.approve(router,amount)).wait();
  const before=await output.balanceOf(account);
  const args=router===UNI?[from,to,500n,account,amount,1n,0n]:[from,to,100n,account,deadline,amount,1n,0n];
  const tx=await (router===UNI?uni:aero).exactInputSingle(args,{gasLimit:1800000});
  const receipt=await tx.wait();assert.equal(receipt.status,1);
  const after=await output.balanceOf(account);assert(after>before,'NO_SWAP_OUTPUT');
  return {output:after-before,gas:receipt.gasUsed};
 }
 const vault=new e.Contract(BAL,['function getProtocolFeesCollector() view returns(address)'],p);
 const feeCollector=await vault.getProtocolFeesCollector();
 const feeContract=new e.Contract(feeCollector,['function getFlashLoanFeePercentage() view returns(uint256)'],p);
 const feeWad=BigInt(await feeContract.getFlashLoanFeePercentage());
 const results=[];
 for(const dollars of AMOUNTS)for(const direction of [{name:'UNISWAP_TO_AERODROME',first:UNI,second:AERO,uniFirst:true},{name:'AERODROME_TO_UNISWAP',first:AERO,second:UNI,uniFirst:false}]){
  const snap=await hre.network.provider.send('evm_snapshot'),amount=BigInt(dollars)*1000000n;
  const row={loanUsdc:dollars,direction:direction.name,independentSwapSuccess:false,atomicSuccess:false,qualified:false};
  try{
   await (await donor.transfer(account,amount)).wait();
   const deadline=BigInt((await p.getBlock('latest')).timestamp)+1800n;
   const first=await swap(direction.first,USDC,WETH,amount,deadline);
   const second=await swap(direction.second,WETH,USDC,first.output,deadline);
   const gross=second.output-amount;
   row.independentSwapSuccess=true;row.wethReceivedRaw=first.output.toString();row.usdcReturnedRaw=second.output.toString();
   row.grossUsdc=Number(gross)/1e6;row.grossSpreadPct=Number(gross)*100/(Number(amount));
   row.independentSwapGasUnits=(first.gas+second.gas).toString();
   const fee=(amount*feeWad+999999999999999999n)/1000000000000000000n;
   row.balancerFeeRaw=fee.toString();
   row.afterKnownBalancerFeeUsdc=Number(gross-fee)/1e6;row.estimatedNetProfitUsdc=null;
   row.profitGateWouldPass=gross>fee;
  }catch(err){row.independentSwapError=String(err?.shortMessage||err?.message||err).slice(0,135)}
  await hre.network.provider.send('evm_revert',[snap]);
  const probe=await hre.network.provider.send('evm_snapshot');
  try{
   const deadline=BigInt((await p.getBlock('latest')).timestamp)+1800n;
   const tx=await atomic.start(amount,direction.uniFirst,1n,deadline,{gasLimit:3500000});
   const receipt=await tx.wait();row.atomicSuccess=receipt.status===1;
   if(row.atomicSuccess){row.atomicGasUnits=receipt.gasUsed.toString();row.atomicSurplusUsdc=Number(await atomic.lastSurplus())/1e6;row.actualBalancerFeeRaw=(await atomic.lastFee()).toString()}
  }catch(err){row.atomicRevertReason=String(err?.shortMessage||err?.message||err).slice(0,145)}
  await hre.network.provider.send('evm_revert',[probe]);
  results.push(row);
 }
 const output={build:'BALANCER_LOSS_INVESTIGATOR_12966',success:true,chain:'BASE_FORK',forkOriginBlock:origin,amountsUsdc:AMOUNTS,balancerFeePercentageWad:feeWad.toString(),vaultBalanceUsdc:Number(vaultUsdc)/1e6,results,
 notes:['Independent swaps use fork-only seeded USDC for loss attribution; not proof of flash-loan profitability','Fee and exact gas/net require atomic successful simulation and fee verification','Any losing atomic transaction reverts; no mainnet broadcast'],
 qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
 console.log(JSON.stringify(output));
}
main().catch(err=>{console.error('BALANCER_LOSS_INVESTIGATOR_FAILED',String(err?.shortMessage||err?.message||err).slice(0,250));process.exitCode=1});
