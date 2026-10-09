'use strict';
// 12.9.2 Base GasPriceOracle telemetry, not an executable transaction-cost quote.
const {Interface}=require('ethers');
const ORACLE='0x420000000000000000000000000000000000000F';
const abi=new Interface(['function l1BaseFee() view returns(uint256)','function getL1Fee(bytes) view returns(uint256)']);
const safety={readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
const safe=e=>String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,150);
function mount(app,{getBaseChain,rpc}){
 let running=false,lastResult=null;
 app.get('/api/phase12/l1/status',(_req,res)=>res.json({success:true,build:'12.9.2',running,lastResult,safety}));
 app.get('/api/phase12/l1/probe',async(_req,res)=>{
  if(running)return res.status(409).json({success:false,error:'L1_PROBE_RUNNING',safety});
  running=true;let timer;
  try{
   const chain=getBaseChain();
   if(Number(chain?.chainId)!==8453)throw Error('BASE_CHAIN_REQUIRED');
   const bounded=async(method,params)=>{let t;try{return await Promise.race([rpc(chain,method,params),new Promise((_,rej)=>{t=setTimeout(()=>rej(Error('RPC_TIMEOUT')),15000)})])}finally{clearTimeout(t)}};
   const id=await bounded('eth_chainId',[]);
   if(BigInt(id)!==8453n)throw Error('WRONG_RPC_CHAIN');
   const block=await bounded('eth_blockNumber',[]);
   const raw=await bounded('eth_call',[{to:ORACLE,data:abi.encodeFunctionData('l1BaseFee',[])},block]);
   const fee=BigInt(abi.decodeFunctionResult('l1BaseFee',raw)[0]);
   lastResult={success:true,build:'12.9.2',chainId:8453,blockTag:block,oracle:ORACLE,observedL1BaseFeeWei:fee.toString(),sampleTransactionL1FeeWei:null,actualArbitrageL1FeeWei:null,transactionGasUnits:null,ethUsdPrice:null,netProfitVerified:false,notes:['L1_BASE_FEE_IS_NOT_THE_L1_DATA_FEE_FOR_A_TRANSACTION','GET_L1_FEE_REQUIRES_ENCODED_UNSIGNED_TRANSACTION','NO_ATOMIC_EXECUTOR_TRANSACTION_AVAILABLE'],safety};
  }catch(e){lastResult={success:false,build:'12.9.2',error:safe(e),safety}}
  finally{running=false;clearTimeout(timer)}
  res.json(lastResult);
 });
}
module.exports={mount};
