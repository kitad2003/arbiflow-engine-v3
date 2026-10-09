'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),hre=require('hardhat');
const GHO='0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',USDC='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const LENDER='0xb639D208Bcf0589D54FaC24E655C79EC529762B8',ROUTER='0xE592427A0AEce92De3Edee1F18E0157C05861564';
const QUOTER='0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
function message(e){return String(e?.shortMessage||e?.message||e).slice(0,200)}
async function main(){
 assert.equal(hre.network.name,'hardhat','FORK_ONLY');
 assert(/^https:\/\//.test(process.env.ETHEREUM_RPC_URL||''),'ETHEREUM_RPC_URL_REQUIRED');
 const e=hre.ethers,p=e.provider;assert.equal((await p.getNetwork()).chainId,1n);
 const block=await p.getBlockNumber();await hre.network.provider.send('evm_mine');
 for(const a of [GHO,USDC,LENDER,ROUTER,QUOTER])assert.notEqual(await p.getCode(a),'0x','MISSING_CONTRACT_'+a);
 const F=await e.getContractFactory('GhoAtomicExecutor12979'),receiver=await F.deploy(LENDER,GHO,ROUTER);await receiver.waitForDeployment();
 const quoter=new e.Contract(QUOTER,['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'],p);
 const sizes=[500,1000,2500],checks=[];
 for(const size of sizes){
  const principal=e.parseUnits(String(size),18),row={amountGho:size,route:'GHO-USDC-GHO',firstFee:500,secondFee:100};
  try{
   const first=await quoter.quoteExactInputSingle.staticCall({tokenIn:GHO,tokenOut:USDC,amountIn:principal,fee:500,sqrtPriceLimitX96:0});
   const second=await quoter.quoteExactInputSingle.staticCall({tokenIn:USDC,tokenOut:GHO,amountIn:first.amountOut,fee:100,sqrtPriceLimitX96:0});
   row.indicativeGrossGho=e.formatUnits(second.amountOut-principal,18);
   const minFirst=first.amountOut*95n/100n;
   const minProfit=e.parseUnits('0.01',18);
   const before=await p.getBalance(await receiver.getAddress());
   const snapshot=await hre.network.provider.send('evm_snapshot');
   try{
    await (await receiver.execute(principal,{intermediate:USDC,buyFee:500,sellFee:100,minFirstOut:minFirst,minReturn:principal+minProfit,minProfit},{gasLimit:2500000})).wait();
    row.status='ATOMIC_TRANSACTION_SUCCEEDED';row.profitVerified=false;row.needsGasAccounting=true;
   }catch(err){row.status='ATOMIC_REVERTED_BY_GUARDS_OR_SWAP';row.error=message(err);row.profitVerified=false;}
   row.ethBalanceUnchanged=(await p.getBalance(await receiver.getAddress()))===before;
   await hre.network.provider.send('evm_revert',[snapshot]);
  }catch(err){row.status='QUOTE_UNAVAILABLE';row.error=message(err)}
  checks.push(row);
 }
 const successes=checks.filter(c=>c.status==='ATOMIC_TRANSACTION_SUCCEEDED');
 const report={build:'12.9.79',mode:'ETHEREUM_GHO_TWO_SWAP_ERC3156_ATOMIC_FORK',block,receiver:await receiver.getAddress(),lender:LENDER,router:ROUTER,checks,
  atomicTransactionsCompleted:successes.length,profitAfterGasVerified:false,positiveNetProfitVerified:false,qualified:0,alerts:[],
  mainnetBroadcast:false,realFundsMoved:false,readOnly:true,executionEligible:false,
  limitations:['ONE_TEST_ROUTE_USDC_UNISWAP_V3','NO_GAS_VALUE_CONVERSION','QUOTE_NOT_PROFIT','POSITIVE_EXECUTION_REQUIRES_STRATEGY_WITH_REAL_SURPLUS']};
 fs.writeFileSync('arbiflow-atomic-gho-12979.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 if(checks.every(c=>c.status==='QUOTE_UNAVAILABLE'))process.exitCode=1;
}
main().catch(e=>{console.error('ATOMIC_GHO_FORK_FAILED',message(e));process.exitCode=1});
