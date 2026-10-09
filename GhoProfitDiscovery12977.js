'use strict';
// 12.9.77 Ethereum GHO round-trip indicative executable-size quotes. READ ONLY.
// Distinct fee-tier pools only. Quoter calls are separate state simulations:
// any positive quote remains UNVERIFIED until same-transaction atomic fork execution.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const GHO='0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',USDC='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',USDT='0xdAC17F958D2ee523a2206206994597C13D831ec7',WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const FACTORY='0x1F98431c8aD98523631AE4a59f267346ea31F984',QUOTER='0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const FEES=[100,500,3000,10000],SIZES=[500,1000,2500,5000,10000,25000,50000],TOKENS=[{symbol:'USDC',address:USDC,decimals:6},{symbol:'USDT',address:USDT,decimals:6},{symbol:'WETH',address:WETH,decimals:18}];
const FABI=['function getPool(address,address,uint24) view returns(address)'];
const QABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'];
function err(e){return String(e?.shortMessage||e?.message||e).slice(0,120)}
async function main(rpc){
 assert(/^https:\/\//.test(rpc||''),'ETHEREUM_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,1,{staticNetwork:true});
 try{
  assert.equal((await p.getNetwork()).chainId,1n);const block=await p.getBlockNumber();
  const f=new ethers.Contract(FACTORY,FABI,p),q=new ethers.Contract(QUOTER,QABI,p);
  assert.notEqual(await p.getCode(QUOTER,block),'0x','QUOTER_MISSING');
  const pools=[],errors=[],rows=[];let quoteCalls=0,quoteFailures=0;
  for(const t of TOKENS)for(const fee of FEES){
   try{const address=await f.getPool(GHO,t.address,fee,{blockTag:block});
    if(address!==ethers.ZeroAddress&&await p.getCode(address,block)!=='0x')
     pools.push({token:t.symbol,tokenAddress:t.address,decimals:t.decimals,fee,pool:address});
   }catch(e){errors.push({stage:'POOL',token:t.symbol,fee,error:err(e)})}
  }
  async function quote(tokenIn,tokenOut,fee,amount){
   quoteCalls++;
   try{
    const v=await q.quoteExactInputSingle.staticCall({tokenIn,tokenOut,amountIn:amount,fee,sqrtPriceLimitX96:0},{blockTag:block});
    return {amount:BigInt(v.amountOut),gas:BigInt(v.gasEstimate)};
   }catch(e){quoteFailures++;return {error:err(e)}}
  }
  const perToken=new Map(TOKENS.map(t=>[t.symbol,pools.filter(x=>x.token===t.symbol)]));
  for(const t of TOKENS){
   const opts=perToken.get(t.symbol);
   for(const buy of opts)for(const sell of opts){
    if(buy.fee===sell.fee)continue;
    for(const size of SIZES){
     const input=BigInt(size)*10n**18n,leg1=await quote(GHO,t.address,buy.fee,input);
     if(leg1.error){rows.push({via:t.symbol,buyFee:buy.fee,sellFee:sell.fee,size,status:'FIRST_QUOTE_FAILED',error:leg1.error});continue}
     const leg2=await quote(t.address,GHO,sell.fee,leg1.amount);
     if(leg2.error){rows.push({via:t.symbol,buyFee:buy.fee,sellFee:sell.fee,size,status:'SECOND_QUOTE_FAILED',error:leg2.error});continue}
     const gross=leg2.amount-input;
     rows.push({via:t.symbol,buyFee:buy.fee,sellFee:sell.fee,size,status:'INDICATIVE_SEPARATE_QUOTES_ONLY',
      inputGho:size,intermediateToken:ethers.formatUnits(leg1.amount,t.decimals),returnedGho:ethers.formatUnits(leg2.amount,18),
      grossGho:ethers.formatUnits(gross,18),positiveGross:gross>0n,positiveNetVerified:false,
      quoteGasUnits:(leg1.gas+leg2.gas).toString(),sameTransactionVerified:false,
      poolIn:buy.pool,poolOut:sell.pool});
    }
   }
  }
  const positives=rows.filter(x=>x.positiveGross),ordered=[...rows.filter(x=>x.grossGho!==undefined)].sort((a,b)=>Number(b.grossGho)-Number(a.grossGho));
  const report={build:'12.9.77',mode:'GHO_V3_CROSS_POOL_INDICATIVE_QUOTES',chainId:1,block,protocol:'UNISWAP_V3',factory:FACTORY,quoter:QUOTER,
   poolCount:pools.length,pools,tradeSizesGho:SIZES,routeSizeChecks:rows.length,quoteCalls,quoteFailures,positiveGrossQuotes:positives.length,
   bestGross:ordered.slice(0,12),positiveGrossCandidates:positives.slice(0,50),errors,profitAfterGasVerified:false,profitAfterMintFeeVerified:false,
   sameTransactionExecuted:false,estimatedGasCostGho:null,gasConversionVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,
   limitations:['UNISWAP_V3_ONLY_NOT_CURVE','TWO_INDEPENDENT_ETH_CALL_QUOTES_NO_SHARED_RESERVE_STATE','NO_ETH_GAS_CONVERSION','NO_MINT_FEE_SUBTRACTED','NO_SWAP_EXECUTION_ON_FORK','NO_PROFIT_VALIDATION']};
  fs.writeFileSync('arbiflow-gho-profit-discovery-12977.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,pools:undefined,positiveGrossCandidates:positives.slice(0,15),bestGross:ordered.slice(0,10)}));
  return report;
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(SIZES.length,7);assert.equal(FEES.length,4);console.log(JSON.stringify({build:'12.9.77',unitAssertionsPassed:2}));
 main(process.env.ETHEREUM_RPC_URL).catch(e=>{console.error('GHO_PROFIT_DISCOVERY_FAILED',err(e));process.exitCode=1})}
module.exports={main};
