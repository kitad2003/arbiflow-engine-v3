'use strict';
// Read-only Base gas telemetry; gas price is NOT a transaction gas estimate.
// No swap/flash loan execution, no USD conversion without ETH/USD oracle.
const safety={readOnly:true,mainnetBroadcast:false,executionEligible:false};
function mount(app,{getBaseChain,rpc}){
 let running=false,lastResult=null;
 app.get('/api/phase12/gas/status',(_req,res)=>res.json({success:true,build:'12.9.0',running,lastResult,safety}));
 app.get('/api/phase12/gas/probe',async(_req,res)=>{
  if(running)return res.status(409).json({success:false,error:'GAS_PROBE_RUNNING',safety});
  running=true;
  const timeout=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPC_TIMEOUT')),ms)})]).finally(()=>clearTimeout(timer))};
  try{
   const chain=getBaseChain();if(Number(chain?.chainId)!==8453)throw Error('BASE_CHAIN_REQUIRED');
   const [id,gasPrice,block]=await Promise.all([
    timeout(rpc(chain,'eth_chainId',[]),18000),
    timeout(rpc(chain,'eth_gasPrice',[]),18000),
    timeout(rpc(chain,'eth_blockNumber',[]),18000)
   ]);
   if(BigInt(id)!==8453n)throw Error('WRONG_RPC_CHAIN');
   const price=BigInt(gasPrice);if(price<0n)throw Error('INVALID_GAS_PRICE');
   lastResult={success:true,build:'12.9.0',chainId:8453,blockTag:block,observedGasPriceWei:price.toString(),observedGasPriceGwei:(Number(price)/1e9).toFixed(9),transactionGasUnits:null,l1DataFeeWei:null,ethUsdPrice:null,transactionGasCostUsd:null,netProfitVerified:false,notes:['OBSERVED_GAS_PRICE_IS_NOT_ESTIMATED_TRANSACTION_COST','L2_DATA_FEE_NOT_INCLUDED','NO_EXECUTOR_TRANSACTION_AVAILABLE_FOR_ESTIMATE_GAS'],safety};
  }catch(e){lastResult={success:false,build:'12.9.0',error:String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,100),safety}}
  finally{running=false}
  res.json(lastResult);
 });
}
module.exports={mount};
