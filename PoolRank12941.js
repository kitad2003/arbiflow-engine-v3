'use strict';
// 12.9.41: read-only exact-size, saturated-pool rejection + cross-venue USDC round trips.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const U='0x222ca98f00ed15b1fae10b61c277703a194cf5d2',P='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const PAIR=['function getAmountOut(uint256,address) view returns(uint256)'];
const MIN=10000n*1000000n,DOUBLE=20000n*1000000n;
function eligible(x){return x.pair.startsWith('USDC/')&&['UNISWAP_V3','PANCAKESWAP_V3','AERODROME_V1'].includes(x.dex)}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 const universe=await discover(rpc);assert(universe.success,'POOL_MINIMUM_NOT_MET');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await provider.send('eth_chainId',[])),8453n);
  const block=universe.confirmedBlock;
  const q={UNISWAP_V3:new ethers.Contract(U,ABI,provider),PANCAKESWAP_V3:new ethers.Contract(P,ABI,provider)};
  const bp=Number(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const quote=async(pool,from,to,size)=>{
   if(pool.kind==='v1')return BigInt(await new ethers.Contract(pool.address,PAIR,provider).getAmountOut(size,from,{blockTag:block}));
   return BigInt((await q[pool.dex].quoteExactInputSingle.staticCall([from,to,size,Number(pool.poolConfig),0],{blockTag:block}))[0]);
  };
  const samples=[],groups={};
  for(const pool of universe.pools.filter(eligible)){
   const token=TOKENS[pool.pair.split('/')[1]],row={address:pool.address,dex:pool.dex,pair:pool.pair,block,usableAt10k:false,reason:null};
   try{
    const first=await quote(pool,TOKENS.USDC,token,MIN);
    const twice=await quote(pool,TOKENS.USDC,token,DOUBLE);
    row.outputAt10kRaw=first.toString();row.outputAt20kRaw=twice.toString();
    // Saturation protection: twofold input must produce at least 1.5x output.
    if(first===0n||twice*2n<first*3n){row.reason='EXHAUSTED_OR_HIGH_PRICE_IMPACT';samples.push(row);continue}
    row.usableAt10k=true;
    if(!groups[pool.pair])groups[pool.pair]=[];
    groups[pool.pair].push({...pool,outputAt10k:first});
   }catch(e){row.reason='QUOTE_FAILED';row.error=String(e?.shortMessage||e?.code||e?.message||e).slice(0,60)}
   samples.push(row);
  }
  const routes=[];
  for(const [pair,pools] of Object.entries(groups)){
   const target=TOKENS[pair.split('/')[1]];
   for(const buy of pools)for(const sell of pools){
    if(buy.address.toLowerCase()===sell.address.toLowerCase()||buy.dex===sell.dex)continue;
    const row={pair,firstPool:buy.address,secondPool:sell.address,firstDex:buy.dex,secondDex:sell.dex,loanUsdc:10000,confirmedBlock:block,qualified:false};
    try{
     const returned=await quote(sell,target,TOKENS.USDC,buy.outputAt10k);
     const premium=(MIN*BigInt(bp)+9999n)/10000n;
     const after=returned-MIN-premium;
     row.returnedUsdcRaw=returned.toString();row.afterAaveBeforeGasRaw=after.toString();
     row.grossSpreadAboveHalfPercent=(returned-MIN)*10000n>MIN*50n;
     row.positiveBeforeGas=after>0n;
    }catch(e){row.error='REVERSE_QUOTE_FAILED'}
    routes.push(row);
   }
  }
  const promising=routes.filter(r=>r.positiveBeforeGas&&r.grossSpreadAboveHalfPercent).sort((a,b)=>BigInt(a.afterAaveBeforeGasRaw)>BigInt(b.afterAaveBeforeGasRaw)?-1:1);
  return {success:true,build:'12.9.41',mode:'BASE_DEPTH_GATED_CROSS_DEX_ROUND_TRIPS',block,discoveredPools:universe.uniqueActivePools,usdcPoolsEvaluated:samples.length,poolsPassingDepthGate:samples.filter(x=>x.usableAt10k).length,depthGate:'20k_OUTPUT_AT_LEAST_1_5X_10k_OUTPUT',crossDexRoundTripsTested:routes.length,promisingBeforeGas:promising.length,topPreGasCandidates:promising.slice(0,10),samples,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,warning:'DEPTH_HEURISTIC_ONLY; NO GAS, SLIPPAGE, FORK_SETTLEMENT OR RISK QUALIFICATION'};
 }finally{provider.destroy()}
}
if(require.main===module){
 assert.equal(MIN,10000000000n);
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('RANK_12941_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
 else console.log(JSON.stringify({build:'12.9.41',unitTest:true,readOnly:true}));
}
module.exports={run};
