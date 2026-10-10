'use strict';
// Flashbots Automated Arbitrage Bot: Filtering Relevant Transactions.
// Exactly one observed Ethereum V2 swap-hint pool from V14; read pair token0/token1,
// identify factory and look up the same pair on the opposite tutorial exchange.
// A log hint is not a full transaction, quote, flash loan or profitable backrun.
const {ethers}=require('ethers');
const {discover}=require('./verified-pairs-v12');
const {SWAP_TOPIC}=require('./bot');
const OBSERVED_POOL='0x15ab0333985fd1e289adf4fbbe19261454776642';
async function verify({provider,discoverImpl=discover,pool=OBSERVED_POOL}={}){
 if(!ethers.isAddress(pool))throw Error('INVALID_OBSERVED_POOL');
 if(!provider)throw Error('ETHEREUM_PROVIDER_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const result=await discoverImpl(provider,{address:pool,topics:[SWAP_TOPIC]});
 return {build:'BALANCER_RESEARCH_V15',mode:'OBSERVED_ETHEREUM_SWAP_POOL_FACTORY_VERIFICATION',
  source:'V14_LIVE_MEV_SHARE_DISCLOSED_LOG_HINT',network:'ethereum-mainnet',
  observedPool:pool,recognizedSwapHint:result.recognized===true,
  observationBlock:result.blockNumber??null,observationBlockHash:result.blockHash??null,
  originatingPoolVerified:result.identity?.verified===true,
  originFactory:result.identity?.factory||null,originVenue:result.identity?.venue||null,
  token0:result.identity?.token0||null,token1:result.identity?.token1||null,
  alternativePairFound:result.alternative?.found===true,
  alternativePool:result.alternative?.pool||null,
  alternativeVenue:result.alternative?.venue||null,
  alternativeFactory:result.alternative?.factory||null,
  verifiedCrossVenuePair:result.verifiedCrossVenuePair===true,
  originFailureReason:result.identity?.reason||result.reason||null,
  alternativeFailureReason:result.alternative?.reason||null,
  livePendingEventReplayed:false,executableQuotes:0,profitVerified:false,
  ethereumBalancerFlashLoanVerified:false,backrunOrderingVerified:false,
  executionEligible:false,bundlesSubmitted:0,mainnetBroadcast:false,
  limitations:['V14_HINT_NOT_TRANSACTION_BODY','FACTORY_LOOKUPS_USE_CONFIRMED_ETHEREUM_STATE',
   'PAIR_IDENTITY_DOES_NOT_PROVE_LIQUIDITY_OR_PROFIT','NO_PENDING_STATE_SIMULATION',
   'NO_ETHEREUM_BALANCER_FLASH_LOAN_VERIFIED','NO_BACKRUN_SUBMISSION']};
}
module.exports={OBSERVED_POOL,verify};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL){
  console.error('V15_FAILED ETHEREUM_RPC_URL_REQUIRED');process.exitCode=1;
 }else{
  const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  verify({provider}).then(x=>console.log(JSON.stringify(x)))
    .catch(e=>{console.error('V15_FAILED',String(e.message).slice(0,180));process.exitCode=1})
    .finally(()=>provider.destroy());
 }
}
