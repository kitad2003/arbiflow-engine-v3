'use strict';
// Phase 11.8: bounded same-pair alternative Uniswap V3 fee-tier discovery.
// Pool state alone is not a quote. Never infer spread, profit, or eligibility.
const {Interface}=require('ethers');
const factory='0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const f=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const p=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)']);
const ZERO='0x0000000000000000000000000000000000000000';
async function call(rpc,chain,to,iface,name,args=[]){const result=await rpc(chain,'eth_call',[{to,data:iface.encodeFunctionData(name,args)},'latest']);return iface.decodeFunctionResult(name,result);}
async function discover(swap,chain,rpc){
 const base={model:'SAME_PAIR_V3_FEE_TIER_DISCOVERY',executableQuotesVerified:false,spreadPct:null,netProfitUsd:null,qualified:false,executionEligible:false};
 if(!swap.v3Pool||swap.v3Pool.status!=='POOL_STATE_VERIFIED'||!swap.tokenIn||!swap.tokenOut)return {...base,status:'SOURCE_POOL_NOT_VERIFIED',venues:[]};
 const venues=[{venue:'UNISWAP_V3',pool:swap.v3Pool.pool,fee:swap.v3Pool.fee,liquidityRaw:swap.v3Pool.liquidityRaw,verified:true}];const failures=[];
 for(const fee of [100,500,3000,10000].filter(x=>x!==swap.v3Pool.fee)){
  try{const [pool]=await call(rpc,chain,factory,f,'getPool',[swap.tokenIn,swap.tokenOut,fee]);if(pool.toLowerCase()===ZERO)continue;
   const [t0]=await call(rpc,chain,pool,p,'token0');const [t1]=await call(rpc,chain,pool,p,'token1');const [actualFee]=await call(rpc,chain,pool,p,'fee');const [liq]=await call(rpc,chain,pool,p,'liquidity');
   const expected=[swap.tokenIn.toLowerCase(),swap.tokenOut.toLowerCase()].sort().join(':');const actual=[t0.toLowerCase(),t1.toLowerCase()].sort().join(':');
   if(expected!==actual||Number(actualFee)!==fee){failures.push({fee,error:'POOL_IDENTITY_MISMATCH'});continue;}
   venues.push({venue:'UNISWAP_V3',pool,fee,liquidityRaw:liq.toString(),verified:true});
  }catch(e){failures.push({fee,error:String(e?.shortMessage||e?.message||e).slice(0,100)});}
 }
 return {...base,status:venues.length>1?'SAME_PAIR_POOLS_FOUND':'NO_ALTERNATIVE_VERIFIED_POOL',tokenIn:swap.tokenIn,tokenOut:swap.tokenOut,venues,failures,warnings:['SAME_DEX_FEE_TIERS_NOT_CROSS_DEX','LIQUIDITY_IS_NOT_EXECUTABLE_QUOTE','NO_SPREAD_OR_NET_PROFIT_VALIDATION']};
}
module.exports={discover};
