'use strict';
// Read-only Base cross-venue fee-tier research. No transaction submission.
const {ethers}=require('ethers');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const specs=[
 {name:'UNI_V3',address:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',tiers:[100,500,3000,10000],abi:'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'},
 {name:'AERO_SLIPSTREAM',address:'0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0',tiers:[1,10,50,100,200],abi:'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'}
];
const sizes=[100,500,1000,2500,5000,10000,25000,50000];
function score(principal,returned,premiumBps){
 const p=BigInt(principal),r=BigInt(returned),premium=(p*BigInt(premiumBps)+9999n)/10000n;
 return {grossRaw:String(r-p),afterPremiumBeforeGasRaw:String(r-p-premium),roundTripReturnBps:String((r-p)*10000n/p),positiveBeforeGas:r>p+premium,qualified:false};
}
async function scan(url){
 if(!/^https:\/\//.test(url||''))throw Error('BASE_RPC_REQUIRED');
 const rpc=new ethers.JsonRpcProvider(url,8453,{staticNetwork:true});
 try{
  if(BigInt(await rpc.send('eth_chainId',[]))!==8453n)throw Error('CHAIN_MISMATCH');
  const block=await rpc.getBlockNumber(),header=await rpc.getBlock(block);
  const aave=new ethers.Contract('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],rpc);
  const premiumBps=await aave.FLASHLOAN_PREMIUM_TOTAL({blockTag:block});
  const venues=specs.flatMap(s=>s.tiers.map(tier=>({name:s.name,tier,contract:new ethers.Contract(s.address,[s.abi],rpc)})));
  const failures={},rows=[];
  async function quote(v,from,to,amount){
   try{const result=await v.contract.quoteExactInputSingle.staticCall([from,to,amount,v.tier,0],{blockTag:block});return BigInt(result[0]);}
   catch{const key=v.name+':'+v.tier;failures[key]=(failures[key]||0)+1;return null;}
  }
  for(const size of sizes){
   const principal=BigInt(size)*1000000n;
   for(const buy of venues){
    const weth=await quote(buy,USDC,WETH,principal);
    if(!weth||weth<=0n)continue;
    for(const sell of venues){
     if(buy.name===sell.name&&buy.tier===sell.tier)continue;
     const returned=await quote(sell,WETH,USDC,weth);
     if(!returned||returned<=0n)continue;
     rows.push({sizeUsdc:size,buy:buy.name,buyTier:buy.tier,sell:sell.name,sellTier:sell.tier,...score(principal,returned,premiumBps)});
    }
   }
  }
  rows.sort((a,b)=>{const x=BigInt(a.afterPremiumBeforeGasRaw),y=BigInt(b.afterPremiumBeforeGasRaw);return x===y?0:x>y?-1:1;});
  return {build:'BASE_FEE_TIER_RESEARCH_V1',block,blockHash:header.hash,configurations:venues.length,tradeSizes:sizes.length,quotedRoundTrips:rows.length,positiveBeforeGas:rows.filter(r=>r.positiveBeforeGas).length,quoteFailures:failures,topRows:rows.slice(0,20),limitations:['USDC_WETH_ONLY','UNVERIFIED_POOL_IDENTITY','FLASH_LOAN_ELIGIBILITY_NOT_VERIFIED','GAS_AND_RISK_NOT_VERIFIED','SPOT_SPREAD_NOT_CALCULATED'],qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{rpc.destroy();}
}
if(require.main===module){
 const assert=require('node:assert/strict');
 assert.equal(score(1000000n,1001000n,5).positiveBeforeGas,true);
 assert.equal(score(1000000n,1000100n,5).positiveBeforeGas,false);
 console.log('BASE_FEE_TIER_RESEARCH_UNIT_PASS');
 if(process.env.BASE_RPC_URL)scan(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('RESEARCH_FAILED',String(e.message).slice(0,160));process.exitCode=1});
}
module.exports={scan,score,specs,sizes};
