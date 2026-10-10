'use strict';
// V28: signed Ethereum V26 transaction validation for the Flashbots MEV-Share
// beta-1 simulation body. Offline only: never submit or broadcast.
// Flashbots node may reject hash-only unmatched bodies in mev_simBundle.
const {ethers}=require('ethers');
const METHOD='mev_simBundle';
const RPC='https://relay.flashbots.net';
const HASH=/^0x[0-9a-f]{64}$/i;
const IFACE=new ethers.Interface(['function makeFlashLoan(address firstPair,address secondPair,uint256 amount,uint256 minFirstOut,uint256 minSecondOut,uint256 minProfit)']);
function prepare(input={}){
 const {targetHash,targetKind='TRANSACTION',backrunContract,backrunSignedTx,inclusionBlock,
  operatorAddress,verifiedFirstPool,verifiedSecondPool}=input;
 if(targetKind!=='TRANSACTION')return {ready:false,reason:'BUNDLE_HASH_NOT_TRANSACTION_HASH'};
 if(!HASH.test(targetHash||''))return {ready:false,reason:'TARGET_TRANSACTION_HASH_REQUIRED'};
 if(!ethers.isAddress(backrunContract||''))return {ready:false,reason:'DEPLOYED_V26_CONTRACT_REQUIRED'};
 if(!ethers.isAddress(operatorAddress||''))return {ready:false,reason:'OPERATOR_ADDRESS_REQUIRED'};
 if(!ethers.isAddress(verifiedFirstPool||'')||!ethers.isAddress(verifiedSecondPool||'')||
  verifiedFirstPool.toLowerCase()===verifiedSecondPool.toLowerCase())
  return {ready:false,reason:'FACTORY_VERIFIED_POOL_INPUTS_REQUIRED'};
 if(!Number.isSafeInteger(inclusionBlock)||inclusionBlock<1)return {ready:false,reason:'INCLUSION_BLOCK_REQUIRED'};
 if(typeof backrunSignedTx!=='string'||!/^0x[0-9a-f]+$/i.test(backrunSignedTx))
  return {ready:false,reason:'SIGNED_BACKRUN_TX_REQUIRED'};
 let tx;
 try{tx=ethers.Transaction.from(backrunSignedTx)}catch{return {ready:false,reason:'INVALID_SIGNED_TX'}};
 if(!tx.hash||tx.chainId!==1n||!tx.from)return {ready:false,reason:'SIGNED_MAINNET_TX_REQUIRED'};
 if(!tx.to||tx.to.toLowerCase()!==backrunContract.toLowerCase())return {ready:false,reason:'WRONG_BACKRUN_DESTINATION'};
 if(tx.from.toLowerCase()!==operatorAddress.toLowerCase())return {ready:false,reason:'WRONG_OPERATOR_SIGNER'};
 if(tx.value!==0n)return {ready:false,reason:'BACKRUN_ETH_VALUE_MUST_BE_ZERO'};
 let parsed;
 try{parsed=IFACE.parseTransaction({data:tx.data,value:tx.value})}catch{}
 if(parsed?.name!=='makeFlashLoan')return {ready:false,reason:'V26_SIX_ARGUMENT_CALL_REQUIRED'};
 const [first,second,amount,minFirst,minSecond,minProfit]=parsed.args;
 if(first.toLowerCase()!==verifiedFirstPool.toLowerCase()||
  second.toLowerCase()!==verifiedSecondPool.toLowerCase())
  return {ready:false,reason:'BACKRUN_POOL_INPUT_MISMATCH'};
 if([amount,minFirst,minSecond,minProfit].some(x=>x<=0n))
  return {ready:false,reason:'POSITIVE_LOAN_OUTPUT_AND_PROFIT_LIMITS_REQUIRED'};
 const bundle={version:'beta-1',inclusion:{block:'0x'+inclusionBlock.toString(16)},
  body:[{hash:targetHash.toLowerCase()},{tx:backrunSignedTx,canRevert:false}],
  validity:{refund:[],refundConfig:[]}};
 return {ready:true,reason:null,method:METHOD,endpoint:RPC,chainId:1,
  backrunHash:tx.hash,targetHash:targetHash.toLowerCase(),
  loanPrincipalRaw:amount.toString(),minFirstOutRaw:minFirst.toString(),
  minSecondOutRaw:minSecond.toString(),minProfitRaw:minProfit.toString(),
  request:{jsonrpc:'2.0',id:1,method:METHOD,params:[bundle]},
  caution:'HASH_ONLY_TARGET_MAY_BE_UNMATCHED: mev_simBundle requires fully matched bodies; this is not an RPC simulation result'};
}
function report(input={}){
 const p=prepare(input);
 return {build:'BALANCER_RESEARCH_V28',mode:'OFFLINE_V26_MEV_SHARE_SIMULATION_ENVELOPE',
  status:p.ready?'STRUCTURE_VALID_NOT_SIMULATED':'BLOCKED',reason:p.reason||null,
  targetFirst:p.ready,version:p.ready?'beta-1':null,
  signedBackrunValidated:p.ready,signedTransactionCreated:false,
  simulated:false,simBundleRequested:false,mainnetBroadcast:false,
  bundlesSubmitted:0,profitVerified:false,executionEligible:false,
  unmatchedTargetSimulationMayBeRejected:true,
  limitations:['NO_ONCHAIN_DEPLOYMENT_PROVEN','NO_FULLY_MATCHED_TARGET_TRANSACTION',
   'NO_GAS_ADJUSTED_PROFIT','NO_BACKRUN_SIMULATION_OR_SUBMISSION']};
}
module.exports={prepare,report,IFACE,METHOD};
if(require.main===module)console.log(JSON.stringify(report({
 targetHash:process.env.V28_TARGET_HASH,
 backrunContract:process.env.V28_CONTRACT_ADDRESS,
 backrunSignedTx:process.env.V28_SIGNED_TX,
 inclusionBlock:process.env.V28_INCLUSION_BLOCK?Number(process.env.V28_INCLUSION_BLOCK):undefined,
 operatorAddress:process.env.V28_OPERATOR_ADDRESS,
 verifiedFirstPool:process.env.V28_FIRST_POOL,
 verifiedSecondPool:process.env.V28_SECOND_POOL
})));
