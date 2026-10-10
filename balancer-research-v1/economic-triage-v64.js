'use strict';
// Balancer V64: conservative economic triage of V55/V62 same-block V2 quotes.
// NO Aave/GHO, NO execution, NO claim of verified net profits.
// Only WETH-denominated routes can use native ETH gas without an external oracle.
const {ethers}=require('ethers');
const {evaluate}=require('./liquidity-quotes-v55');
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WETH_MIN_RESERVE=ethers.parseEther('1');
const WETH_MIN_INPUT=ethers.parseEther('0.01');
const MIN_GROSS_BPS=50n;
function triage(quote,{token0,token1,reserves,gasUnits=null,gasPriceWei=null,loanFeeBps=null,builderBidWei=null}={}){
 const amount=BigInt(quote.sizeRaw),returned=BigInt(quote.returnedRaw),delta=returned-amount;
 const reasons=[];
 if(amount<=0n)reasons.push('ZERO_TRADE_SIZE');
 if(amount>0n&&delta*10000n<=amount*MIN_GROSS_BPS)reasons.push('GROSS_RETURN_NOT_ABOVE_0_5_PERCENT');
 const t0=token0?.toLowerCase(),t1=token1?.toLowerCase(),input=quote.inputToken?.toLowerCase();
 const wethSide=t0===WETH.toLowerCase()?0:t1===WETH.toLowerCase()?1:-1;
 if(wethSide<0)reasons.push('WETH_RESERVE_LIQUIDITY_UNAVAILABLE_REQUIRE_USD_ORACLE');
 else {
  const a=reserves?.poolA,b=reserves?.poolB;
  if(!a||!b)reasons.push('BOTH_POOL_RESERVES_REQUIRED');
  else if([a,b].some(p=>BigInt(wethSide===0?p.r0:p.r1)<WETH_MIN_RESERVE))reasons.push('WETH_LIQUIDITY_BELOW_1_ETH_PER_POOL');
 }
 if(input!==WETH.toLowerCase())reasons.push('INPUT_NOT_WETH_REQUIRE_VERIFIED_PRICE_CONVERSION');
 else if(amount<WETH_MIN_INPUT)reasons.push('WETH_INPUT_BELOW_0_01');
 let gasWei=null,loanFeeWei=null,netWei=null;
 if(gasUnits===null||gasPriceWei===null)reasons.push('GAS_UNVERIFIED');
 else {gasWei=BigInt(gasUnits)*BigInt(gasPriceWei);if(gasWei<0n)reasons.push('INVALID_GAS_COST')}
 if(loanFeeBps===null)reasons.push('BALANCER_FLASH_LOAN_FEE_UNVERIFIED');
 else if(BigInt(loanFeeBps)<0n)reasons.push('INVALID_FLASH_LOAN_FEE');
 else if(input===WETH.toLowerCase())loanFeeWei=(amount*BigInt(loanFeeBps)+9999n)/10000n;
 if(builderBidWei===null)reasons.push('BUILDER_BID_UNVERIFIED');
 if(gasWei!==null&&loanFeeWei!==null&&builderBidWei!==null&&input===WETH.toLowerCase()){
  netWei=delta-gasWei-loanFeeWei-BigInt(builderBidWei);
  if(netWei<=0n)reasons.push('NET_AFTER_KNOWN_COSTS_NOT_POSITIVE');
 }
 reasons.push('POST_TARGET_ATOMIC_SIMULATION_NOT_VERIFIED','SWAP_FEE_AND_TOKEN_TRANSFER_BEHAVIOR_NOT_INDEPENDENTLY_VERIFIED');
 return {sizeRaw:amount.toString(),grossDeltaRaw:delta.toString(),grossReturnBps:amount>0n?(delta*10000n/amount).toString():null,
  gasWei:gasWei?.toString()??null,loanFeeWei:loanFeeWei?.toString()??null,indicativeNetWei:netWei?.toString()??null,
  economicallyInteresting:reasons.length===2&&netWei!==null&&netWei>0n,
  rejectionReasons:reasons,netProfitVerified:false,executionEligible:false};
}
async function assess(provider,poolA,poolB,{evaluateImpl=evaluate,costs={}}={}){
 const result=await evaluateImpl(provider,poolA,poolB);
 const rows=result.quotes.map(q=>triage(q,{token0:result.token0,token1:result.token1,reserves:result.reserves,...costs}));
 return {build:'BALANCER_ECONOMIC_TRIAGE_V64',poolA,poolB,blockNumber:result.blockNumber,
  scenarios:rows.length,positiveGross:rows.filter(x=>BigInt(x.grossDeltaRaw)>0n).length,
  blockedByDustLiquidity:rows.filter(x=>x.rejectionReasons.includes('WETH_LIQUIDITY_BELOW_1_ETH_PER_POOL')).length,
  blockedBySmallTrade:rows.filter(x=>x.rejectionReasons.includes('WETH_INPUT_BELOW_0_01')).length,
  scenariosReviewed:rows,qualified:0,alerts:[],netProfitVerified:false,executionEligible:false,mainnetBroadcast:false};
}
module.exports={WETH,WETH_MIN_RESERVE,WETH_MIN_INPUT,triage,assess};
