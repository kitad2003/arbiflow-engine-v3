'use strict';
// V35: V34 pending transaction hints -> V12 factory verification -> V33
// confirmed-reserve gross prefilter. No pending-state, gas or profit certification.
const {ethers}=require('ethers');
const {run:monitor}=require('./persistent-monitor-v34');
const {discover}=require('./verified-pairs-v12');
const {quote}=require('./reserve-quotes-v33');
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
const ABI=['function getReserves() view returns(uint112,uint112,uint32)'];
const sizes=[10n**15n,10n**16n];
async function evaluate(event,{provider,discoverImpl=discover,reserveImpl}={}){
 const base={targetHash:event?.pendingHash||null,observedPools:event?.swapPools||[],
  state:'REJECTED',simulated:false,profitVerified:false,executionEligible:false};
 if(event?.kind!=='PENDING_TRANSACTION'||!event.pendingHash)return {...base,reason:'NOT_PENDING_TRANSACTION'};
 if(!event.swapPools?.length)return {...base,reason:'NO_SWAP_HINT'};
 if(!provider)return {...base,reason:'ETHEREUM_RPC_REQUIRED'};
 const read=reserveImpl||async(address,blockNumber)=>{
  const r=await new ethers.Contract(address,ABI,provider).getReserves({blockTag:blockNumber});
  return [BigInt(r[0]),BigInt(r[1])];
 };
 for(const pool of event.swapPools.slice(0,5)){
  let data;
  try{data=await discoverImpl(provider,{address:pool,topics:[require('./bot').SWAP_TOPIC]})}
  catch{continue}
  if(!data?.verifiedCrossVenuePair||!data.identity?.verified||!data.alternative?.found)continue;
  const i=data.identity,a=data.alternative;
  const token0=i.token0.toLowerCase(),token1=i.token1.toLowerCase();
  if(token0!==WETH.toLowerCase()&&token1!==WETH.toLowerCase())continue;
  let r0,r1;
  try{[r0,r1]=await Promise.all([read(i.pool,data.blockNumber),read(a.pool,data.blockNumber)])}
  catch{continue}
  const norm=r=>token0===WETH.toLowerCase()?{weth:r[0],other:r[1]}:{weth:r[1],other:r[0]};
  const x=norm(r0),y=norm(r1);
  const direction=(first,second,name)=>sizes.map(amount=>{
   const mid=quote(amount,first.weth,first.other);
   const returned=quote(mid,second.other,second.weth);
   return {direction:name,borrowWei:amount.toString(),returnWei:returned.toString(),
    grossWei:(returned-amount).toString(),grossPositive:returned>amount};
  });
  const checks=[...direction(x,y,'ORIGIN_TO_ALTERNATE'),...direction(y,x,'ALTERNATE_TO_ORIGIN')];
  const best=checks.reduce((p,c)=>BigInt(c.grossWei)>BigInt(p.grossWei)?c:p,checks[0]);
  const compatible=(token0===WETH.toLowerCase()?token1:token0)===MLN.toLowerCase();
  return {...base,state:'CONFIRMED_RESERVE_QUOTE_ONLY',pool,alternativePool:a.pool,
   verifiedBlock:data.blockNumber,token0:i.token0,token1:i.token1,
   v26TokenCompatible:compatible,allQuotes:checks,bestGrossQuote:best,
   candidateForTargetSimulation:compatible&&best.grossPositive,
   reason:!compatible?'V26_IMMUTABLE_TOKEN_INCOMPATIBLE':!best.grossPositive?'NONPOSITIVE_GROSS':'NEEDS_POST_TARGET_SIMULATION_AND_NET_PROFIT'};
 }
 return {...base,reason:'NO_VERIFIED_WETH_CROSS_VENUE_PAIR'};
}
async function run({provider,monitorImpl=monitor,evaluateImpl=evaluate,runtimeMs=240000}={}){
 const totals={build:'BALANCER_RESEARCH_V35',mode:'READ_ONLY_PENDING_HINT_FACTORY_GROSS_GATE',
  pendingSwapEvents:0,verifiedQuotes:0,grossPositive:0,simulationCandidates:0,
  rejected:0,recent:[],simulationAttempted:false,mainnetBroadcast:false,bundlesSubmitted:0,executionEligible:false};
 const processed=new Set();
 const monitorResult=await monitorImpl({runtimeMs,onEvent:async event=>{
  if(event.kind!=='PENDING_TRANSACTION'||!event.swapPools.length)return;
  totals.pendingSwapEvents++;
  if(processed.has(event.pendingHash))return;processed.add(event.pendingHash);
  const record=await evaluateImpl(event,{provider});
  if(record.state==='CONFIRMED_RESERVE_QUOTE_ONLY')totals.verifiedQuotes++;
  else totals.rejected++;
  if(record.bestGrossQuote?.grossPositive)totals.grossPositive++;
  if(record.candidateForTargetSimulation)totals.simulationCandidates++;
  if(totals.recent.length===8)totals.recent.shift();
  totals.recent.push({targetHash:record.targetHash,state:record.state,reason:record.reason,
   bestGrossWei:record.bestGrossQuote?.grossWei||null,v26TokenCompatible:record.v26TokenCompatible||false,
   candidateForTargetSimulation:record.candidateForTargetSimulation||false});
 }});
 return {...totals,monitor:monitorResult,
  limitations:['CONFIRMED_STATE_ONLY','PENDING_TARGET_NOT_APPLIED_TO_POOL_RESERVES',
   'GROSS_QUOTES_EXCLUDE_GAS_FLASH_LOAN_AND_BID','NO_SIMULATION_OR_MAINNET_EXECUTION']};
}
module.exports={evaluate,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider:p}).then(x=>console.log(JSON.stringify(x)))
  .catch(e=>{console.error('V35_FAILED',String(e.message).slice(0,180));process.exitCode=1})
  .finally(()=>p.destroy());
}
