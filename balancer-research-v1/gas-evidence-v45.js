'use strict';
// V45 read-only gas sensitivity without fabricating an operator-specific estimate.
const {ethers}=require('ethers');
const {compileTwice}=require('./reproducible-v26-v43');
const {expected}=require('./v26-mainnet-gate-v40');
const {sources}=require('./deployment-plan-v42');
function intrinsic(initCode){
 const bytes=ethers.getBytes(initCode);
 const zero=bytes.reduce((n,b)=>n+(b===0),0);
 const nonzero=bytes.length-zero;
 const words=Math.ceil(bytes.length/32);
 const floor=53000n+4n*BigInt(zero)+16n*BigInt(nonzero)+2n*BigInt(words);
 return {initCodeBytes:bytes.length,zeroBytes:zero,nonzeroBytes:nonzero,initCodeWords:words,intrinsicGasFloor:floor.toString()};
}
async function investigate({provider,operator,compile=compileTwice}={}){
 const base={build:'BALANCER_RESEARCH_V45',mode:'READ_ONLY_DEPLOYMENT_GAS_SENSITIVITY',
  researchSourcesTracked:sources.length,operatorConfigured:ethers.isAddress(operator||''),
  transactionSigned:false,contractDeployed:false,mainnetBroadcast:false,bundlesSubmitted:0,
  estimateGasCalled:false,simulationReady:false};
 let c;try{c=compile()}catch(e){return {...base,status:'BLOCKED',reason:'COMPILE_FAILED',detail:String(e.message).slice(0,130)}}
 if(!c.reproducible)return {...base,status:'BLOCKED',reason:'COMPILE_NOT_REPRODUCIBLE'};
 const tx=await c.factory.getDeployTransaction(expected.vault,expected.loanToken,expected.intermediateToken,expected.factoryA,expected.factoryB);
 const result={...base,status:'INTRINSIC_FLOOR_ONLY',creationCodeHash:c.creationCodeHash,
  initCodeHash:ethers.keccak256(tx.data),...intrinsic(tx.data),observedGasPriceWei:null,
  indicativeIntrinsicFloorCostWei:null,operatorSpecificGasUnits:null,operatorSpecificCostWei:null,
  note:'Intrinsic floor is NOT a full contract deployment gas estimate'};
 if(!provider)return {...result,reason:'RPC_MISSING'};
 try{
  const network=await provider.getNetwork();
  if(network.chainId!==1n)return {...result,reason:'ETHEREUM_MAINNET_REQUIRED'};
  const fee=await provider.getFeeData();
  const price=fee?.gasPrice;
  if(price!=null){
   result.observedGasPriceWei=price.toString();
   result.indicativeIntrinsicFloorCostWei=(BigInt(result.intrinsicGasFloor)*price).toString();
  }
  if(!result.operatorConfigured)return {...result,reason:'ACTUAL_OPERATOR_ADDRESS_REQUIRED'};
  result.estimateGasCalled=true;
  try{
   const gas=await provider.estimateGas({from:operator,data:tx.data,value:0n});
   result.operatorSpecificGasUnits=gas.toString();
   result.operatorSpecificCostWei=price!=null?(gas*price).toString():null;
   result.status='UNSIGNED_RPC_ESTIMATE_OBTAINED';
   result.reason='ESTIMATE_ONLY_NOT_DEPLOYMENT_APPROVAL';
  }catch(e){result.reason='OPERATOR_SPECIFIC_GAS_ESTIMATE_FAILED';result.error=String(e.message).slice(0,100)}
  return result;
 }catch(e){return {...result,reason:'ETHEREUM_READ_FAILED',error:String(e.message).slice(0,100)}}
}
module.exports={intrinsic,investigate};
if(require.main===module){
 const p=process.env.ETHEREUM_RPC_URL?new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL):null;
 investigate({provider:p,operator:process.env.V42_OPERATOR_ADDRESS})
 .then(r=>console.log(JSON.stringify(r)))
 .catch(e=>{console.error(e);process.exitCode=1})
 .finally(()=>p?.destroy());
}
