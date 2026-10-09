'use strict';
// Phase 12.0 read-only same-pair V3 spot observation; NOT executable pricing.
const {Interface}=require('ethers');
const abi=new Interface(['function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)']);
async function compare(discovery,chain,rpc){
 const base={model:'V3_SAME_PAIR_SPOT_DIAGNOSTIC',spreadPct:null,estimatedNetProfitUsd:null,qualified:false,executionEligible:false};
 if(!Array.isArray(discovery?.venues)||discovery.venues.length<2)return {...base,status:'INSUFFICIENT_POOLS',observations:[]};
 const observations=[],errors=[];
 for(const venue of discovery.venues.slice(0,4)){
  try{const raw=await rpc(chain,'eth_call',[{to:venue.pool,data:abi.encodeFunctionData('slot0',[])},'latest']);const d=abi.decodeFunctionResult('slot0',raw);const sqrt=BigInt(d[0]);if(sqrt<=0n)throw Error('INVALID_SQRT_PRICE');
   observations.push({pool:venue.pool,fee:venue.fee,tick:Number(d[1]),sqrtPriceX96Raw:sqrt.toString(),stateBlockTag:'latest'});
  }catch(e){errors.push({pool:venue.pool,error:String(e?.shortMessage||e?.message||e).slice(0,120)});}
 }
 return {...base,status:observations.length>=2?'SPOT_OBSERVATIONS_COLLECTED':'INSUFFICIENT_SPOT_OBSERVATIONS',observations,errors,limitations:['SEQUENTIAL_LATEST_READS_NOT_ATOMIC','SPOT_NOT_EXECUTABLE_QUOTE','NO_TICK_CROSSING_OR_TRADE_SIZE_SIMULATION','NO_GAS_SLIPPAGE_OR_NET_PROFIT']};
}
module.exports={compare};
