'use strict';
const {ethers}=require('ethers');
const expected={vault:'0xBA12222222228d8Ba445958a75a0704d566BF2C8',loanToken:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',intermediateToken:'0xec67005c4E498Ec7f55E092bd1d35cbC47C91892',factoryA:'0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',factoryB:'0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'};
const abi=Object.keys({...expected,operator:''}).map(k=>'function '+k+'() view returns(address)');
async function verify({provider,address,operator,makeContract=(a,p)=>new ethers.Contract(a,abi,p)}={}){
 const result={build:'BALANCER_RESEARCH_V40',address:address||null,deployed:false,chainVerified:false,configurationVerified:false,operatorVerified:false,simulationReady:false,mainnetBroadcast:false,bundlesSubmitted:0};
 if(!ethers.isAddress(address||''))return {...result,reason:'CONTRACT_ADDRESS_NOT_CONFIGURED'};
 if(!provider)return {...result,reason:'ETHEREUM_RPC_REQUIRED'};
 try{
  const network=await provider.getNetwork();if(network.chainId!==1n)return {...result,reason:'WRONG_CHAIN'};
  result.chainVerified=true;
  const code=await provider.getCode(address);if(!code||code==='0x')return {...result,reason:'NO_DEPLOYED_BYTECODE'};
  result.deployed=true;result.bytecodeSize=(code.length-2)/2;
  const contract=makeContract(address,provider);const values={};
  for(const k of [...Object.keys(expected),'operator']){
   try{values[k]=await contract[k]()}catch{return {...result,reason:'V26_GETTER_READ_FAILED',failedGetter:k}}
  }
  const mismatch=Object.keys(expected).filter(k=>String(values[k]).toLowerCase()!==expected[k].toLowerCase());
  if(mismatch.length)return {...result,reason:'IMMUTABLE_CONFIGURATION_MISMATCH',mismatch};
  result.configurationVerified=true;
  if(!ethers.isAddress(operator||''))return {...result,reason:'EXPECTED_OPERATOR_NOT_CONFIGURED'};
  if(values.operator.toLowerCase()!==operator.toLowerCase())return {...result,reason:'OPERATOR_MISMATCH'};
  result.operatorVerified=true;
  return {...result,reason:'RUNTIME_BYTECODE_IDENTITY_AND_SIGNED_BACKRUN_UNVERIFIED'};
 }catch(e){return {...result,reason:'READ_ONLY_ETHEREUM_CHECK_FAILED',detail:String(e.message).slice(0,100)}}
}
module.exports={verify,expected};
if(require.main===module){
 const p=process.env.ETHEREUM_RPC_URL?new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL):null;
 verify({provider:p,address:process.env.V40_CONTRACT_ADDRESS,operator:process.env.V40_EXPECTED_OPERATOR})
 .then(x=>console.log(JSON.stringify(x))).finally(()=>p?.destroy());
}