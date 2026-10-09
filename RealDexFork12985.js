'use strict';
// Ethereum mainnet FORK ONLY, real deployed Aave GHO flash minter + Uniswap V3 pools.
// Do not broadcast, claim quote profitability, or assume gross spread covers gas.
const assert=require('node:assert/strict'),fs=require('node:fs'),hre=require('hardhat');
const GHO='0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',USDC='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const LENDER='0xb639D208Bcf0589D54FaC24E655C79EC529762B8',ROUTER='0xE592427A0AEce92De3Edee1F18E0157C05861564';
const QUOTER='0x61fFE014bA17989E743c5F6cB21bF9697530B21e',FACTORY='0x1F98431c8aD98523631AE4a59f267346ea31F984';
const FEES=[100,500,3000],AMOUNTS=[100,250,500,1000,2500,5000];
function msg(e){return String(e?.shortMessage||e?.reason||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC_URL]').slice(0,170)}
async function main(){
 assert.equal(hre.network.name,'hardhat','LOCAL_HARDHAT_ONLY');
 assert(/^https:\/\//.test(process.env.ETHEREUM_RPC_URL||''),'ETHEREUM_RPC_URL_REQUIRED');
 const e=hre.ethers,p=e.provider;assert.equal((await p.getNetwork()).chainId,1n);
 const block=await p.getBlockNumber(),report={build:'12.9.85',mode:'REAL_UNISWAP_V3_AND_GHO_ATOMIC_ETHEREUM_FORK',block,
 venues:[],pairs:[],quotesAttempted:0,quotesCompleted:0,quoteFailures:0,positiveGross:0,
 opportunities:[],executionAttempts:0,executionSuccesses:0,positiveNetAfterGasVerified:false,
 verdict:'BLOCKED',reason:'UNTESTED',qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
 try{
 for(const address of [GHO,USDC,WETH,LENDER,ROUTER,QUOTER,FACTORY])
  assert.notEqual(await p.getCode(address),'0x','MISSING_REAL_CONTRACT_'+address);
 const factory=new e.Contract(FACTORY,['function getPool(address,address,uint24) view returns(address)'],p);
 const pools={};for(const fee of FEES){
  const pool=await factory.getPool(GHO,USDC,fee);
  const deployed=pool!==e.ZeroAddress&&(await p.getCode(pool))!=='0x';
  pools[fee]=deployed?pool:null;report.venues.push({fee,pool:deployed?pool:null,exists:deployed});
 }
 const lender=new e.Contract(LENDER,['function maxFlashLoan(address) view returns(uint256)','function flashFee(address,uint256) view returns(uint256)'],p);
 const max=await lender.maxFlashLoan(GHO);report.maxFlashLoanGho=e.formatUnits(max,18);
 const quoter=new e.Contract(QUOTER,['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'],p);
 async function quote(tokenIn,tokenOut,amount,fee){return quoter.quoteExactInputSingle.staticCall({tokenIn,tokenOut,amountIn:amount,fee,sqrtPriceLimitX96:0})}
 // Convert measured gas to GHO only using an actually quoted WETH->GHO path at this fork block.
 let ethToGho=null;for(const fee of FEES){try{const q=await quote(WETH,GHO,e.parseEther('1'),fee);if(q.amountOut>0n){ethToGho=q.amountOut;report.gasConversionFee=fee;break}}catch{}}
 report.gasConversionQuoted=ethToGho!==null;
 const feeRows=[];
 for(const buyFee of FEES)for(const sellFee of FEES)if(buyFee!==sellFee&&pools[buyFee]&&pools[sellFee]){
  for(const size of AMOUNTS){
   const input=e.parseUnits(String(size),18);if(input>max)continue;
   report.quotesAttempted++;
   try{
    const a=await quote(GHO,USDC,input,buyFee);
    const b=await quote(USDC,GHO,a.amountOut,sellFee);
    const fee=await lender.flashFee(GHO,input);
    report.quotesCompleted++;
    const gross=b.amountOut-input-fee;
    const item={sizeGho:size,buyFee,sellFee,firstOutUsdc:e.formatUnits(a.amountOut,6),
      returnedGho:e.formatUnits(b.amountOut,18),loanFeeGho:e.formatUnits(fee,18),
      grossAfterLoanGho:e.formatUnits(gross,18),
      indicativeQuoteGas:Number(a.gasEstimate+b.gasEstimate),positiveGross:gross>0n};
    feeRows.push({...item,_gross:gross,_amount:input,_first:a.amountOut});
    if(gross>0n)report.positiveGross++;
   }catch(err){report.quoteFailures++;if(report.pairs.length<12)report.pairs.push({buyFee,sellFee,sizeGho:size,error:msg(err)})}
  }
 }
 report.routesQuoted=feeRows.length;
 report.bestQuotes=feeRows.sort((a,b)=>a._gross>b._gross?-1:a._gross<b._gross?1:0).slice(0,8).map(({_gross,_amount,_first,...x})=>x);
 const candidates=feeRows.filter(x=>x._gross>0n);
 // A quote-only spread is NOT enough: require a conservative 2.5M gas ceiling times actual fork base fee.
 const latest=await p.getBlock('latest');
 const assumedGasWei=2500000n*(latest.baseFeePerGas||e.parseUnits('2','gwei'));
 report.gasCeilingUnits=2500000;report.estimatedGasWeiCeiling=assumedGasWei.toString();
 report.gasPriceSource=latest.baseFeePerGas?'fork_base_fee_only_no_priority_fee':'fallback_2_gwei';
 // Adding no priority fee is not sufficient for live net eligibility.
 if(!ethToGho){report.reason='NO_VERIFIED_WETH_GHO_GAS_CONVERSION';report.verdict='BLOCKED';}
 else{
  const gasGho=(assumedGasWei*ethToGho+10n**18n-1n)/(10n**18n);
  report.gasGhoCeilingQuoted=e.formatUnits(gasGho,18);
  const eligible=candidates.filter(x=>x._gross>gasGho);
  report.netPositiveQuoteCandidates=eligible.length;
  if(!eligible.length){report.verdict='NO_PROFITABLE_ROUTE';report.reason='REAL_TWO_SWAP_QUOTES_DO_NOT_CLEAR_CONSERVATIVE_GAS_CEILING';}
  else{
   const x=eligible[0];report.selected={sizeGho:x.sizeGho,buyFee:x.buyFee,sellFee:x.sellFee,grossAfterLoanGho:x.grossAfterLoanGho};
   const F=await e.getContractFactory('GhoAtomicExecutor12979'),bot=await F.deploy(LENDER,GHO,ROUTER);await bot.waitForDeployment();
   const snap=await hre.network.provider.send('evm_snapshot');
   try{
    // Slippage guard: exact fork quote, 0.1% first-leg tolerance, min return > loan principal.
    const minFirst=x._first*999n/1000n;
    const minProfit=e.parseUnits('0.01',18);
    report.executionAttempts=1;
    const tx=await bot.execute(x._amount,{intermediate:USDC,buyFee:x.buyFee,sellFee:x.sellFee,
      minFirstOut:minFirst,minReturn:x._amount+minProfit,minProfit},{gasLimit:2500000});
    const receipt=await tx.wait(),profit=await bot.lastProfit();
    const gasWei=receipt.gasUsed*(receipt.gasPrice||0n);
    const gasGhoActual=(gasWei*ethToGho+10n**18n-1n)/(10n**18n);
    report.executionSuccesses=1;report.actualProfitBeforeGasGho=e.formatUnits(profit,18);
    report.actualGasUsed=receipt.gasUsed.toString();report.actualGasWei=gasWei.toString();
    report.actualNetGhoEstimate=e.formatUnits(profit-gasGhoActual,18);
    report.positiveNetAfterGasVerified=profit>gasGhoActual;
    report.verdict=report.positiveNetAfterGasVerified?'LOCAL_FORK_NET_POSITIVE_ESTIMATE':'LOCAL_FORK_GAS_EXCEEDS_PROFIT';
    report.reason='Real GHO lender and V3 pools on fork; GHO-denominated gas value from quoted WETH rate, not mainnet inclusion proof';
   }catch(err){report.verdict='ATOMIC_EXECUTION_REVERTED';report.reason=msg(err)}
   finally{await hre.network.provider.send('evm_revert',[snap])}
  }
 }
 }catch(err){report.verdict='BLOCKED';report.reason=msg(err)}
 report.limitations=['UNISWAP_V3_ONLY_GHO_USDC','NOT_GENERAL_CROSS_VENUE_ARBITRAGE','FORK_POOL_LIQUIDITY_NOT_LIVE_ORDERING','REAL_FLASH_MINT_EXECUTOR_LOCAL_ONLY','NO_MAINNET_BROADCAST'];
 fs.writeFileSync('arbiflow-real-dex-fork-12985.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
main().catch(e=>{console.error('REAL_DEX_FORK_FATAL',msg(e));process.exitCode=1});
