'use strict';
// BALANCER RESEARCH V62. Strictly separate from Aave/GHO and standalone MultiDexDiscoveryV62.
// Research-only Ethereum Uniswap V2/Sushi V2 expansion; no false multi-DEX claims.
const {ethers}=require('ethers');
const {FACTORIES}=require('./verified-pairs-v12');
const {evaluate}=require('./liquidity-quotes-v55');
const {screen,tokenMetadata}=require('./economic-screen-v61');
const {run:liveRun}=require('./live-priority-pairs-v59');
const {merge}=require('./persistent-pair-revalidation-v60');
const seed=require('./historical-pair-seed-v60.json');
const FACTORY_ABI=['function getPair(address,address) view returns(address)'];
const TOKENS={
 WETH:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
 USDT:'0xdAC17F958D2ee523a2206206994597C13D831ec7',
 USDC:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
 DAI:'0x6B175474E89094C44Da98b954EedeAC495271d0F',
 WBTC:'0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
 SAND:'0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
 AMP:'0xfF20817765cB7f73d4bde2e66e067E58D11095C2',
 YFI:'0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
 TUSD:'0x0000000000085d4780B73119b644AE5ecd22b376',
 SUKU:'0x0763fdCCF1aE541A5961815C0872A8c5Bc6DE4d7',
 BAT:'0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
 SYN:'0x0f2D719407FdBeFF09D87557AbB7232601FD9F29',
 RFD:'0x955d5c14C8D4944dA1Ea7836bd44D54a8eC35Ba1'
};
function candidates(tokens=TOKENS){const entries=Object.entries(tokens),out=[];for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)out.push({names:[entries[i][0],entries[j][0]],tokens:[entries[i][1],entries[j][1]]});return out}
function pairKey(a,b){return [a.toLowerCase(),b.toLowerCase()].sort().join('|')}
async function discover(provider,{tokens=TOKENS,blockTag,maxCandidates=100}={}){
 const block=blockTag??await provider.getBlockNumber(),factories=Object.entries(FACTORIES).map(([name,address])=>({name,contract:new ethers.Contract(address,FACTORY_ABI,provider)}));
 const rows=[],errors=[];
 for(const c of candidates(tokens).slice(0,maxCandidates)){
  const found=[];
  for(const f of factories)try{
   const address=await f.contract.getPair(c.tokens[0],c.tokens[1],{blockTag:block});
   if(address!==ethers.ZeroAddress&&await provider.getCode(address,block)!=='0x')found.push({venue:f.name,address});
  }catch(e){errors.push({names:c.names,venue:f.name,reason:String(e.shortMessage||e.message).slice(0,90)})}
  rows.push({...c,found,verifiedAcrossTwoFactories:found.length===2});
 }
 return {block,tokenPairsChecked:rows.length,crossVenueCandidates:rows.filter(x=>x.verifiedAcrossTwoFactories),singleVenuePairs:rows.filter(x=>x.found.length===1).length,errors:errors.slice(0,25)};
}
async function run({provider,discoverImpl=discover,evaluateImpl=evaluate,liveImpl=liveRun,metadataImpl=tokenMetadata,monitorMs=15000,maxEvaluate=40}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const [discovery,live]=await Promise.all([discoverImpl(provider),liveImpl({provider,runtimeMs:monitorMs})]);
 const historical=seed.pairs;
 const newPairs=discovery.crossVenueCandidates.map(x=>({a:x.found[0].address,b:x.found[1].address,source:'V62_FACTORY_CROSS_VENUE'}));
 const combined=merge([...historical,...newPairs],live.uniqueCrossVenuePairs||[]);
 const result={build:'BALANCER_RESEARCH_V62',mode:'EXPANDED_V2_CROSS_VENUE_DISCOVERY_AND_GROSS_SCREEN',
  historicalPairs:historical.length,configuredTokens:Object.keys(TOKENS).length,configuredTokenPairCandidates:candidates().length,
  factoryPairsChecked:discovery.tokenPairsChecked,factoryCrossVenueCandidates:discovery.crossVenueCandidates.length,
  liveCrossVenueCandidates:live.uniqueCrossVenuePairCount||0,deduplicatedCandidates:combined.length,
  evaluated:0,verified:0,failed:0,positiveGrossScenarios:0,grossAboveHalfPercent:0,
  results:[],discoveryErrors:discovery.errors,qualified:0,alerts:[],netProfitVerified:false,
  executionEligible:false,bundlesSubmitted:0,mainnetBroadcast:false};
 for(const pair of combined.slice(0,maxEvaluate)){
  result.evaluated++;
  try{
   const q=await evaluateImpl(provider,pair.poolA,pair.poolB);
   const rows=screen(q.quotes);
   const [m0,m1]=await Promise.all([metadataImpl(provider,q.token0,q.blockNumber),metadataImpl(provider,q.token1,q.blockNumber)]);
   result.verified++;result.positiveGrossScenarios+=rows.filter(x=>x.positiveGross).length;
   result.grossAboveHalfPercent+=rows.filter(x=>x.passesGrossSpread).length;
   const positives=rows.filter(x=>x.positiveGross).sort((a,b)=>BigInt(a.grossDeltaRaw)>BigInt(b.grossDeltaRaw)?-1:BigInt(a.grossDeltaRaw)<BigInt(b.grossDeltaRaw)?1:0);
   result.results.push({status:'VERIFIED_GROSS_ONLY',poolA:pair.poolA,poolB:pair.poolB,sources:pair.sources,
    block:q.blockNumber,tokens:[m0,m1],scenarios:rows.length,positiveGross:positives.length,
    aboveHalfPercent:rows.filter(x=>x.passesGrossSpread).length,best:positives[0]||null,
    netProfitVerified:false,executionEligible:false});
  }catch(e){result.failed++;result.results.push({status:'REVALIDATION_FAILED',poolA:pair.poolA,poolB:pair.poolB,reason:String(e.message||e).slice(0,110)})}
 }
 result.uncheckedBeyondLimit=Math.max(0,combined.length-maxEvaluate);
 result.limitations=['V2_ONLY: V3 CURVE BALANCER VAULT ADAPTERS NOT YET IMPLEMENTED',
 'NO TOP_MOVERS_TOKEN_ADDRESSES_ACCEPTED WITHOUT ONCHAIN VALIDATION',
 'V2_SWAP_FEES ASSUMED 30 BPS PER LEG NOT INDEPENDENTLY VERIFIED',
 'GROSS_RETURN_IS_NOT_NET_PROFIT','NO_GAS_FLASH_LOAN_FEE_BUILDER_BID',
 'NO_POST_TARGET_ATOMIC_SIMULATION','NO_AAVE_GHO_OR_FLASH_MINT_INTEGRATION'];
 return result;
}
module.exports={TOKENS,candidates,pairKey,discover,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider:p}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('BALANCER_V62_FAILED',String(e.message).slice(0,160));process.exitCode=1}).finally(()=>p.destroy());
}
