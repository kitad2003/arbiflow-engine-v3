'use strict';
// 12.9.40: executable-size quote screening from verified discovered pools.
// Requires USDC as first token; does not mislabel other-asset notional as USDC.
// Each call pinned to the pool discovery block. No route can qualify for execution.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {LOANS}=require('./MultiPoolDiscovery12935');
const QUOTERS={
 UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',
 PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'
};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const PAIR_ABI=['function getAmountOut(uint256,address) view returns(uint256)'];
const ERC20_ABI=['function decimals() view returns(uint8)'];
const MAX_QUOTES=Number(process.env.MAX_POOL_QUOTES||300);
function compatible(pool){return pool.pair.startsWith('USDC/')&&['UNISWAP_V3','PANCAKESWAP_V3','AERODROME_V1'].includes(pool.dex)}
async function run(rpc){
 const universe=await discover(rpc);assert(universe.success,'MINIMUM_POOL_DISCOVERY_NOT_MET');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const at=universe.confirmedBlock;
  const quni=new ethers.Contract(QUOTERS.UNISWAP_V3,ABI,p),qc=new ethers.Contract(QUOTERS.PANCAKESWAP_V3,ABI,p);
  const results=[],selected=universe.pools.filter(compatible),decimals={};
  for(const token of Object.keys(TOKENS)){
   if(token==='USDC')continue;
   try{decimals[token]=Number(await new ethers.Contract(TOKENS[token],ERC20_ABI,p).decimals({blockTag:at}))}catch{decimals[token]=null}
  }
  for(const pool of selected){
   const symbol=pool.pair.split('/')[1],d=decimals[symbol];
   if(d===null)continue;
   const max=LOANS.length;
   for(let i=0;i<max;i++){
    if(results.length>=MAX_QUOTES)break;
    const usd=LOANS[i],size=BigInt(usd)*1000000n;
    const row={pool:pool.address,dex:pool.dex,pair:pool.pair,config:pool.poolConfig,loanUsdc:usd,blockNumber:at,quoteSuccess:false,returnedTokenRaw:null,returnedTokenDecimals:d,priceImpactBps:null,netUsdcProfit:null,qualified:false,alerts:[],blockedReasons:[]};
    try{
     let amount;
     if(pool.kind==='v1')amount=await new ethers.Contract(pool.address,PAIR_ABI,p).getAmountOut(size,TOKENS.USDC,{blockTag:at});
     else{
      const quoter=pool.dex==='UNISWAP_V3'?quni:qc;
      amount=(await quoter.quoteExactInputSingle.staticCall([TOKENS.USDC,TOKENS[symbol],size,Number(pool.poolConfig),0],{blockTag:at}))[0];
     }
     if(BigInt(amount)<=0n)throw Error('NONPOSITIVE_TOKEN_OUTPUT');
     row.quoteSuccess=true;row.returnedTokenRaw=amount.toString();
     // No invented USD valuation; compare two-venue roundtrips in later build.
     row.blockedReasons.push('SECOND_LEG_RETURN_TO_USDC_NOT_VERIFIED');
    }catch(e){row.blockedReasons.push('EXACT_SIZE_QUOTE_FAILED');row.error=String(e?.shortMessage||e?.code||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,90)}
    row.blockedReasons.push('LIQUIDITY_DEPTH_PRICE_IMPACT_NOT_QUANTIFIED','AAVE_PREMIUM_AND_SETTLEMENT_UNVERIFIED','GAS_L1_SLIPPAGE_RISK_UNVERIFIED');
    results.push(row);
   }
   if(results.length>=MAX_QUOTES)break;
  }
  const counts={discoveredDistinctActivePools:universe.uniqueActivePools,usdcPairPools:selected.length,exactSizeQuotesAttempted:results.length,exactSizeQuotesSuccessful:results.filter(x=>x.quoteSuccess).length,poolsSupporting10000Quotes:new Set(results.filter(x=>x.quoteSuccess&&x.loanUsdc===10000).map(x=>x.pool.toLowerCase())).size};
  return {success:true,build:'12.9.40',mode:'READ_ONLY_10K_PLUS_POOL_DEPTH_PREFLIGHT',confirmedBlock:at,counts,quoteBudget:MAX_QUOTES,rows:results,qualified:0,alerts:[],mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
if(require.main===module){
 assert(LOANS.every(x=>x>=10000));assert(compatible({pair:'USDC/WETH',dex:'UNISWAP_V3'}));assert(!compatible({pair:'WETH/AERO',dex:'UNISWAP_V3'}));
 console.log(JSON.stringify({success:true,build:'12.9.40',unitChecksPassed:3,liveTest:!!process.env.BASE_RPC_URL}));
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).then(x=>{console.log(JSON.stringify(x));if(!x.counts.exactSizeQuotesSuccessful)process.exitCode=1}).catch(e=>{console.error('POOL_DEPTH_12940_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,compatible};
