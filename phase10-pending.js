'use strict';
// Phase 10: diagnostic-only pending-block visibility. This is NOT full mempool access.
const {Interface}=require('ethers');
const iface=new Interface(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns(uint256)']);
const router='0x2626664c2603336e57b271c5c0b26f421741e481';
function mount(app,{getBaseChain,rpc}){
 const state={build:'10.0.0',running:false,checks:0,lastResult:null};
 app.get('/api/phase10/status',(_req,res)=>res.json({success:true,...state,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}}));
 app.get('/api/phase10/probe',async(_req,res)=>{
  if(state.running)return res.status(409).json({success:false,error:'PROBE_RUNNING'});
  state.running=true;state.checks++;
  try{
   const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');
   const pending=await Promise.race([rpc(chain,'eth_getBlockByNumber',['pending',true]),new Promise((_,reject)=>setTimeout(()=>reject(Error('PENDING_RPC_TIMEOUT_12000MS')),12000))]);
   const transactions=Array.isArray(pending?.transactions)?pending.transactions:[];
   const samples=transactions.slice(0,100);const swaps=[];
   for(const tx of samples){
    if(!tx||typeof tx!=='object'||String(tx.to||'').toLowerCase()!==router||!tx.input)continue;
    try{const parsed=iface.parseTransaction({data:tx.input});if(parsed?.name!=='exactInputSingle')continue;const p=parsed.args[0];swaps.push({hash:tx.hash,tokenIn:p.tokenIn,tokenOut:p.tokenOut,amountInRaw:p.amountIn.toString(),amountOutMinimumRaw:p.amountOutMinimum.toString(),status:'OBSERVED_NOT_SIMULATED'});}catch{}
   }
   state.lastResult={success:true,build:state.build,chainId:8453,reportedPendingTransactions:transactions.length,inspectedTransactions:samples.length,decodedSupportedSwaps:swaps.length,swaps,visibility:transactions.length?'RPC_PENDING_BLOCK_SAMPLE_NOT_FULL_MEMPOOL':'NO_PENDING_TRANSACTIONS_VISIBLE',limitations:['NO_PRIVATE_ORDER_FLOW','NO_POST_SWAP_SIMULATION','NO_PROFIT_VALIDATION','NO_EXECUTION'],qualified:0,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
  }catch(e){state.lastResult={success:false,build:state.build,error:String(e?.message||e).slice(0,150),visibility:'RPC_PENDING_BLOCK_UNAVAILABLE',safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};}
  finally{state.running=false;}
  res.json(state.lastResult);
 });
}
module.exports={mount};
