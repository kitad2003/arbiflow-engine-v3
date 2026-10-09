'use strict';
// 12.9.28: rank observed pinned-block routes; never label pre-gas data net profit.
const assert=require('node:assert/strict');
const {run}=require('./LargeLoanQuotes12927');
function rank(rows){
 if(!Array.isArray(rows))throw Error('ROUTES_REQUIRED');
 const candidates=rows.map(row=>{
  const reasons=[...(row.blockedReasons||[])];
  let beforeGas=null,spread=null;
  if(row.quoted===true&&/^-?[0-9]+$/.test(String(row.afterPremiumBeforeGasRaw??''))&&/^[0-9]+$/.test(String(row.loanUsdc??''))&&row.loanUsdc>0){
   beforeGas=BigInt(row.afterPremiumBeforeGasRaw);
   spread=row.spreadGreaterThanHalfPercent===true;
  }else reasons.push('QUOTED_AMOUNT_UNVERIFIED');
  if(beforeGas!==null&&beforeGas<=0n)reasons.push('NONPOSITIVE_BEFORE_GAS');
  if(!spread)reasons.push('SPREAD_NOT_ABOVE_HALF_PERCENT');
  if(row.liquidityBalanceCoversPrincipal!==true)reasons.push('OBSERVED_LIQUIDITY_INSUFFICIENT');
  reasons.push('EXECUTION_GAS_L1_AND_SLIPPAGE_UNKNOWN','ATOMIC_SETTLEMENT_UNVERIFIED','RISK_CLASSIFICATION_UNVERIFIED');
  return {loanUsdc:row.loanUsdc,direction:row.direction,blockNumber:row.blockNumber,quoteSuccess:row.quoted===true,preGasAfterAavePremiumUsdcRaw:beforeGas?.toString()??null,spreadGreaterThanHalfPercent:spread===true,observedLiquidityCoversPrincipal:row.liquidityBalanceCoversPrincipal===true,rankable:beforeGas!==null,qualified:false,alerts:[],blockedReasons:[...new Set(reasons)]};
 });
 // Order for research ONLY. Missing quotes last, then better pre-gas return first.
 candidates.sort((a,b)=>{
  if(a.rankable!==b.rankable)return a.rankable?-1:1;
  if(a.rankable&&b.rankable){const d=BigInt(a.preGasAfterAavePremiumUsdcRaw)-BigInt(b.preGasAfterAavePremiumUsdcRaw);if(d!==0n)return d>0n?-1:1;}
  return Number(a.loanUsdc)-Number(b.loanUsdc)||String(a.direction).localeCompare(String(b.direction));
 });
 return {ranked:candidates,indicativeLeader:candidates.find(x=>x.rankable)||null,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
}
async function main(){
 const input=await run(process.env.BASE_RPC_URL);
 const ranking=rank(input.rows);
 console.log(JSON.stringify({success:true,build:'12.9.28',mode:'READ_ONLY_LOAN_SIZE_RELATIVE_RETURN_RANKING',blockNumber:input.blockNumber,quoteRows:input.rows.length,quotedRoutes:input.quotedRoutes,ranking,rankMeaning:'PRE_GAS_AFTER_AAVE_PREMIUM_ONLY_NOT_EXECUTABLE_PROFIT',qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false}));
 if(input.quotedRoutes===0)throw Error('NO_SUCCESSFUL_REAL_QUOTES');
}
if(require.main===module){
 const rows=[
  {loanUsdc:25000,direction:'UNI_TO_AERO',quoted:true,afterPremiumBeforeGasRaw:'1000000',spreadGreaterThanHalfPercent:false,liquidityBalanceCoversPrincipal:true},
  {loanUsdc:10000,direction:'AERO_TO_UNI',quoted:true,afterPremiumBeforeGasRaw:'2000000',spreadGreaterThanHalfPercent:true,liquidityBalanceCoversPrincipal:true},
  {loanUsdc:100000,direction:'UNI_TO_AERO',quoted:false}
 ];
 const test=rank(rows);
 assert.equal(test.ranked[0].loanUsdc,10000);
 assert.equal(test.ranked[2].rankable,false);
 assert(test.ranked.every(x=>!x.qualified&&x.alerts.length===0));
 console.log(JSON.stringify({success:true,build:'12.9.28',unitChecksPassed:3,realQuotesRun:false,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL)main().catch(e=>{console.error('LOAN_OPTIMIZER_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,260));process.exitCode=1});
}
module.exports={rank};
