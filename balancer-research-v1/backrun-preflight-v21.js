'use strict';
// Flashbots MEV-Share: target hash then signed backrun, simulation-only.
// Balancer research contract must already exist on Ethereum; no deployment/signing/broadcast.
const {ethers}=require('ethers');
const {prepare}=require('./mev-simulation-v19');
const ABI=['function vault() view returns(address)','function operator() view returns(address)',
 'function loanToken() view returns(address)','function intermediateToken() view returns(address)'];
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
async function preflight({provider,contractAddress,targetHash,backrunSignedTx,blockNumber}={}){
 const base={build:'BALANCER_RESEARCH_V21',mode:'MEV_SHARE_BALANCER_BACKRUN_DEPLOYMENT_PREFLIGHT',
  network:'ethereum-mainnet',targetHash:targetHash||null,mainnetBroadcast:false,
  deploymentPerformed:false,signingPerformed:false,simulationAttempted:false,
  bundlesSubmitted:0,operatorNetProfitVerified:false,executionEligible:false};
 if(!provider)return {...base,status:'BLOCKED',reason:'ETHEREUM_RPC_REQUIRED'};
 if((await provider.getNetwork()).chainId!==1n)return {...base,status:'BLOCKED',reason:'ETHEREUM_MAINNET_REQUIRED'};
 if(!ethers.isAddress(contractAddress||''))return {...base,status:'BLOCKED',reason:'DEPLOYED_BALANCER_CONTRACT_ADDRESS_REQUIRED'};
 const block=await provider.getBlock('latest');
 if(!block?.hash)return {...base,status:'BLOCKED',reason:'CONFIRMED_BLOCK_UNAVAILABLE'};
 if((await provider.getCode(contractAddress,block.number))==='0x')
  return {...base,status:'BLOCKED',reason:'BALANCER_CONTRACT_CODE_ABSENT',verifiedBlock:block.number};
 const contract=new ethers.Contract(contractAddress,ABI,provider);
 let vault,operator,loanToken,intermediateToken;
 try{[vault,operator,loanToken,intermediateToken]=await Promise.all([
  contract.vault({blockTag:block.number}),contract.operator({blockTag:block.number}),
  contract.loanToken({blockTag:block.number}),contract.intermediateToken({blockTag:block.number})])}
 catch{return {...base,status:'BLOCKED',reason:'BALANCER_CONTRACT_INTERFACE_NOT_VERIFIED'}};
 if(vault.toLowerCase()!==VAULT.toLowerCase()||loanToken.toLowerCase()!==WETH.toLowerCase()||
  intermediateToken.toLowerCase()!==MLN.toLowerCase())
  return {...base,status:'BLOCKED',reason:'BALANCER_CONTRACT_CONFIGURATION_MISMATCH',
   deployedContract:contractAddress,verifiedBlock:block.number};
 const prepared=prepare({targetHash,backrunSignedTx,backrunContract:contractAddress,blockNumber});
 if(!prepared.ready)return {...base,status:'BLOCKED',reason:prepared.reason,
  contractConfigurationVerified:true,operator,verifiedBlock:block.number};
 const tx=ethers.Transaction.from(backrunSignedTx);
 if(!tx.from||tx.from.toLowerCase()!==operator.toLowerCase())
  return {...base,status:'BLOCKED',reason:'BACKRUN_SIGNER_NOT_CONTRACT_OPERATOR',
   contractConfigurationVerified:true,verifiedBlock:block.number};
 if(blockNumber<=block.number)return {...base,status:'BLOCKED',reason:'INCLUSION_BLOCK_NOT_FUTURE',
  verifiedBlock:block.number,requestedBlock:blockNumber};
 return {...base,status:'READY_FOR_SIMULATION_ONLY',
  contractConfigurationVerified:true,verifiedBlock:block.number,verifiedBlockHash:block.hash,
  deployedContract:contractAddress,backrunHash:prepared.backrunHash,
  simulationRequestValidated:true,simulationMethod:'mev_simBundle',
  limitations:['CODE_AND_READ_METHODS_NOT_PROOF_OF_CANONICAL_CONTRACT_BYTECODE',
   'NO_EXECUTION_OR_PAYLOAD_SUBMITTED','SIMULATOR_CAN_REJECT_STALE_TARGET',
   'SIGNED_TX_MUST_STILL_HAVE_VALID_NONCE_GAS_AND_BALANCE',
   'GAS_REFUNDS_AND_OPERATOR_NET_PROFIT_NOT_VERIFIED']};
}
module.exports={preflight};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL){console.error('V21_RPC_REQUIRED');process.exitCode=1}
 else{const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 preflight({provider,contractAddress:process.env.V21_BALANCER_BACKRUN_CONTRACT,
  targetHash:process.env.V21_TARGET_HASH,
  backrunSignedTx:process.env.V21_SIGNED_BACKRUN_TX,
  blockNumber:process.env.V21_INCLUSION_BLOCK?Number(process.env.V21_INCLUSION_BLOCK):undefined})
  .then(x=>console.log(JSON.stringify(x)))
  .catch(e=>{console.error('V21_FAILED',String(e.message).slice(0,150));process.exitCode=1})
  .finally(()=>provider.destroy());}
}
