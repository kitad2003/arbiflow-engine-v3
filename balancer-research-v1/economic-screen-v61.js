'use strict';
// V61: read-only current-block economic screening; NOT a backrun or execution simulation.
const {ethers}=require('ethers');
const seed=require('./historical-pair-seed-v60.json');
const {merge}=require('./persistent-pair-revalidation-v60');
const {run:liveRun}=require('./live-priority-pairs-v59');
const {evaluate}=require('./liquidity-quotes-v55');
const ERC20=['function decimals() view returns (uint8)','function symbol() view returns (string)'];
function rateBps(row){
 const input=BigInt(row.sizeRaw),output=BigInt(row.returnedRaw);
 if(input<=0n)return null;
 return ((output-input)*10000n/input).toString();
}
function screen(rows,{minSpreadBpsExclusive=50n}={}){
 return rows.map(row=>{
  const grossBps=rateBps(row);
  const gross=BigInt(row.grossDeltaRaw);
  const passesGrossSpread=grossBps!==null&&BigInt(grossBps)>minSpreadBpsExclusive;
  return {...row,grossReturnBps:grossBps,passesGrossSpread,
   positiveGross:gross>0n,
   gasCostVerified:false,flashLoanFeeVerified:false,builderBidVerified:false,
   postTargetStateVerified:false,netProfitVerified:false,executionEligible:false,
   rejectionReasons:[...(!passesGrossSpread?['GROSS_RETURN_NOT_ABOVE_0_5_PERCENT']:[]),
    'GAS_COST_NOT_QUOTED','FLASH_LOAN_FEE_NOT_VERIFIED','BUILDER_BID_NOT_VERIFIED',
    'TARGET_FIRST_STATE_NOT_SIMULATED']};
 });
}
async function tokenMetadata(provider,token,blockTag){
 try{
  const contract=new ethers.Contract(token,ERC20,provider);
  const decimals=Number(await contract.decimals({blockTag}));
  if(!Number.isInteger(decimals)||decimals<0||decimals>255)throw Error('INVALID_DECIMALS');
  let symbol=null;
  try{symbol=String(await contract.symbol({blockTag})).slice(0,40)}catch{}
  return {address:token,decimals,symbol,verified:true};
 }catch(e){return {address:token,decimals:null,symbol:null,verified:false,reason:'TOKEN_DECIMALS_UNAVAILABLE'} }
}
async function run({provider,liveImpl=liveRun,evaluateImpl=evaluate,metadataImpl=tokenMetadata,seedPairs=seed.pairs,runtimeMs=60000,maxPairs=20}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const live=await liveImpl({provider,runtimeMs});
 const pairs=merge(seedPairs,live.uniqueCrossVenuePairs||[]);
 const result={build:'BALANCER_RESEARCH_V61',mode:'READ_ONLY_GROSS_ECONOMIC_SCREENING',
  historicalSeedPairs:seedPairs.length,liveUniquePairs:live.uniqueCrossVenuePairCount||0,
  candidatePairs:pairs.length,checkedPairs:0,verifiedPairs:0,failedPairs:0,
  scenarios:0,positiveGrossScenarios:0,grossSpreadAboveHalfPercent:0,
  results:[],netProfitVerified:false,executionEligible:false,
  targetFirstSimulationAttempted:false,bundlesSubmitted:0,mainnetBroadcast:false};
 for(const p of pairs.slice(0,maxPairs)){
  result.checkedPairs++;
  try{
   const q=await evaluateImpl(provider,p.poolA,p.poolB);
   const [t0,t1]=await Promise.all([metadataImpl(provider,q.token0,q.blockNumber),metadataImpl(provider,q.token1,q.blockNumber)]);
   const rows=screen(q.quotes);
   result.verifiedPairs++;result.scenarios+=rows.length;
   result.positiveGrossScenarios+=rows.filter(r=>r.positiveGross).length;
   result.grossSpreadAboveHalfPercent+=rows.filter(r=>r.passesGrossSpread).length;
   const winners=rows.filter(r=>r.positiveGross).sort((a,b)=>BigInt(a.grossDeltaRaw)>BigInt(b.grossDeltaRaw)?-1:BigInt(a.grossDeltaRaw)<BigInt(b.grossDeltaRaw)?1:0);
   const best=winners[0]||null;
   const decimals=best?(best.inputToken.toLowerCase()===t0.address.toLowerCase()?t0.decimals:t1.decimals):null;
   result.results.push({status:'CONFIRMED_BLOCK_GROSS_SCREEN_ONLY',poolA:p.poolA,poolB:p.poolB,sources:p.sources,
    blockNumber:q.blockNumber,blockHash:q.blockHash||null,tokens:[t0,t1],
    reserveA:q.reserves.poolA,reserveB:q.reserves.poolB,scenarios:rows.length,
    positiveGrossCount:winners.length,grossSpreadAboveHalfPercent:rows.filter(r=>r.passesGrossSpread).length,
    bestGross:best?{...best,grossDeltaFormatted:decimals===null?null:ethers.formatUnits(best.grossDeltaRaw,decimals)}:null,
    tokenDecimalsAllVerified:t0.verified&&t1.verified,netProfitVerified:false,executionEligible:false});
  }catch(e){result.failedPairs++;result.results.push({status:'REVALIDATION_FAILED',poolA:p.poolA,poolB:p.poolB,reason:String(e.message||e).slice(0,140)})}
 }
 result.uncheckedBeyondLimit=Math.max(0,pairs.length-maxPairs);
 result.limitations=['0_5_PERCENT_TEST_IS_GROSS_RETURN_ON_INPUT_NOT_INSTANTANEOUS_PRICE_SPREAD',
  'NO_GAS_OR_FLASH_LOAN_FEE_OR_BUILDER_BID_COST_MODEL_VERIFIED',
  'NO_TOKEN_TRANSFER_TAX_OR_NONSTANDARD_TOKEN_BEHAVIOR_VERIFIED',
  'CONFIRMED_BLOCK_RESERVES_ARE_NOT_POST_TARGET_STATE',
  'NO_NET_PROFIT_OR_EXECUTION_ELIGIBILITY_CLAIM'];
 return result;
}
module.exports={rateBps,screen,tokenMetadata,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('V61_FAILED',String(e.message).slice(0,180));process.exitCode=1}).finally(()=>provider.destroy());
}
