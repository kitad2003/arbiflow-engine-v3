'use strict';
// 12.9.29 — fork-only ranked-route execution readiness.
// Testing real Aave + real DEX swap callback at selected loan size.
// A deliberate post-swaps revert PROVES path reached; normal path must fail closed
// when economics are negative. Does not prove profitable settlement or gas fees.
const hre=require('hardhat'),assert=require('node:assert/strict');
const {run}=require('./LargeLoanQuotes12927');
const {rank}=require('./LoanOptimizer12928');
function decode(err,contract){const d=err?.data||err?.error?.data||err?.info?.error?.data;if(typeof d==='string')try{return contract.interface.parseError(d)}catch{}return null;}
async function main(){
 assert.equal(hre.network.name,'hardhat','FORK_ONLY');
 assert(/^https:\/\//.test(process.env.BASE_RPC_URL||''),'PRIVATE_BASE_RPC_REQUIRED');
 const e=hre.ethers;assert.equal((await e.provider.getNetwork()).chainId,8453n);
 const sizes=(process.env.READINESS_LOAN_SIZES_USDC||'10000,25000,50000,100000,250000,500000,1000000').split(',').map(Number);
 assert(sizes.length>=1&&sizes.length<=7&&sizes.every(x=>[10000,25000,50000,100000,250000,500000,1000000].includes(x)));
 const live=await run(process.env.BASE_RPC_URL,sizes),ordering=rank(live.rows);
 const candidates=ordering.ranked.filter(x=>x.rankable&&x.observedLiquidityCoversPrincipal);
 assert(candidates.length>0,'NO_RANKABLE_LIQUIDITY_SUPPORTED_ROUTES');
 await hre.network.provider.send('evm_mine');
 const F=await e.getContractFactory('AaveDexAtomicFork12913'),ex=await F.deploy();await ex.waitForDeployment();
 const receiptRows=[];
 for(const item of candidates.slice(0,3)){
  const plan={amount:BigInt(item.loanUsdc)*1000000n,minWeth:1n,minUsdc:1n,minProfit:1n,deadline:BigInt((await e.provider.getBlock('latest')).timestamp+3600),uniFirst:item.direction==='UNI_TO_AERO',probeAfterSwaps:true};
  let probe=null;
  try{await ex.start.staticCall(plan,{gasLimit:10000000});}
  catch(err){const d=decode(err,ex);if(d?.name==='BothSwapsReached')probe={wethRaw:d.args[0].toString(),usdcReturnedRaw:d.args[1].toString()};}
  const result={loanUsdc:item.loanUsdc,direction:item.direction,rankedPreGasAfterAavePremiumRaw:item.preGasAfterAavePremiumUsdcRaw,realAaveBothSwapCallbackReached:!!probe,actualSwapOutputs:probe,normalPath:'NOT_TESTED',successfulAtomicSettlement:false,netProfitVerified:false,qualified:false,blockedReasons:['NO_VERIFIED_FULL_SETTLEMENT_GAS_L1','SLIPPAGE_AND_MEV_NOT_VERIFIED','RISK_NOT_VERIFIED'],alerts:[]};
  if(probe){
   try{await ex.start.staticCall({...plan,probeAfterSwaps:false},{gasLimit:10000000});result.normalPath='STATIC_CALL_COMPLETED_NOT_MINED_SETTLEMENT';}
   catch(err){result.normalPath=decode(err,ex)?.name||'OTHER_REVERT';}
  }else result.blockedReasons.push('ATOMIC_DUAL_SWAP_PATH_NOT_REACHED');
  receiptRows.push(result);
 }
 assert(receiptRows.every(x=>!x.qualified&&x.alerts.length===0),'LIVE_GATE_BYPASSED');
 console.log(JSON.stringify({success:true,build:'12.9.29',mode:'RANKED_BASE_FORK_EXECUTION_READINESS',pinnedQuoteBlock:live.blockNumber,realQuoteRows:live.rows.length,testedCandidates:receiptRows,fullSuccessfulAtomicSettlementVerified:false,completeNetProfitVerified:false,qualified:0,alerts:[],borrowedPrincipalProvider:'AAVE_V3',operatorCapitalUsedForPrincipal:false,readOnly:true,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(e=>{console.error('EXECUTION_READINESS_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,320));process.exitCode=1});
