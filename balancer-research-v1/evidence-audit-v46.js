'use strict';
// V46 evidence audit. No key access, signing, deployment, simulation, or RPC send.
// Independent of missing operator address; does not invent missing evidence.
const {ethers}=require('ethers');
const {expected}=require('./v26-mainnet-gate-v40');
const {sources}=require('./deployment-plan-v42');
const {compileTwice}=require('./reproducible-v26-v43');
function audit({operator,contractAddress,sourceCompiler=compileTwice}={}){
 const a=sourceCompiler();
 const operatorPresent=ethers.isAddress(operator||'');
 const deployedAddressPresent=ethers.isAddress(contractAddress||'');
 const evidence={
  sixSourcesRegistered:sources.length===6,
  compilationReproducible:a.reproducible,
  pinnedSolc024:a.solcVersion.startsWith('0.8.24+'),
  v26LoanTokenWeth:expected.loanToken.toLowerCase()==='0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  v26IntermediateTokenMln:expected.intermediateToken.toLowerCase()==='0xec67005c4e498ec7f55e092bd1d35cbc47c91892',
  operatorConfigured:operatorPresent,
  deployedContractAddressConfigured:deployedAddressPresent
 };
 const blockers=[];
 if(!operatorPresent)blockers.push('DEPLOYER_OPERATOR_ADDRESS_REQUIRED');
 if(!deployedAddressPresent)blockers.push('DEPLOYED_CONTRACT_ADDRESS_NOT_VERIFIED');
 blockers.push('TARGET_SPECIFIC_POST_TRANSACTION_SIMULATION_NOT_DEMONSTRATED');
 blockers.push('SIGNED_COMPATIBLE_BACKRUN_NOT_AVAILABLE');
 blockers.push('MEV_SHARE_MATCHED_TARGET_NOT_VERIFIED');
 blockers.push('GAS_ADJUSTED_NET_PROFIT_NOT_PROVEN');
 return {build:'BALANCER_RESEARCH_V46',mode:'RESEARCH_EVIDENCE_GATE',evidence,sourceCount:sources.length,
  creationCodeHash:a.creationCodeHash,constructorArgs:[expected.vault,expected.loanToken,expected.intermediateToken,expected.factoryA,expected.factoryB],
  blockers,readyForDeployment:false,readyForLiveBackrun:false,
  simulationAttempted:false,signing:false,mainnetBroadcast:false,bundlesSubmitted:0};
}
module.exports={audit};
if(require.main===module)console.log(JSON.stringify(audit({
 operator:process.env.V42_OPERATOR_ADDRESS,contractAddress:process.env.V40_CONTRACT_ADDRESS
})));
