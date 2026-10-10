'use strict';
// V41 read-only research: Balancer V2 live fee/liquidity and V26 deployment prerequisites.
// No deployment, signing, transaction simulation or submission.
const {ethers}=require('ethers');
const {verify}=require('./v26-mainnet-gate-v40');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const vaultAbi=['function getProtocolFeesCollector() view returns(address)'];
const collectorAbi=['function getFlashLoanFeePercentage() view returns(uint256)'];
const erc20Abi=['function balanceOf(address) view returns(uint256)'];
async function check({provider,address,operator,contractFactory=(a,abi,p)=>new ethers.Contract(a,abi,p),verifyImpl=verify}={}){
 const r={build:'BALANCER_RESEARCH_V41',mode:'READ_ONLY_DEPLOYMENT_AND_BALANCER_PREREQUISITES',
 chainVerified:false,balancerFeeVerified:false,balancerLiquidityVerified:false,
 v26DeploymentVerified:false,deployReady:false,simulationReady:false,
 signing:false,contractDeployedByWorkflow:false,mainnetBroadcast:false,bundlesSubmitted:0,blockers:[]};
 if(!provider){r.blockers.push('ETHEREUM_RPC_REQUIRED');return r}
 try{
  const network=await provider.getNetwork();
  if(network.chainId!==1n){r.blockers.push('ETHEREUM_MAINNET_REQUIRED');return r}
  r.chainVerified=true;
  const vault=contractFactory(VAULT,vaultAbi,provider);
  const collector=await vault.getProtocolFeesCollector();
  if(!ethers.isAddress(collector)){r.blockers.push('INVALID_PROTOCOL_FEE_COLLECTOR');return r}
  r.feeCollector=collector;
  const fee=await contractFactory(collector,collectorAbi,provider).getFlashLoanFeePercentage();
  r.flashLoanFeePercentageRaw=String(fee);r.balancerFeeVerified=true;
  const weth=contractFactory(WETH,erc20Abi,provider);
  const balance=await weth.balanceOf(VAULT);
  r.vaultWethLiquidityWei=String(balance);r.balancerLiquidityVerified=true;
 }catch(e){r.blockers.push('BALANCER_ONCHAIN_READ_FAILED');r.diagnostic=String(e.message).slice(0,110)}
 if(!ethers.isAddress(address||'')){
  r.blockers.push('V26_CONTRACT_ADDRESS_NOT_CONFIGURED');
 }else{
  const d=await verifyImpl({provider,address,operator});
  r.contractGate={reason:d.reason,deployed:d.deployed,configurationVerified:d.configurationVerified,operatorVerified:d.operatorVerified};
  r.v26DeploymentVerified=!!(d.deployed&&d.configurationVerified&&d.operatorVerified);
  if(!r.v26DeploymentVerified)r.blockers.push('V26_DEPLOYMENT_OR_CONFIGURATION_UNVERIFIED');
 }
 r.blockers.push('V26_RUNTIME_BYTECODE_IDENTITY_UNVERIFIED','SIGNED_BACKRUN_UNAVAILABLE',
 'TARGET_FIRST_SIMULATION_NOT_PERFORMED','GAS_AND_REALIZED_NET_PROFIT_NOT_VERIFIED');
 return r;
}
module.exports={check};
if(require.main===module){
 const p=process.env.ETHEREUM_RPC_URL?new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL):null;
 check({provider:p,address:process.env.V40_CONTRACT_ADDRESS,operator:process.env.V40_EXPECTED_OPERATOR})
 .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p?.destroy());
}
