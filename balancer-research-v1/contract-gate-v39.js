'use strict';
// V39 read-only Ethereum checks: never assume a contract is deployed.
const {ethers}=require('ethers');
const {makeParser}=require('./stream-parser-v39');
const ADDR=/^0x[0-9a-fA-F]{40}$/;
async function verify({provider,address,operator}={}){
 const report={build:'BALANCER_RESEARCH_V39',address:address||null,
  deployed:false,operatorVerified:false,simulationReady:false,
  signing:false,mainnetBroadcast:false,bundlesSubmitted:0};
 if(!ADDR.test(address||''))return {...report,reason:'CONTRACT_ADDRESS_NOT_CONFIGURED'};
 if(!provider)return {...report,reason:'ETHEREUM_RPC_NOT_CONFIGURED'};
 try{
  const code=await provider.getCode(address);
  if(!code||code==='0x')return {...report,reason:'NO_DEPLOYED_BYTECODE_AT_ADDRESS'};
  report.deployed=true;report.codeBytes=(code.length-2)/2;
  if(!ADDR.test(operator||''))return {...report,reason:'OPERATOR_ADDRESS_NOT_CONFIGURED'};
  // V26 owner/operator getter is not presumed to exist; cannot certify it.
  return {...report,reason:'OPERATOR_PERMISSION_AND_TOKEN_COMPATIBILITY_NOT_YET_VERIFIED'};
 }catch(e){return {...report,reason:'ONCHAIN_READ_FAILED',detail:String(e.message).slice(0,100)}}
}
module.exports={verify,makeParser};
if(require.main===module){
 const p=process.env.ETHEREUM_RPC_URL?new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL):null;
 verify({provider:p,address:process.env.V39_CONTRACT_ADDRESS,operator:process.env.V39_OPERATOR_ADDRESS})
 .then(x=>console.log(JSON.stringify(x))).finally(()=>p?.destroy());
}