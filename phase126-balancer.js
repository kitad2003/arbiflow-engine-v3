'use strict';
// Phase 12.6: Balancer V2 Base read-only flash-loan diagnostics.
// Always fail closed. The Balancer wind-down requires manual security review.
const {Interface}=require('ethers');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const vaultAbi=new Interface([
 'function getProtocolFeesCollector() view returns(address)',
 'function getPausedState() view returns(bool paused,uint256 pauseWindowEndTime,uint256 bufferPeriodEndTime)'
]);
const feesAbi=new Interface(['function getFlashLoanFeePercentage() view returns(uint256)']);
const tokenAbi=new Interface(['function balanceOf(address) view returns(uint256)']);
const safe=e=>String(e?.shortMessage||e?.message||e).slice(0,180);
async function read(chain,rpc,to,iface,fn,args=[]){
 const data=iface.encodeFunctionData(fn,args);
 const raw=await rpc(chain,'eth_call',[{to,data},'latest']);
 return iface.decodeFunctionResult(fn,raw);
}
async function probe(chain,rpc){
 if(Number(chain?.chainId)!==8453)throw Error('BASE_CHAIN_REQUIRED');
 const code=await rpc(chain,'eth_getCode',[VAULT,'latest']);
 if(!code||code==='0x')throw Error('BALANCER_VAULT_CODE_NOT_FOUND');
 const [collector]=await read(chain,rpc,VAULT,vaultAbi,'getProtocolFeesCollector');
 if(!/^0x[0-9a-fA-F]{40}$/.test(collector)||/^0x0{40}$/i.test(collector))throw Error('INVALID_FEES_COLLECTOR');
 const collectorCode=await rpc(chain,'eth_getCode',[collector,'latest']);
 if(!collectorCode||collectorCode==='0x')throw Error('COLLECTOR_CODE_NOT_FOUND');
 const [feeRate]=await read(chain,rpc,collector,feesAbi,'getFlashLoanFeePercentage');
 const fee=BigInt(feeRate);
 if(fee>10000000000000000n)throw Error('UNEXPECTED_FLASH_LOAN_FEE');
 const [balance]=await read(chain,rpc,USDC,tokenAbi,'balanceOf',[VAULT]);
 const [paused]=await read(chain,rpc,VAULT,vaultAbi,'getPausedState');
 const liquidity=BigInt(balance);
 const candidates=[100,500,1000,5000,10000].map(usdc=>{
  const principal=BigInt(usdc)*1000000n;
  const premium=(principal*fee+999999999999999999n)/1000000000000000000n;
  return {amountUsdc:usdc,feeRaw:premium.toString(),feeUsdc:(Number(premium)/1e6).toFixed(6),withinObservedVaultBalance:principal<=liquidity};
 });
 return {
  provider:'BALANCER_V2',chainId:8453,vault:VAULT,asset:USDC,feesCollector:collector,
  flashLoanFeePercentageRaw:fee.toString(),
  feeBpsApprox:Number(fee)*10000/1e18,
  vaultPaused:Boolean(paused),vaultCodeVerified:true,
  observedUsdcVaultBalanceRaw:liquidity.toString(),
  loanAmountScreens:candidates,
  technicalPreScreen:!paused,
  providerPolicy:'BLOCKED_PENDING_WINDDOWN_SECURITY_REVIEW',
  qualifiedForExecution:false,flashLoanCallbackVerified:false,
  warnings:['BALANCER_PROTOCOL_WINDDOWN_2026','VAULT_BALANCE_NOT_GUARANTEED_FLASH_LOAN_AVAILABILITY','CALLBACK_AND_ATOMIC_REPAYMENT_NOT_FORK_TESTED','DO_NOT_ASSUME_ZERO_FEES'],
  safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}
 };
}
function mount(app,{getBaseChain,rpc}){
 let lastResult=null,lastCheckedAt=null,running=false;
 app.get('/api/phase12/balancer/status',(_req,res)=>res.json({success:true,build:'12.6.0',provider:'BALANCER_V2',network:'BASE',lastCheckedAt,lastResult,running,providerPolicy:'BLOCKED_PENDING_WINDDOWN_SECURITY_REVIEW',safety:{readOnly:true,executionEligible:false}}));
 app.get('/api/phase12/balancer/probe',async(_req,res)=>{
  if(running)return res.status(409).json({success:false,error:'PROBE_ALREADY_RUNNING'});
  running=true;
  try{
   lastResult={success:true,...await probe(getBaseChain(),rpc)};
  }catch(e){lastResult={success:false,error:safe(e),providerPolicy:'BLOCKED_PENDING_WINDDOWN_SECURITY_REVIEW',qualifiedForExecution:false,safety:{readOnly:true,executionEligible:false}};}
  finally{running=false;lastCheckedAt=new Date().toISOString();}
  res.json(lastResult);
 });
}
module.exports={probe,mount};
