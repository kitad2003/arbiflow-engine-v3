'use strict';
// Sources: Flashbots MEV-Share Flash Loan Basics (Balancer), Automated Arbitrage Bot.
// No inferred backrun direction, no pre-transaction profit promise, no broadcasts.
// Reads verified V15 WETH/MLN exchange-pair reserves and Balancer Ethereum Vault reads.
const {ethers}=require('ethers');
const {verify:verifyBalancer}=require('./verify-vault');
const {verify:verifyObserved,OBSERVED_POOL}=require('./verify-observed-pool-v15');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const POOL_ABI=['function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)',
 'function token0() view returns (address)','function token1() view returns (address)'];
async function readPairReserves(provider,pool,token0,token1,blockNumber){
 const pair=new ethers.Contract(pool,POOL_ABI,provider);
 try{
  const [a,b,res]=await Promise.all([pair.token0({blockTag:blockNumber}),pair.token1({blockTag:blockNumber}),pair.getReserves({blockTag:blockNumber})]);
  if(a.toLowerCase()!==token0.toLowerCase()||b.toLowerCase()!==token1.toLowerCase())
   return {verified:false,reason:'TOKEN_ORDER_MISMATCH',pool};
  return {verified:true,pool,reserve0Raw:res[0].toString(),reserve1Raw:res[1].toString(),
   lastReserveTimestamp:Number(res[2]),nonzeroReserves:res[0]>0n&&res[1]>0n};
 }catch(e){return {verified:false,pool,reason:'RESERVE_READ_FAILED',details:String(e.shortMessage||e.message).slice(0,140)}}
}
async function investigate({provider,verifiedPairResult,balancerVerifier=verifyBalancer,reserveReader=readPairReserves}={}){
 if(!provider)throw Error('ETHEREUM_PROVIDER_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const pair=verifiedPairResult||await verifyObserved({provider});
 const base={build:'BALANCER_RESEARCH_V16',mode:'ETHEREUM_BALANCER_AND_VERIFIED_PAIR_RESERVE_PREFLIGHT',
  network:'ethereum-mainnet',source:'FLASHBOTS_BALANCER_FLASH_LOAN_AND_ARB_BOT_TUTORIAL',
  observedPool:OBSERVED_POOL,crossVenuePairVerified:pair.verifiedCrossVenuePair===true,
  reserveReadsVerified:false,balancerVaultReadsVerified:false,balancerFlashLoanExecuted:false,
  confirmedSnapshotOnly:true,pendingTargetStateReconstructed:false,atomicBackrunSimulated:false,
  executableQuotes:0,profitVerified:false,executionEligible:false,mainnetBroadcast:false};
 if(!pair.verifiedCrossVenuePair||!pair.token0||!pair.token1||!pair.alternativePool)
  return {...base,status:'BLOCKED_UNVERIFIED_PAIR',reason:'V15_PAIR_VERIFICATION_REQUIRED'};
 const block=await provider.getBlock('latest');
 if(!block?.hash)throw Error('CONFIRMED_BLOCK_UNAVAILABLE');
 const [origin,alternative]=await Promise.all([
  reserveReader(provider,pair.observedPool,pair.token0,pair.token1,block.number),
  reserveReader(provider,pair.alternativePool,pair.token0,pair.token1,block.number)
 ]);
 let vault={verified:false,reason:'NOT_CHECKED'};
 try{
  const data=await balancerVerifier({provider,vaultAddress:VAULT,tokenAddress:pair.token0,expectedChainId:1});
  vault={verified:data.vaultReadMethodsVerified===true,blockNumber:data.blockNumber,blockHash:data.blockHash,
   token:data.token,feePercentageRaw:data.flashLoanFeePercentageRaw,
   feeDenominator:data.feeDenominator,loanExecuted:false,
   disclaimer:'READ_METHODS_AND_BALANCE_NOT_FLASH_LOAN_EXECUTION_PROOF'};
 }catch(e){vault={verified:false,reason:String(e.shortMessage||e.message||e).slice(0,160)}}
 return {...base,status:origin.verified&&alternative.verified&&vault.verified?'READ_ONLY_PREFLIGHT_COMPLETED':'READ_ONLY_PREFLIGHT_INCOMPLETE',
  blockNumber:block.number,blockHash:block.hash,token0:pair.token0,token1:pair.token1,
  originVenue:pair.originVenue,alternativeVenue:pair.alternativeVenue,
  originReserves:origin,alternativeReserves:alternative,balancerVault:VAULT,balancer:vault,
  reserveReadsVerified:origin.verified&&alternative.verified,
  balancerVaultReadsVerified:vault.verified,
  liquidityReadOnly:origin.nonzeroReserves===true&&alternative.nonzeroReserves===true,
  limitations:['RESERVE_STATE_CONFIRMED_ONLY_NOT_AFTER_PENDING_USER_SWAP',
   'BALANCER_VAULT_BALANCE_NOT_GUARANTEED_FLASH_LOAN',
   'VAULT_READ_MAY_BE_AT_DIFFERENT_LATEST_BLOCK',
   'NO_ATOMIC_BACKRUN_OR_PROFIT_SIMULATION','NO_BUNDLE_SUBMISSION']};
}
module.exports={VAULT,readPairReserves,investigate};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL){console.error('V16_FAILED ETHEREUM_RPC_URL_REQUIRED');process.exitCode=1}
 else{const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  investigate({provider}).then(x=>console.log(JSON.stringify(x)))
   .catch(e=>{console.error('V16_FAILED',String(e.message).slice(0,220));process.exitCode=1})
   .finally(()=>provider.destroy())}
}
