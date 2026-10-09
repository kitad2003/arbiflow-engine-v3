'use strict';
// 12.9.30 fork-only atomic settlement readiness + full-path execution gas.
// A successful settlement is reported ONLY if a real fork transaction succeeds
// with Aave repayment and real DEX swaps, with no prefunding or fake profits.
const assert=require('node:assert/strict');
const hre=require('hardhat');
const {run}=require('./LargeLoanQuotes12927');
const {rank}=require('./LoanOptimizer12928');
function decoded(err,ex){const data=err?.data||err?.error?.data||err?.info?.error?.data;if(typeof data==='string')try{return ex.interface.parseError(data)}catch{}return null;}
async function main(){
 assert.equal(hre.network.name,'hardhat','HARDHAT_FORK_ONLY');
 assert(/^https:\/\//.test(process.env.BASE_RPC_URL||''),'BASE_RPC_URL_REQUIRED');
 const e=hre.ethers;assert.equal((await e.provider.getNetwork()).chainId,8453n);
 const quotes=await run(process.env.BASE_RPC_URL,[1000,5000,10000,25000,50000]);
 const candidates=rank(quotes.rows).ranked.filter(r=>r.rankable&&r.observedLiquidityCoversPrincipal).slice(0,3);
 assert(candidates.length>0,'NO_QUOTED_CANDIDATES');
 await hre.network.provider.send('evm_mine');
 const [signer]=await e.getSigners(),F=await e.getContractFactory('AaveDexAtomicFork12913');
 const ex=await F.deploy();await ex.waitForDeployment();
 const usdc=new e.Contract('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',['function balanceOf(address) view returns(uint256)'],e.provider);
 const reports=[];
 for(const item of candidates){
  const amount=BigInt(item.loanUsdc)*1000000n;
  const plan={amount,minWeth:1n,minUsdc:1n,minProfit:1n,deadline:BigInt((await e.provider.getBlock('latest')).timestamp+3600),uniFirst:item.direction==='UNI_TO_AERO',probeAfterSwaps:true};
  const row={loanUsdc:item.loanUsdc,direction:item.direction,bothSwapsReached:false,forkSettlementSucceeded:false,fullAtomicReceiptGasUsed:null,preGasQuotedReturnRaw:item.preGasAfterAavePremiumUsdcRaw,actualReturnRaw:null,netProfitVerified:false,qualified:false,alerts:[],blockedReasons:[]};
  let outputs;
  try{await ex.start.staticCall(plan,{gasLimit:10000000});}
  catch(err){const d=decoded(err,ex);if(d?.name==='BothSwapsReached'){row.bothSwapsReached=true;outputs={wethRaw:d.args[0].toString(),usdcRaw:d.args[1].toString()};}}
  if(!outputs){row.blockedReasons.push('BOTH_REAL_SWAPS_NOT_REACHED');reports.push(row);continue;}
  row.actualReturnRaw=outputs.usdcRaw;
  const normal={...plan,probeAfterSwaps:false};
  let allowed=false,revertReason=null;
  try{await ex.start.staticCall(normal,{gasLimit:10000000});allowed=true;}
  catch(err){revertReason=decoded(err,ex)?.name||String(err?.shortMessage||err?.message||err).slice(0,120);}
  row.normalPathStaticCallSuccess=allowed;row.revertReason=revertReason;
  if(allowed){
   const before=await usdc.balanceOf(await ex.getAddress());
   try{
    const receipt=await(await ex.start(normal,{gasLimit:10000000})).wait();
    if(receipt.status===1){const after=await usdc.balanceOf(await ex.getAddress());row.forkSettlementSucceeded=true;row.fullAtomicReceiptGasUsed=receipt.gasUsed.toString();row.contractBalanceDeltaRaw=(after-before).toString();}
   }catch(err){row.blockedReasons.push('MINED_SETTLEMENT_FAILED');row.settlementError=String(err?.shortMessage||err?.message||err).slice(0,130);}
  }else{
   row.blockedReasons.push('ATOMIC_SETTLEMENT_REJECTED_'+(revertReason||'UNKNOWN'));
   // An unsuccessful path has no successful receipt. A trace is only diagnostic.
   try{
    const data=ex.interface.encodeFunctionData('start',[normal]);
    const trace=await hre.network.provider.send('debug_traceCall',[{from:signer.address,to:await ex.getAddress(),data,gas:'0x989680'},'latest',{}]);
    if(trace&&typeof trace.gas==='number'&&trace.gas>0)row.revertedExecutionTraceGas=String(trace.gas);
   }catch(err){row.traceAvailable=false;}
  }
  row.blockedReasons.push('BASE_L1_FEE_USDC_NOT_VERIFIED','FULL_NET_PROFIT_NOT_VERIFIED','INDEPENDENT_RISK_ASSESSMENT_PENDING');
  reports.push(row);
 }
 assert(reports.every(r=>r.qualified===false&&r.alerts.length===0),'UNVERIFIED_DASHBOARD_ALERT');
 console.log(JSON.stringify({success:true,build:'12.9.30',mode:'FORK_ONLY_ATOMIC_SETTLEMENT_AND_GAS_DIAGNOSTIC',rankedCandidatesTested:reports.length,rows:reports,successfulForkSettlements:reports.filter(r=>r.forkSettlementSucceeded).length,netProfitVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(err=>{console.error('ATOMIC_SETTLEMENT_GAS_FAILED',String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,300));process.exitCode=1});
