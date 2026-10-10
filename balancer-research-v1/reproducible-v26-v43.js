'use strict';
// V43 compilation/estimation only. No signer, deploy, broadcast or bundle submission.
const fs=require('node:fs'),path=require('node:path');
const {ethers}=require('ethers');
const {expected}=require('./v26-mainnet-gate-v40');
const SOURCE=path.join(__dirname,'BalancerEthereumAtomicV26.sol');
const SETTINGS={optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}};
function compileTwice({solc=require('solc'),source=fs.readFileSync(SOURCE,'utf8')}={}){
 const version=solc.version();
 if(!version.startsWith('0.8.24+'))throw Error('SOLC_VERSION_NOT_PINNED_0_8_24: '+version);
 const input=JSON.stringify({language:'Solidity',sources:{'BalancerEthereumAtomicV26.sol':{content:source}},settings:SETTINGS});
 const compile=()=>{const out=JSON.parse(solc.compile(input));const errs=(out.errors||[]).filter(x=>x.severity==='error');
  if(errs.length)throw Error('SOLC_COMPILE_FAILED:'+errs.map(e=>e.message).join(';').slice(0,160));
  const c=out.contracts?.['BalancerEthereumAtomicV26.sol']?.BalancerEthereumAtomicV26;
  if(!c?.evm?.bytecode?.object)throw Error('BYTECODE_MISSING');
  return c;};
 const a=compile(),b=compile(),bytecode='0x'+a.evm.bytecode.object;
 const reproducible=a.evm.bytecode.object===b.evm.bytecode.object&&
  a.evm.deployedBytecode.object===b.evm.deployedBytecode.object;
 return {solcVersion:version,settings:SETTINGS,reproducible,sourceHash:ethers.keccak256(ethers.toUtf8Bytes(source)),
  creationCodeHash:ethers.keccak256(bytecode),creationCodeBytes:(bytecode.length-2)/2,
  runtimeTemplateHash:ethers.keccak256('0x'+a.evm.deployedBytecode.object),
  factory:new ethers.ContractFactory(a.abi,bytecode)};
}
async function report({provider,operator,compileImpl=compileTwice}={}){
 const base={build:'BALANCER_RESEARCH_V43',mode:'OFFLINE_V26_REPRODUCIBLE_COMPILE_AND_ESTIMATE',
   deploymentAuthorized:false,transactionSigned:false,transactionSent:false,
   mainnetBroadcast:false,bundlesSubmitted:0,simulationReady:false};
 let c;try{c=compileImpl()}catch(e){return {...base,status:'BLOCKED',reason:String(e.message)}}
 const result={...base,status:'COMPILED_NOT_DEPLOYED',solcVersion:c.solcVersion,
  reproducible:c.reproducible,sourceHash:c.sourceHash,
  creationCodeHash:c.creationCodeHash,creationCodeBytes:c.creationCodeBytes,
  runtimeTemplateHash:c.runtimeTemplateHash,constructorArgs:[
   expected.vault,expected.loanToken,expected.intermediateToken,expected.factoryA,expected.factoryB],
  constructorOperatorIsDeployer:true,estimatedGasUnits:null,
  estimatedDeploymentWei:null,blockers:['OPERATOR_REQUIRED_FOR_DEPLOYMENT_GAS_ESTIMATE',
   'MAINNET_DEPLOYMENT_NOT_APPROVED','NO_SIGNED_BACKRUN_OR_TARGET_FIRST_SIMULATION']};
 if(!c.reproducible)return {...result,status:'BLOCKED',reason:'BYTECODE_NOT_REPRODUCIBLE'};
 if(!provider||!ethers.isAddress(operator||''))return result;
 try{
  const network=await provider.getNetwork();
  if(network.chainId!==1n)return {...result,status:'BLOCKED',reason:'ETHEREUM_MAINNET_REQUIRED'};
  const tx=await c.factory.getDeployTransaction(...result.constructorArgs);
  result.constructorInitCodeHash=ethers.keccak256(tx.data);
  const fee=await provider.getFeeData();
  const gas=await provider.estimateGas({from:operator,data:tx.data,value:0n});
  result.estimatedGasUnits=String(gas);
  result.observedGasPriceWei=fee.gasPrice?.toString()||null;
  result.estimatedDeploymentWei=fee.gasPrice?(gas*fee.gasPrice).toString():null;
  result.blockers=result.blockers.filter(x=>x!=='OPERATOR_REQUIRED_FOR_DEPLOYMENT_GAS_ESTIMATE');
  result.blockers.push('GAS_ESTIMATE_ONLY_NOT_GUARANTEED');
  result.status='GAS_ESTIMATED_NO_DEPLOYMENT';
 }catch(e){result.reason='DEPLOYMENT_GAS_ESTIMATE_UNAVAILABLE';
  result.estimateError=String(e.message).slice(0,150)}
 return result;
}
module.exports={compileTwice,report};
if(require.main===module){
 const provider=process.env.ETHEREUM_RPC_URL?new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL):null;
 report({provider,operator:process.env.V42_OPERATOR_ADDRESS})
 .then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error(e);process.exitCode=1})
 .finally(()=>provider?.destroy());
}
