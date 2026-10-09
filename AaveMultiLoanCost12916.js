'use strict';
// Build 12.9.16: multi-principal, real-pool, fork-only atomic cost diagnostics.
// No simulated gas value can qualify a live alert or prove settled execution.
const hre=require('hardhat'),assert=require('node:assert/strict');
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
function errText(x){return String(x?.shortMessage||x?.message||x).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,200);}
async function main(){
 assert.equal(hre.network.name,'hardhat','HARDHAT_FORK_ONLY');
 assert(/^https:\/\//.test(process.env.BASE_RPC_URL||''),'RPC_REQUIRED');
 const e=hre.ethers;assert.equal((await e.provider.getNetwork()).chainId,8453n);
 await hre.network.provider.send('evm_mine');
 const [signer]=await e.getSigners();
 const F=await e.getContractFactory('AaveDexAtomicFork12913');
 const ex=await F.deploy();await ex.waitForDeployment();
 const lender=new e.Contract(POOL,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],e.provider);
 const premiumBps=BigInt(await lender.FLASHLOAN_PREMIUM_TOTAL());
 assert(premiumBps>=0n&&premiumBps<10000n,'BAD_PREMIUM');
 const sizes=(process.env.FORK_LOAN_SIZES_USDC||'1000,10000,50000').split(',').map(s=>s.trim());
 assert(sizes.length>=2&&sizes.length<=6&&sizes.every(s=>/^[1-9][0-9]{0,8}$/.test(s)),'INVALID_LOAN_SIZES');
 const feeData=await e.provider.getFeeData();
 const gasPrice=feeData.gasPrice||null;
 const rows=[];
 for(const usdc of sizes)for(const uniFirst of [true,false]){
  const amount=BigInt(usdc)*1000000n,premium=(amount*premiumBps+9999n)/10000n;
  const plan={amount,minWeth:1n,minUsdc:1n,minProfit:1n,deadline:BigInt((await e.provider.getBlock('latest')).timestamp+3600),uniFirst,probeAfterSwaps:true};
  const direction=uniFirst?'UNI_TO_AERO':'AERO_TO_UNI';
  const row={loanUsdc:usdc,source:'AAVE_V3',direction,premiumRaw:premium.toString(),bothSwapsReached:false,usdcReturnedRaw:null,grossProfitRaw:null,afterPremiumRaw:null,spreadAboveHalfPercent:false,gasTraceUsed:null,gasCostWei:null,gasCostUsdc:null,netProfitVerified:false,qualified:false,executionEligible:false};
  const calldata=ex.interface.encodeFunctionData('start',[plan]);
  try{
   await ex.start.staticCall(plan,{gasLimit:10000000});
   row.error='UNEXPECTED_PROBE_DID_NOT_REVERT';
  }catch(err){
   const data=err?.data||err?.error?.data||err?.info?.error?.data;
   let decoded=null;
   if(typeof data==='string')try{decoded=ex.interface.parseError(data);}catch{}
   if(decoded?.name==='BothSwapsReached'){
    const out=BigInt(decoded.args[1]),gross=out-amount,after=gross-premium;
    row.bothSwapsReached=true;row.usdcReturnedRaw=out.toString();
    row.grossProfitRaw=gross.toString();row.afterPremiumRaw=after.toString();
    row.spreadAboveHalfPercent=gross*10000n>amount*50n;
    row.premiumCovered=after>0n;
   }else row.error='PROBE_FAILED: '+errText(err);
  }
  if(row.bothSwapsReached){
   // Hardhat trace reports computational gas for a deliberately reverted call.
   // It is NOT a mined settled transaction receipt and excludes complete L1 posting costs.
   try{
    const trace=await hre.network.provider.send('debug_traceCall',[{from:signer.address,to:await ex.getAddress(),data:calldata,gas:'0x989680'},'latest',{}]);
    if(trace && Number.isSafeInteger(Number(trace.gas)) && Number(trace.gas)>0){
     const units=BigInt(trace.gas);row.gasTraceUsed=units.toString();
     if(gasPrice)row.gasCostWei=(units*gasPrice).toString();
    }
   }catch(err){row.gasTraceWarning=errText(err);}
  }
  rows.push(row);
 }
 assert(rows.some(x=>x.bothSwapsReached),'NO_TWO_SWAP_FORK_PROBES_REACHED');
 console.log(JSON.stringify({success:true,build:'12.9.16',mode:'FORK_ONLY_MULTI_LOAN_COST_DIAGNOSTIC',premiumBps:Number(premiumBps),gasPriceWei:gasPrice?gasPrice.toString():null,rows,gasInterpretation:'DEBUG_TRACE_REVERTED_ATOMIC_PROBE_NOT_SUCCESSFUL_SETTLEMENT',l1PostingCostIncluded:false,realAtomicSettlementVerified:false,completeNetProfitVerified:false,qualified:0,alerts:[],operatorPrincipalRequired:false,operatorGasFundsRequired:true,readOnly:true,mainnetBroadcast:false,executionEligible:false}));
}
main().catch(err=>{console.error('MULTI_LOAN_COST_FAILED',errText(err));process.exitCode=1});
