'use strict';
// Source: Flashbots Automated Arbitrage Bot, "Filtering Relevant Transactions".
// Ethereum Uniswap V2/Sushiswap factory-pair discovery. No old scanner code.
// A matching pair is discovery evidence, NOT a profitable/executable quote.
const {ethers}=require('ethers');
const {SWAP_TOPIC}=require('./bot');
const FACTORIES=Object.freeze({
 UNISWAP_V2:'0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
 SUSHISWAP_V2:'0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'
});
const PAIR_ABI=['function token0() view returns (address)','function token1() view returns (address)','function factory() view returns (address)'];
const FACTORY_ABI=['function getPair(address,address) view returns (address)'];
const ZERO=ethers.ZeroAddress;
function addr(x){return typeof x==='string'&&ethers.isAddress(x)&&x.toLowerCase()!==ZERO.toLowerCase()}
const lower=x=>x.toLowerCase();
async function identifyPair(provider,pool,blockTag){
 if(!addr(pool))return {verified:false,reason:'INVALID_PAIR_ADDRESS'};
 try{
  if((await provider.getCode(pool,blockTag))==='0x')return {verified:false,reason:'PAIR_CODE_ABSENT'};
  const pair=new ethers.Contract(pool,PAIR_ABI,provider);
  const [token0,token1,factory]=await Promise.all([
   pair.token0({blockTag}),pair.token1({blockTag}),pair.factory({blockTag})
  ]);
  if(!addr(token0)||!addr(token1)||!addr(factory)||lower(token0)===lower(token1))return {verified:false,reason:'INVALID_PAIR_IDENTITY'};
  const venue=Object.entries(FACTORIES).find(([,value])=>lower(factory)===lower(value))?.[0];
  if(!venue)return {verified:false,reason:'UNRECOGNIZED_FACTORY',pool,token0,token1,factory};
  // Factory getPair must confirm that the event's address is the registered pool.
  const registry=new ethers.Contract(factory,FACTORY_ABI,provider);
  const registered=await registry.getPair(token0,token1,{blockTag});
  if(lower(registered)!==lower(pool))return {verified:false,reason:'FACTORY_POOL_MISMATCH'};
  return {verified:true,pool,token0,token1,factory,venue,blockTag};
 }catch(e){return {verified:false,reason:'POOL_IDENTITY_RPC_ERROR',error:String(e.shortMessage||e.message||e).slice(0,140)}}
}
async function alternative(provider,identity,blockTag){
 if(!identity?.verified)return {found:false,reason:'TRIGGER_PAIR_UNVERIFIED'};
 const other=identity.venue==='UNISWAP_V2'?'SUSHISWAP_V2':'UNISWAP_V2';
 const factory=FACTORIES[other];
 try{
  const registry=new ethers.Contract(factory,FACTORY_ABI,provider);
  const pool=await registry.getPair(identity.token0,identity.token1,{blockTag});
  if(!addr(pool))return {found:false,reason:'ALTERNATIVE_PAIR_ABSENT',venue:other};
  const found=await identifyPair(provider,pool,blockTag);
  if(!found.verified||found.venue!==other)return {found:false,reason:'ALTERNATIVE_IDENTITY_FAILED',venue:other};
  return {found:true,...found};
 }catch(e){return {found:false,reason:'ALTERNATIVE_RPC_ERROR',error:String(e.shortMessage||e.message||e).slice(0,140)}}
}
async function discover(provider,log){
 if(!log||!addr(log.address)||String(log.topics?.[0]||'').toLowerCase()!==SWAP_TOPIC)
  return {recognized:false,reason:'NOT_UNISWAP_V2_SWAP_HINT',executionEligible:false};
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const block=await provider.getBlock('latest');
 if(!block||!block.hash)throw Error('CONFIRMED_BLOCK_UNAVAILABLE');
 const identity=await identifyPair(provider,log.address,block.number);
 const alt=await alternative(provider,identity,block.number);
 return {build:'BALANCER_RESEARCH_V12',mode:'ETHEREUM_V2_FACTORY_VERIFIED_PAIR_DISCOVERY',
  recognized:true,blockNumber:block.number,blockHash:block.hash,identity,alternative:alt,
  verifiedCrossVenuePair:identity.verified&&alt.found,
  executableQuotes:0,profitVerified:false,backrunStateVerified:false,
  alerts:[],executionEligible:false,mainnetBroadcast:false,
  limitations:['CONFIRMED_PAIR_METADATA_NOT_PENDING_TRANSACTION_STATE',
   'PAIR_EXISTS_NOT_LIQUIDITY_OR_QUOTE','NO_FLASH_LOAN_ON_ETHEREUM_VERIFIED',
   'NO_BACKRUN_SIMULATION_OR_BUNDLE_SUBMISSION']};
}
module.exports={FACTORIES,identifyPair,alternative,discover};
