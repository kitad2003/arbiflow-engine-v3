'use strict';
// Phase 11.7: Uniswap V3 Base pool identification and raw concentrated-liquidity state.
// These observations are NOT swap impact, executable quotes, or arbitrage profits.
const {Interface}=require('ethers');
const factory='0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const iface=new Interface(['function getPool(address tokenA,address tokenB,uint24 fee) view returns(address)']);
const poolIface=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)']);
const ZERO='0x0000000000000000000000000000000000000000';
const isAddress=x=>/^0x[0-9a-fA-F]{40}$/.test(String(x||''));
async function call(chain,rpc,to,abi,method,args=[]){const raw=await rpc(chain,'eth_call',[{to,data:abi.encodeFunctionData(method,args)},'latest']);return abi.decodeFunctionResult(method,raw);}
async function inspect(swap,chain,rpc){
 const base={model:'UNISWAP_V3_RAW_POOL_STATE',verifiedImpact:false,qualified:false,executionEligible:false};
 if(swap.router!=='UNISWAP_ROUTER_02'||!['exactInputSingle','exactOutputSingle'].includes(swap.method))return {...base,status:'NOT_APPLICABLE'};
 if(!isAddress(swap.tokenIn)||!isAddress(swap.tokenOut)||![100,500,3000,10000].includes(Number(swap.fee)))return {...base,status:'TOKEN_OR_FEE_UNAVAILABLE'};
 try{
  const [pool]=await call(chain,rpc,factory,iface,'getPool',[swap.tokenIn,swap.tokenOut,Number(swap.fee)]);
  if(pool.toLowerCase()===ZERO)return {...base,status:'POOL_NOT_FOUND',fee:swap.fee};
  const [token0]=await call(chain,rpc,pool,poolIface,'token0');
  const [token1]=await call(chain,rpc,pool,poolIface,'token1');
  const [actualFee]=await call(chain,rpc,pool,poolIface,'fee');
  if(![swap.tokenIn.toLowerCase(),swap.tokenOut.toLowerCase()].includes(token0.toLowerCase())||![swap.tokenIn.toLowerCase(),swap.tokenOut.toLowerCase()].includes(token1.toLowerCase())||token0.toLowerCase()===token1.toLowerCase()||Number(actualFee)!==Number(swap.fee))return {...base,status:'POOL_IDENTITY_MISMATCH'};
  const [liquidity]=await call(chain,rpc,pool,poolIface,'liquidity');
  const slot=await call(chain,rpc,pool,poolIface,'slot0');
  return {...base,status:'POOL_STATE_VERIFIED',pool,fee:Number(actualFee),token0,token1,liquidityRaw:liquidity.toString(),sqrtPriceX96Raw:slot[0].toString(),tick:Number(slot[1]),stateBlockTag:'latest',warnings:['LATEST_STATE_NOT_PENDING_PARENT','LIQUIDITY_AND_SQRT_PRICE_DO_NOT_CAPTURE_TICK_CROSSINGS','NO_SWAP_IMPACT_ESTIMATE','NO_EXECUTABLE_QUOTE']};
 }catch(e){return {...base,status:'RPC_OR_POOL_ERROR',error:String(e?.shortMessage||e?.message||e).slice(0,160)};}
}
module.exports={inspect};
