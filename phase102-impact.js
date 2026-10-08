'use strict';
// Phase 10.2: bounded, indicative V2 constant-product price-impact model.
// Assumes zero pool fee; NOT a protocol-exact quote or executable arbitrage.
const {Interface}=require('ethers');
const factoryIface=new Interface(['function getPool(address,address,bool) view returns(address)']);
const poolIface=new Interface(['function getReserves() view returns(uint256,uint256,uint256)','function token0() view returns(address)','function token1() view returns(address)']);
const ZERO='0x0000000000000000000000000000000000000000';
async function call(rpc,chain,to,data){const raw=await rpc(chain,'eth_call',[{to,data},'latest']);if(typeof raw!=='string'||!raw.startsWith('0x'))throw Error('INVALID_CALL_RESULT');return raw;}
async function simulateAerodrome(tx,parsed,chain,rpc){
 const base={model:'V2_VOLATILE_ZERO_FEE_INDICATIVE',executionEligible:false,qualified:false,verified:false};
 if(parsed.method!=='swapExactETHForTokens'&&parsed.method!=='swapExactTokensForTokens'&&parsed.method!=='swapExactTokensForETH')return {...base,status:'UNSUPPORTED_SWAP_METHOD'};
 const routes=parsed.routeDetails;
 if(!Array.isArray(routes)||routes.length!==1)return {...base,status:'MULTIHOP_NOT_SUPPORTED'};
 const route=routes[0];
 if(route.stable)return {...base,status:'STABLE_CURVE_NOT_SUPPORTED'};
 const amount=parsed.method==='swapExactETHForTokens'?BigInt(tx.value||'0x0'):BigInt(parsed.amountInRaw||'0');
 if(amount<=0n)return {...base,status:'INPUT_AMOUNT_UNAVAILABLE'};
 try{
  const poolRaw=await call(rpc,chain,route.factory,factoryIface.encodeFunctionData('getPool',[route.from,route.to,false]));
  const [pool]=factoryIface.decodeFunctionResult('getPool',poolRaw);
  if(pool.toLowerCase()===ZERO)return {...base,status:'POOL_NOT_FOUND'};
  const [reserveRaw,t0Raw]=await Promise.all([
   call(rpc,chain,pool,poolIface.encodeFunctionData('getReserves',[])),
   call(rpc,chain,pool,poolIface.encodeFunctionData('token0',[]))
  ]);
  const [r0,r1]=poolIface.decodeFunctionResult('getReserves',reserveRaw);
  const [t0]=poolIface.decodeFunctionResult('token0',t0Raw);
  const tokenInIs0=t0.toLowerCase()===route.from.toLowerCase();
  const reserveIn=tokenInIs0?r0:r1,reserveOut=tokenInIs0?r1:r0;
  if(reserveIn<=0n||reserveOut<=0n)return {...base,status:'ZERO_RESERVES'};
  // Constant-product fee-free upper-bound estimate, not actual swap output.
  const estimatedOut=amount*reserveOut/(reserveIn+amount);
  const reserveInAfter=reserveIn+amount,reserveOutAfter=reserveOut-estimatedOut;
  const priceImpactBps=Number((amount*10000n)/(reserveIn+amount));
  return {...base,status:'INDICATIVE_ONLY',pool,tokenIn:route.from,tokenOut:route.to,amountInRaw:amount.toString(),reserveInRaw:reserveIn.toString(),reserveOutRaw:reserveOut.toString(),estimatedOutRaw:estimatedOut.toString(),reserveInAfterRaw:reserveInAfter.toString(),reserveOutAfterRaw:reserveOutAfter.toString(),estimatedPriceImpactBps:priceImpactBps,assumptions:['CONSTANT_PRODUCT','ZERO_FEE_UPPER_BOUND','LATEST_STATE_NOT_PENDING_PARENT','NO_COMPETING_TRANSACTIONS'],warning:'NOT_AN_EXACT_PROTOCOL_QUOTE_OR_PROFIT_PREDICTION'};
 }catch(e){return {...base,status:'RPC_OR_POOL_ERROR',error:String(e?.shortMessage||e?.message||e).slice(0,120)};}
}
module.exports={simulateAerodrome};
