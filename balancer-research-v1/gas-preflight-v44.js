'use strict';
const {ethers}=require('ethers');
const {compileTwice}=require('./reproducible-v26-v43');
const {expected}=require('./v26-mainnet-gate-v40');
async function inspect({provider,operator}={}){
 const out={build:'BALANCER_RESEARCH_V44',mode:'READ_ONLY_GAS_PREFLIGHT',signing:false,mainnetBroadcast:false,contractDeployed:false};
 const artifact=compileTwice();
 out.reproducible=artifact.reproducible;
 out.creationCodeHash=artifact.creationCodeHash;
 const tx=await artifact.factory.getDeployTransaction(expected.vault,expected.loanToken,expected.intermediateToken,expected.factoryA,expected.factoryB);
 out.initCodeBytes=ethers.getBytes(tx.data).length;
 out.initCodeHash=ethers.keccak256(tx.data);
 if(!provider)return {...out,status:'BLOCKED',reason:'RPC_MISSING'};
 const network=await provider.getNetwork();
 if(network.chainId!==1n)return {...out,status:'BLOCKED',reason:'WRONG_CHAIN'};
 const fees=await provider.getFeeData();
 out.gasPriceWei=fees.gasPrice?.toString()||null;
 if(!ethers.isAddress(operator||''))return {...out,status:'BLOCKED',reason:'OPERATOR_ADDRESS_MISSING'};
 try{
 const gas=await provider.estimateGas({from:operator,data:tx.data,value:0n});
 return {...out,status:'UNSIGNED_ESTIMATE_ONLY',gasUnits:gas.toString(),estimatedCostWei:fees.gasPrice?(gas*fees.gasPrice).toString():null};
 }catch(e){return {...out,status:'BLOCKED',reason:'ESTIMATE_GAS_FAILED',detail:String(e.message).slice(0,120)}}
}
module.exports={inspect};
if(require.main===module){
 const p=process.env.ETHEREUM_RPC_URL?new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL):null;
 inspect({provider:p,operator:process.env.V42_OPERATOR_ADDRESS}).then(x=>console.log(JSON.stringify(x))).finally(()=>p?.destroy());
}