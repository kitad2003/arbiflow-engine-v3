'use strict';
// 12.9.78 Independent Ethereum GHO cross-venue quotes: Curve GHO/crvUSD versus Uniswap V3.
// Read-only: separate eth_call quotes are NOT atomic execution or verified profits.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const GHO='0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';
const CRVUSD='0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E';
const CURVE_GHO_CRVUSD='0x635EF0056A597D13863B73825CcA297236578595';
const UNI_FACTORY='0x1F98431c8aD98523631AE4a59f267346ea31F984',UNI_QUOTER='0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const FEES=[100,500,3000,10000],SIZES=[100,250,500,1000,2500,5000,10000,25000,50000];
const POOL_ABI=['function coins(uint256) view returns(address)'];
const CURVE_ABIS=['function get_dy(int128,int128,uint256) view returns(uint256)','function get_dy(uint256,uint256,uint256) view returns(uint256)'];
const QABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'];
const FABI=['function getPool(address,address,uint24) view returns(address)'];
const MAX_IMPACT_BPS=Number(process.env.GHO_MAX_ROUNDTRIP_LOSS_BPS||200),MAX_QUOTE_GAS=Number(process.env.GHO_MAX_QUOTE_GAS_UNITS||1000000);
function msg(e){return String(e?.shortMessage||e?.message||e).slice(0,140)}
async function run(url){
 assert(/^https:\/\//.test(url||''),'ETHEREUM_RPC_URL_REQUIRED');
 assert(Number.isInteger(MAX_IMPACT_BPS)&&MAX_IMPACT_BPS>0&&MAX_IMPACT_BPS<=10000,'INVALID_IMPACT_LIMIT');
 assert(Number.isInteger(MAX_QUOTE_GAS)&&MAX_QUOTE_GAS>=100000,'INVALID_GAS_LIMIT');
 const p=new ethers.JsonRpcProvider(url,1,{staticNetwork:true});
 try{
  assert.equal((await p.getNetwork()).chainId,1n);
  const block=await p.getBlockNumber(),report={build:'12.9.78',mode:'ETHEREUM_GHO_CURVE_UNISWAP_CROSS_VENUE_READ_ONLY',chainId:1,block,
   curvePool:CURVE_GHO_CRVUSD,uniswapFactory:UNI_FACTORY,uniswapQuoter:UNI_QUOTER,intermediate:'crvUSD',
   sizesGho:SIZES,quoteCalls:0,quoteFailures:0,rejectedForImpact:0,rejectedForGas:0,successfulRoundTrips:0,
   positiveGrossQuotes:0,pools:[],routes:[],errors:[],profitAfterGasVerified:false,atomicExecutionVerified:false,
   qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,
   limitations:['SINGLE_CURVE_GHO_CRVUSD_POOL_ONLY','ONLY_UNISWAP_V3_AS_SECOND_VENUE','SEPARATE_QUOTES_NOT_EXECUTED_IN_SHARED_STATE','CURVE_SWAP_GAS_NOT_ESTIMATED','NO_ETH_GAS_CONVERSION','NO_GHO_MINT_OR_SWAP_ATOMIC_FORK']};
  async function save(){fs.writeFileSync('arbiflow-gho-cross-venue-12978.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,routes:report.routes.slice(0,30)}))}
  if(await p.getCode(CURVE_GHO_CRVUSD,block)==='0x'){report.errors.push({stage:'CURVE_POOL',error:'NO_CODE'});await save();process.exitCode=1;return report}
  const pool=new ethers.Contract(CURVE_GHO_CRVUSD,POOL_ABI,p);let coin0,coin1;
  try{[coin0,coin1]=await Promise.all([pool.coins(0,{blockTag:block}),pool.coins(1,{blockTag:block})])}
  catch(e){report.errors.push({stage:'CURVE_COINS',error:msg(e)});await save();process.exitCode=1;return report}
  const coins=[coin0.toLowerCase(),coin1.toLowerCase()],gi=coins.indexOf(GHO.toLowerCase()),ci=coins.indexOf(CRVUSD.toLowerCase());
  report.curveCoins=[coin0,coin1];if(gi<0||ci<0){report.errors.push({stage:'CURVE_COINS',error:'POOL_ASSET_MISMATCH'});await save();process.exitCode=1;return report}
  const curve=new ethers.Contract(CURVE_GHO_CRVUSD,CURVE_ABIS,p),uni=new ethers.Contract(UNI_QUOTER,QABI,p),factory=new ethers.Contract(UNI_FACTORY,FABI,p);
  const pairs=[];
  for(const fee of FEES){
   try{const address=await factory.getPool(GHO,CRVUSD,fee,{blockTag:block});if(address!==ethers.ZeroAddress&&(await p.getCode(address,block))!=='0x'){pairs.push({fee,pool:address});report.pools.push({protocol:'UniswapV3',fee,pool:address})}}
   catch(e){report.errors.push({stage:'V3_POOL',fee,error:msg(e)})}
  }
  report.pools.push({protocol:'Curve',pool:CURVE_GHO_CRVUSD,coins:report.curveCoins});
  async function cq(i,j,amount){
   report.quoteCalls++;
   for(const signature of ['get_dy(int128,int128,uint256)','get_dy(uint256,uint256,uint256)']){
    try{return {amount:BigInt(await curve[signature](i,j,amount,{blockTag:block})),signature}}catch(e){}
   }
   report.quoteFailures++;return {error:'CURVE_QUOTE_FAILED'};
  }
  async function uq(a,b,fee,amount){
   report.quoteCalls++;
   try{const out=await uni.quoteExactInputSingle.staticCall({tokenIn:a,tokenOut:b,amountIn:amount,fee,sqrtPriceLimitX96:0},{blockTag:block});
    return {amount:BigInt(out.amountOut),gas:BigInt(out.gasEstimate)}
   }catch(e){report.quoteFailures++;return {error:msg(e)}}
  }
  for(const pair of pairs)for(const size of SIZES)for(const direction of ['CURVE_THEN_UNISWAP','UNISWAP_THEN_CURVE']){
   const input=BigInt(size)*10n**18n;
   const first=direction==='CURVE_THEN_UNISWAP'?await cq(gi,ci,input):await uq(GHO,CRVUSD,pair.fee,input);
   const row={direction,uniswapFee:pair.fee,sizeGho:size,curvePool:CURVE_GHO_CRVUSD,uniswapPool:pair.pool,status:null};
   if(first.error||first.amount===0n){row.status='FIRST_LEG_UNAVAILABLE';row.error=first.error||'ZERO_OUTPUT';report.routes.push(row);continue}
   const second=direction==='CURVE_THEN_UNISWAP'?await uq(CRVUSD,GHO,pair.fee,first.amount):await cq(ci,gi,first.amount);
   if(second.error||second.amount===0n){row.status='SECOND_LEG_UNAVAILABLE';row.error=second.error||'ZERO_OUTPUT';report.routes.push(row);continue}
   report.successfulRoundTrips++;
   const gross=second.amount-input;row.grossGho=ethers.formatUnits(gross,18);
   row.outputGho=ethers.formatUnits(second.amount,18);
   row.grossBps=Number(gross*10000n/input);row.positiveGross=gross>0n;
   const quotedGas=first.gas||second.gas||0n;row.uniswapQuoteGasUnits=quotedGas.toString();
   if(row.grossBps< -MAX_IMPACT_BPS){row.status='REJECTED_EXCESSIVE_GROSS_LOSS';report.rejectedForImpact++}
   else if(quotedGas>BigInt(MAX_QUOTE_GAS)){row.status='REJECTED_EXCESSIVE_QUOTER_GAS';report.rejectedForGas++}
   else{row.status='INDICATIVE_QUOTE_UNVERIFIED';if(row.positiveGross)report.positiveGrossQuotes++}
   report.routes.push(row);
  }
  report.routes.sort((a,b)=>Number(b.grossGho??-1e12)-Number(a.grossGho??-1e12));
  if(!pairs.length)report.errors.push({stage:'MARKETS',error:'NO_UNISWAP_GHO_CRVUSD_POOLS'});
  await save();return report;
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(SIZES.length,9);assert.equal(FEES.length,4);console.log(JSON.stringify({build:'12.9.78',unitAssertionsPassed:2}));
 run(process.env.ETHEREUM_RPC_URL).catch(e=>{console.error('CROSS_VENUE_12978_FAILED',msg(e));process.exitCode=1})}
module.exports={run};
