'use strict';
// Flashbots official mev_simBundle RPC: [target tx hash, signed backrun tx].
// Only simulation, never mev_sendBundle. No route assumed profitable.
// A signed backrun must be operator-supplied and address a deployed Balancer contract.
const {ethers}=require('ethers');
const HASH=/^0x[0-9a-f]{64}$/i;
const RPC='https://relay.flashbots.net';
const METHOD='mev_simBundle';
function prepare({targetHash,targetKind='TRANSACTION',backrunSignedTx,backrunContract,blockNumber}={}){
 if(targetKind!=='TRANSACTION')return {ready:false,reason:'BUNDLE_EVENT_HASH_NOT_TRANSACTION_HASH'};
 if(!HASH.test(targetHash||''))return {ready:false,reason:'TARGET_TRANSACTION_HASH_REQUIRED'};
 if(!ethers.isAddress(backrunContract||''))return {ready:false,reason:'DEPLOYED_BALANCER_BACKRUN_CONTRACT_REQUIRED'};
 if(!Number.isSafeInteger(blockNumber)||blockNumber<1)return {ready:false,reason:'INCLUSION_BLOCK_REQUIRED'};
 if(typeof backrunSignedTx!=='string'||!/^0x[0-9a-f]+$/i.test(backrunSignedTx))
  return {ready:false,reason:'SIGNED_BACKRUN_TRANSACTION_REQUIRED'};
 let tx;
 try{tx=ethers.Transaction.from(backrunSignedTx)}catch{return {ready:false,reason:'INVALID_SIGNED_BACKRUN_TX'}}
 if(!tx.hash||tx.chainId!==1n)return {ready:false,reason:'SIGNED_ETHEREUM_TX_REQUIRED'};
 if(!tx.to||tx.to.toLowerCase()!==backrunContract.toLowerCase())
  return {ready:false,reason:'BACKRUN_TARGET_CONTRACT_MISMATCH'};
 const iface=new ethers.Interface(['function makeFlashLoan(address firstPair,address secondPair,uint256 amount,uint256 minProfit)']);
 try{
  const parsed=iface.parseTransaction({data:tx.data,value:tx.value});
  if(parsed?.name!=='makeFlashLoan'||parsed.args[2]<=0n||parsed.args[3]<=0n)
   return {ready:false,reason:'INVALID_BALANCER_FLASH_LOAN_CALL'};
 }catch{return {ready:false,reason:'BACKRUN_NOT_BALANCER_FLASH_LOAN_CALL'}}
 const params={
  version:'beta-1',
  inclusion:{block:'0x'+blockNumber.toString(16)},
  body:[{hash:targetHash.toLowerCase()},{tx:backrunSignedTx,canRevert:false}],
  validity:{refund:[],refundConfig:[]}
 };
 return {ready:true,backrunHash:tx.hash,targetHash:targetHash.toLowerCase(),params,
  request:{jsonrpc:'2.0',id:1,method:METHOD,params:[params]}};
}
async function simulate(input,{fetchImpl=fetch,endpoint=RPC,allowRequest=false}={}){
 const prepared=prepare(input);
 const base={build:'BALANCER_RESEARCH_V19',mode:'ETHEREUM_MEV_SHARE_SIMULATION_ONLY',
  network:'ethereum-mainnet',targetFirst:true,protocolMethod:METHOD,
  mainnetBroadcast:false,bundlesSubmitted:0,executionEligible:false};
 if(!prepared.ready)return {...base,status:'BLOCKED',reason:prepared.reason,
  simulationAttempted:false,profitVerified:false};
 if(!allowRequest)return {...base,status:'READY_NOT_SENT',simulationAttempted:false,
  targetHash:prepared.targetHash,backrunHash:prepared.backrunHash,
  instruction:'Set V19_ALLOW_SIMULATION=true to call mev_simBundle; never send a bundle.',
  profitVerified:false};
 if(endpoint!==RPC)throw Error('ONLY_DOCUMENTED_FLASHBOTS_RPC_ALLOWED');
 const response=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(prepared.request),signal:AbortSignal.timeout(12000)});
 if(!response.ok)return {...base,status:'RPC_HTTP_ERROR',httpStatus:response.status,
  simulationAttempted:true,profitVerified:false};
 const payload=await response.json();
 if(payload.error)return {...base,status:'RPC_REJECTED',
  rpcCode:payload.error.code??null,rpcReason:String(payload.error.message||'').slice(0,180),
  simulationAttempted:true,profitVerified:false};
 const result=payload.result||{};
 // Protocol's 'profit' is a simulation field, NOT realized operator net profit.
 return {...base,status:result.success===true?'SIMULATION_RETURNED':'SIMULATION_NOT_SUCCESSFUL',
  simulationAttempted:true,simulationSucceeded:result.success===true,
  targetHash:prepared.targetHash,backrunHash:prepared.backrunHash,
  stateBlock:result.stateBlock||null,reportedProfitWei:result.profit||null,
  reportedGasUsed:result.gasUsed||null,reportedMevGasPrice:result.mevGasPrice||null,
  operatorNetProfitVerified:false,balancerRepaymentVerified:false,
  profitVerified:false,limitations:['MEV_SIM_PROFIT_NOT_NET_OPERATOR_PROFIT',
   'REFUND_AND_GAS_MUST_BE_ACCOUNTED_FOR','BALANCER_RECEIPT_NOT_VERIFIED',
   'NO_BUNDLE_SUBMISSION','SIGNED_BACKRUN_MUST_BE_DEPLOYED_CONTRACT_CALL']};
}
module.exports={prepare,simulate,RPC,METHOD};
if(require.main===module)simulate({
 targetHash:process.env.V19_TARGET_HASH,
 targetKind:process.env.V19_TARGET_KIND||'TRANSACTION',
 backrunSignedTx:process.env.V19_SIGNED_BACKRUN_TX,
 backrunContract:process.env.V19_BACKRUN_CONTRACT,
 blockNumber:process.env.V19_BLOCK_NUMBER?Number(process.env.V19_BLOCK_NUMBER):undefined
},{allowRequest:process.env.V19_ALLOW_SIMULATION==='true'})
 .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('V19_FAILED',String(e.message).slice(0,160));process.exitCode=1});
