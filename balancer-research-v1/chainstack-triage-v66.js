'use strict';
// V66 Chainstack research: V62 full token discovery + V64 conservative triage.
// Read-only; costs unavailable remain unverified, not guessed.
const {ethers}=require('ethers');
const {run}=require('./expanded-discovery-v62');
const {evaluate}=require('./liquidity-quotes-v55');
const {triage}=require('./economic-triage-v64');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const isThrottle=e=>/429|compute units per second|too many requests|rate.limit|throttl/i.test(String(e?.message||e));
function pacedEvaluate(fn=evaluate,{delayMs=1500,retries=3,waitImpl=wait}={}){
 let previous=Promise.resolve();
 return (provider,a,b)=>{
  const task=previous.catch(()=>{}).then(async()=>{
   await waitImpl(delayMs);
   for(let n=0;;n++)try{return await fn(provider,a,b)}catch(e){
    if(!isThrottle(e)||n>=retries)throw e;
    await waitImpl(Math.min(20000,2000*2**n));
   }
  });
  previous=task.then(()=>{},()=>{});
  return task;
 };
}
async function research({provider,runImpl=run,evaluateImpl=evaluate,triageImpl=triage,paceOptions={}}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 const triageByPair=new Map();
 const wrapped=pacedEvaluate(async(p,a,b)=>{
  const q=await evaluateImpl(p,a,b);
  const rows=q.quotes.map(quote=>triageImpl(quote,{token0:q.token0,token1:q.token1,reserves:q.reserves}));
  triageByPair.set(a.toLowerCase()+'|'+b.toLowerCase(),rows);
  return q;
 },paceOptions);
 const result=await runImpl({provider,evaluateImpl:wrapped});
 let grossScreened=0,heuristicReserveBlocked=0,heuristicSizeBlocked=0,missingGas=0,missingLoanFee=0,missingBuilderBid=0,nonWethInput=0;
 for(const item of result.results){
  if(item.status!=='VERIFIED_GROSS_ONLY')continue;
  const rows=triageByPair.get(item.poolA.toLowerCase()+'|'+item.poolB.toLowerCase())||[];
  const positive=rows.filter(x=>BigInt(x.grossDeltaRaw)>0n);
  grossScreened+=rows.length;
  heuristicReserveBlocked+=rows.filter(x=>x.rejectionReasons.includes('WETH_LIQUIDITY_BELOW_1_ETH_PER_POOL')).length;
  heuristicSizeBlocked+=rows.filter(x=>x.rejectionReasons.includes('WETH_INPUT_BELOW_0_01')).length;
  missingGas+=rows.filter(x=>x.rejectionReasons.includes('GAS_UNVERIFIED')).length;
  missingLoanFee+=rows.filter(x=>x.rejectionReasons.includes('BALANCER_FLASH_LOAN_FEE_UNVERIFIED')).length;
  missingBuilderBid+=rows.filter(x=>x.rejectionReasons.includes('BUILDER_BID_UNVERIFIED')).length;
  nonWethInput+=rows.filter(x=>x.rejectionReasons.includes('INPUT_NOT_WETH_REQUIRE_VERIFIED_PRICE_CONVERSION')).length;
  item.v64Triage={scenarios:rows.length,positiveGross:positive.length,aboveHalfPercent:rows.filter(x=>BigInt(x.grossReturnBps||'0')>50n).length,heuristicReserveBlocked:rows.filter(x=>x.rejectionReasons.includes('WETH_LIQUIDITY_BELOW_1_ETH_PER_POOL')).length,heuristicSizeBlocked:rows.filter(x=>x.rejectionReasons.includes('WETH_INPUT_BELOW_0_01')).length,netProfitVerified:false,executionEligible:false};
 }
 result.build='BALANCER_RESEARCH_V66_CHAINSTACK_V64_TRIAGE';
 result.v64Triage={grossScreened,heuristicReserveBlocked,heuristicSizeBlocked,missingGas,missingLoanFee,missingBuilderBid,nonWethInput,heuristicThresholdsNotProofOfUnprofitability:true};
 result.failureBreakdown={rpcThrottled:result.results.filter(x=>x.status==='REVALIDATION_FAILED'&&isThrottle(x.reason)).length,poolIdentity:result.results.filter(x=>x.reason==='POOL_IDENTITY_NOT_VERIFIED').length,other:result.results.filter(x=>x.status==='REVALIDATION_FAILED'&&!isThrottle(x.reason)&&x.reason!=='POOL_IDENTITY_NOT_VERIFIED').length};
 result.qualified=0;result.alerts=[];result.netProfitVerified=false;result.executionEligible=false;result.mainnetBroadcast=false;
 result.limitations=[...(result.limitations||[]),'V64_HEURISTIC_TRIAGE_ONLY_NO_VERIFIED_NET','V2_ONLY_NOT_BALANCER_VAULT_QUOTES'];
 return result;
}
module.exports={isThrottle,pacedEvaluate,research};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 research({provider}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('BALANCER_V66_FAILED',String(e.message).slice(0,180));process.exitCode=1}).finally(()=>provider.destroy());
}
