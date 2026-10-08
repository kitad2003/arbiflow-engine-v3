'use strict';
// Phase 10.1: read-only pending-block classification. RPC pending view is not the full mempool.
const {Interface}=require('ethers');
const {simulateAerodrome}=require('./phase102-impact');
const routerRegistry={
 UNISWAP_ROUTER_02:'0x2626664c2603336e57b271c5c0b26f421741e481',
 AERODROME_ROUTER:'0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43'
};
const known=new Map(Object.entries(routerRegistry).map(([name,address])=>[address.toLowerCase(),name]));
const uni=new Interface([
 'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns(uint256)',
 'function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params) payable returns(uint256)',
 'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns(uint256)',
 'function multicall(bytes[] data) payable returns(bytes[] results)',
 'function multicall(uint256 deadline,bytes[] data) payable returns(bytes[] results)'
]);
const aero=new Interface([
 'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns(uint256[])',
 'function swapExactETHForTokens(uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) payable returns(uint256[])',
 'function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns(uint256[])'
]);
const safeError=e=>String(e?.shortMessage||e?.message||e).slice(0,160);
function decode(tx,routerName){
 const iface=routerName==='UNISWAP_ROUTER_02'?uni:aero;
 try{
  const parsed=iface.parseTransaction({data:tx.input,value:tx.value||'0x0'});
  if(!parsed)return {classification:'UNSUPPORTED_METHOD',methodSelector:String(tx.input).slice(0,10)};
  const p=parsed.args[0];
  const base={classification:'SUPPORTED_SWAP_METHOD',method:parsed.name};
  if(parsed.name==='exactInputSingle'||parsed.name==='exactOutputSingle'){
   return {...base,tokenIn:p.tokenIn,tokenOut:p.tokenOut,amountInRaw:p.amountIn?.toString()||null,amountOutRaw:p.amountOut?.toString()||null,amountOutMinimumRaw:p.amountOutMinimum?.toString()||null,amountInMaximumRaw:p.amountInMaximum?.toString()||null};
  }
  if(parsed.name==='exactInput')return {...base,amountInRaw:p.amountIn.toString(),amountOutMinimumRaw:p.amountOutMinimum.toString(),pathBytes:p.path.length/2-1};
  if(parsed.name==='multicall')return {classification:'NESTED_MULTICALL_NOT_DECODED',method:parsed.name,innerCalls:parsed.args[parsed.args.length-1].length};
  if(parsed.name.startsWith('swapExact')){
   const routes=parsed.args[parsed.name==='swapExactTokensForTokens'?2:1];
   return {...base,routeHops:routes.length,routeDetails:routes.slice(0,3).map(r=>({from:r.from,to:r.to,stable:r.stable,factory:r.factory})),amountInRaw:parsed.name==='swapExactETHForTokens'?BigInt(tx.value||'0x0').toString():parsed.args[0].toString(),tokenIn:routes[0]?.from||null,tokenOut:routes[routes.length-1]?.to||null};
  }
  return base;
 }catch{return {classification:'UNSUPPORTED_METHOD',methodSelector:String(tx.input).slice(0,10)};}
}
function mount(app,{getBaseChain,rpc}){
 const state={build:'10.2.0',running:false,checks:0,lastResult:null};
 app.get('/api/phase10/status',(_req,res)=>res.json({success:true,...state,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}}));
 app.get('/api/phase10/probe',async(_req,res)=>{
  if(state.running)return res.status(409).json({success:false,error:'PROBE_RUNNING'});
  state.running=true;state.checks++;
  try{
   const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');
   const pending=await Promise.race([rpc(chain,'eth_getBlockByNumber',['pending',true]),new Promise((_,reject)=>setTimeout(()=>reject(Error('PENDING_RPC_TIMEOUT_12000MS')),12000))]);
   const transactions=Array.isArray(pending?.transactions)?pending.transactions:[];
   const samples=transactions.slice(0,100),counts={nativeTransfer:0,contractCreation:0,contractInteraction:0,knownRouter:0,supportedSwapMethod:0,unsupportedRouterMethod:0,nestedMulticall:0,hashOnly:0};
   const routers={},swaps=[],unknownSelectors={};
   for(const tx of samples){
    if(!tx||typeof tx!=='object'){counts.hashOnly++;continue;}
    if(!tx.to){counts.contractCreation++;continue;}
    const data=String(tx.input||tx.data||'0x');
    if(data==='0x'||data.length<10){counts.nativeTransfer++;continue;}
    const name=known.get(String(tx.to).toLowerCase());
    if(!name){counts.contractInteraction++;const selector=data.slice(0,10);unknownSelectors[selector]=(unknownSelectors[selector]||0)+1;continue;}
    counts.knownRouter++;routers[name]=(routers[name]||0)+1;
    const result=decode({...tx,input:data},name);
    if(result.classification==='SUPPORTED_SWAP_METHOD'){counts.supportedSwapMethod++;swaps.push({hash:tx.hash,router:name,...result,status:'OBSERVED_NOT_SIMULATED',_txValue:tx.value||'0x0'});}
    else if(result.classification==='NESTED_MULTICALL')counts.nestedMulticall++;
    else counts.unsupportedRouterMethod++;
   }
   for(const swap of swaps.filter(x=>x.router==='AERODROME_ROUTER').slice(0,2)){swap.impact=await simulateAerodrome({value:swap._txValue},swap,chain,rpc);}
   for(const swap of swaps)delete swap._txValue;
   state.lastResult={success:true,build:state.build,chainId:8453,reportedPendingTransactions:transactions.length,inspectedTransactions:samples.length,counts,knownRouterHits:routers,topUnknownSelectors:Object.entries(unknownSelectors).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([selector,count])=>({selector,count})),decodedSupportedSwaps:swaps.length,swaps:swaps.slice(0,30),visibility:transactions.length?'RPC_PENDING_BLOCK_SAMPLE_NOT_FULL_MEMPOOL':'NO_PENDING_TRANSACTIONS_VISIBLE',limitations:['ROUTER_REGISTRY_PARTIAL','MULTICALL_INNER_CALLS_NOT_DECODED','NO_PRIVATE_ORDER_FLOW','INDICATIVE_ZERO_FEE_VOLATILE_MODEL_ONLY','NO_CONCENTRATED_LIQUIDITY_SIMULATION','NO_PROFIT_VALIDATION','NO_EXECUTION'],qualified:0,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
  }catch(e){state.lastResult={success:false,build:state.build,error:safeError(e),visibility:'RPC_PENDING_BLOCK_UNAVAILABLE',safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};}
  finally{state.running=false;}
  res.json(state.lastResult);
 });
}
module.exports={mount};
