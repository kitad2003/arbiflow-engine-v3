'use strict';
// Phase 10.6: confirmed Base USDC/WETH Uniswap V3 swap-event evidence.
// This is confirmed-chain observation, not advance mempool visibility.
const {Interface,id}=require('ethers');
const FACTORY='0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const factory=new Interface(['function getPool(address tokenA,address tokenB,uint24 fee) view returns(address)']);
const swap=new Interface(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
const ZERO='0x0000000000000000000000000000000000000000';
const safety={readOnly:true,mainnetBroadcast:false,executionEligible:false};
const err=e=>String(e?.shortMessage||e?.message||e).slice(0,480);
async function run(chain,rpc){
 const latestHex=await rpc(chain,'eth_blockNumber',[]);
 const latest=Number(BigInt(latestHex));
 const from=Math.max(0,latest-12);
 const pools=[];
 for(const fee of [500,3000]){
  try{
   const data=factory.encodeFunctionData('getPool',[USDC,WETH,fee]);
   const result=await rpc(chain,'eth_call',[{to:FACTORY,data},'latest']);
   const [address]=factory.decodeFunctionResult('getPool',result);
   if(address.toLowerCase()!==ZERO)pools.push({fee,address});
  }catch(e){pools.push({fee,error:err(e)});}
 }
 const observations=[];let logFailures=0;const logDiagnostics=[];
 for(const pool of pools.filter(p=>p.address)){
  try{
   let logs,usedRange='13_BLOCKS';const topic=id('Swap(address,address,int256,int256,uint160,uint128,int24)');
   try{logs=await rpc(chain,'eth_getLogs',[{address:pool.address,fromBlock:'0x'+from.toString(16),toBlock:'0x'+latest.toString(16),topics:[topic]}]);}
   catch(first){logDiagnostics.push({fee:pool.fee,attempt:'13_BLOCKS',error:err(first)});usedRange='LATEST_SINGLE_BLOCK';try{logs=await rpc(chain,'eth_getLogs',[{address:pool.address,fromBlock:'0x'+latest.toString(16),toBlock:'0x'+latest.toString(16),topics:[topic]}]);}catch(second){logDiagnostics.push({fee:pool.fee,attempt:'LATEST_SINGLE_BLOCK',error:err(second)});throw second;}}
   pool.logQuery=usedRange;
   if(!Array.isArray(logs))throw Error('INVALID_LOGS');
   for(const log of logs.slice(-15)){
    const event=swap.parseLog(log);
    observations.push({pool:pool.address,fee:pool.fee,transactionHash:log.transactionHash,blockNumber:Number(BigInt(log.blockNumber)),amount0Raw:event.args.amount0.toString(),amount1Raw:event.args.amount1.toString(),sqrtPriceX96After:event.args.sqrtPriceX96.toString(),status:'CONFIRMED_SWAP_EVENT_NOT_PREDICTED'});
   }
  }catch(e){logFailures++;pool.error=err(e);}
 }
 return {success:true,build:'10.6.1',chainId:8453,latestBlock:latest,fromBlock:from,pools,confirmedSwapEvents:observations.length,observations:observations.slice(-20),logFailures,logDiagnostics,predictionMatches:0,predictionMatchingImplemented:false,limitations:['CONFIRMED_EVENTS_ONLY','NO_PENDING_TRANSACTION_LINKAGE','NO_PRICE_PREDICTION_VALIDATION','NO_PROFIT_VALIDATION'],safety};
}
function mount(app,{getBaseChain,rpc}){
 const state={running:false,checks:0,lastResult:null};
 app.get('/api/phase10/events/status',(_req,res)=>res.json({success:true,build:'10.6.1',...state,safety}));
 app.get('/api/phase10/events/probe',async(_req,res)=>{
  if(state.running)return res.status(409).json({success:false,error:'PROBE_RUNNING'});
  state.running=true;state.checks++;
  try{const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');state.lastResult=await run(chain,rpc);}
  catch(e){state.lastResult={success:false,build:'10.6.0',error:err(e),safety};}
  finally{state.running=false;}
  res.json(state.lastResult);
 });
}
module.exports={mount};
