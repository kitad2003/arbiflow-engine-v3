'use strict';
// ArbiFlow 12.9.80: preflight multiple GHO pairs, exact-size two-leg quotes,
// fee and gas budget screen. No trading of negative candidates, no mainnet calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),hre=require('hardhat');
const e=hre.ethers;
const GHO='0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';
const TOKENS=[{name:'USDC',address:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'},{name:'USDT',address:'0xdAC17F958D2ee523a2206206994597C13D831ec7'},{name:'WETH',address:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'}];
const FACTORY='0x1F98431c8aD98523631AE4a59f267346ea31F984',QUOTER='0x61fFE014bA17989E743c5F6cB21bF9697530B21e',LENDER='0xb639D208Bcf0589D54FaC24E655C79EC529762B8';
const FEES=[100,500,3000,10000],SIZES=[100,250,500,1000,2500,5000,10000];
const QABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'];
function msg(x){return String(x?.shortMessage||x?.message||x).slice(0,160)}
async function main(){
 assert.equal(hre.network.name,'hardhat','FORK_ONLY');assert(/^https:\/\//.test(process.env.ETHEREUM_RPC_URL||''),'ETHEREUM_RPC_URL_REQUIRED');
 const p=e.provider;assert.equal((await p.getNetwork()).chainId,1n);const block=await p.getBlockNumber();await hre.network.provider.send('evm_mine');
 const f=new e.Contract(FACTORY,['function getPool(address,address,uint24) view returns(address)'],p);
 const q=new e.Contract(QUOTER,QABI,p),l=new e.Contract(LENDER,['function flashFee(address,uint256) view returns(uint256)'],p);
 const [feeData,ethPriceData]=await Promise.all([
  p.getFeeData(),
  (async()=>{try{return await q.quoteExactInputSingle.staticCall({tokenIn:TOKENS[2].address,tokenOut:GHO,amountIn:e.parseEther('1'),fee:3000,sqrtPriceLimitX96:0})}catch{return null}})()
 ]);
 const gasPrice=feeData.maxFeePerGas||feeData.gasPrice;const gasPriceKnown=gasPrice!==null&&gasPrice!==undefined;
 const ethToGho=ethPriceData?BigInt(ethPriceData.amountOut):null;
 const routes=[],pools=[],errors=[];let attempted=0,success=0;
 const minProfit=e.parseUnits('0.01',18);
 for(const t of TOKENS){
  const found=[];
  for(const tier of FEES){
   try{const address=await f.getPool(GHO,t.address,tier);
    if(address!==e.ZeroAddress&&await p.getCode(address)!=='0x'){found.push(tier);pools.push({pair:'GHO/'+t.name,fee:tier,address})}
   }catch(x){errors.push({stage:'POOL',pair:t.name,tier,error:msg(x)})}
  }
  for(const a of found)for(const b of found)if(a!==b)for(const size of SIZES){
   const amount=e.parseUnits(String(size),18),row={pair:'GHO/'+t.name,buyFee:a,sellFee:b,sizeGho:size};attempted++;
   try{
    const first=await q.quoteExactInputSingle.staticCall({tokenIn:GHO,tokenOut:t.address,amountIn:amount,fee:a,sqrtPriceLimitX96:0});
    const second=await q.quoteExactInputSingle.staticCall({tokenIn:t.address,tokenOut:GHO,amountIn:first.amountOut,fee:b,sqrtPriceLimitX96:0});
    success++;const returned=BigInt(second.amountOut),gross=returned-amount,mintFee=BigInt(await l.flashFee(GHO,amount));
    const quoterGas=BigInt(first.gasEstimate)+BigInt(second.gasEstimate);
    // Quoter gas is NOT transaction gas. An intentionally conservative additional envelope.
    const gasEnvelope=quoterGas+400000n;
    const estimatedGasGho=gasPriceKnown&&ethToGho!==null?(gasEnvelope*gasPrice*ethToGho)/(10n**18n):null;
    const afterCosts=estimatedGasGho===null?null:gross-mintFee-estimatedGasGho;
    Object.assign(row,{quoteStatus:'COMPLETE',intermediateAmountRaw:BigInt(first.amountOut).toString(),returnedGho:e.formatUnits(returned,18),grossGho:e.formatUnits(gross,18),
      mintFeeGho:e.formatUnits(mintFee,18),quoteGasUnits:quoterGas.toString(),gasEnvelopeUnits:gasEnvelope.toString(),
      estimatedGasGho:estimatedGasGho===null?null:e.formatUnits(estimatedGasGho,18),
      indicativeAfterCostGho:afterCosts===null?null:e.formatUnits(afterCosts,18),
      eligibleForForkExecution:afterCosts!==null&&afterCosts>minProfit,
      status:afterCosts===null?'REJECTED_GAS_CONVERSION_UNAVAILABLE':afterCosts<=minProfit?'REJECTED_NOT_POSITIVE_AFTER_COST_ESTIMATE':'FORK_CANDIDATE_UNVERIFIED'});
   }catch(x){row.status='QUOTE_FAILED';row.error=msg(x)}
   routes.push(row);
  }
 }
 routes.sort((a,b)=>Number(b.indicativeAfterCostGho??-1e12)-Number(a.indicativeAfterCostGho??-1e12));
 const candidates=routes.filter(x=>x.eligibleForForkExecution);
 const report={build:'12.9.80',mode:'GHO_PRE_EXECUTION_DIAGNOSTICS_FORK_READ_ONLY',block,chainId:1,
   pools,quoteRoutesAttempted:attempted,quoteRoutesCompleted:success,quoteFailures:attempted-success,
   gasPriceWei:gasPriceKnown?gasPrice.toString():null,oneEthToGhoQuoteRaw:ethToGho?.toString()||null,
   candidates:candidates.slice(0,25),bestRoutes:routes.slice(0,20),rejectedNegative:routes.filter(x=>x.status==='REJECTED_NOT_POSITIVE_AFTER_COST_ESTIMATE').length,
   forkExecutionsAttempted:0,reasonNoForkExecution:'NO_EXECUTION_WITHOUT_PROFITABLE_PREFLIGHT_AND_EXPLICIT_ATOMIC_SWAP_TEST',
   errors,profitAfterGasVerified:false,atomicTradeProfitVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,
   limitations:['UNISWAP_V3_ONLY','SEPARATE_QUOTES_DO_NOT_ACCOUNT_FOR_SHARED_STATE','QUOTE_GAS_PLUS_400K_IS_A_SCREENING_ENVELOPE_NOT_MEASURED_EXECUTION_GAS','WETH_GHO_QUOTE_IS_AN_INDICATIVE_ETH_CONVERSION','NO_ATOMIC_SWAP_EXECUTION_PERFORMED']};
 fs.writeFileSync('arbiflow-gho-execution-diagnostics-12980.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,pools:undefined,candidates:candidates.slice(0,10),bestRoutes:routes.slice(0,10)}));
 return report;
}
if(require.main===module){assert.equal(SIZES.length,7);assert.equal(TOKENS.length,3);console.log(JSON.stringify({build:'12.9.80',unitAssertionsPassed:2}));
 main().catch(x=>{console.error('GHO_12980_FAILED',msg(x));process.exitCode=1})}
module.exports={main};
