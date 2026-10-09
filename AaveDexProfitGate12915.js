'use strict';
// 12.9.15 configurable Aave FLASH LOAN principal; user's capital is reserved for gas/operations.
const hre=require('hardhat'),assert=require('node:assert/strict');
const loanUsdc=process.env.FORK_FLASH_LOAN_USDC||'10000';
async function main(){
 assert.equal(hre.network.name,'hardhat','FORK_ONLY');
 assert(/^https:\/\//.test(process.env.BASE_RPC_URL||''),'BASE_RPC_REQUIRED');
 assert(/^[1-9][0-9]{0,8}$/.test(loanUsdc),'INVALID_LOAN_SIZE');
 const e=hre.ethers;assert.equal((await e.provider.getNetwork()).chainId,8453n);
 await hre.network.provider.send('evm_mine');
 const amount=BigInt(loanUsdc)*1000000n;
 const pool=new e.Contract('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],e.provider);
 const bps=BigInt(await pool.FLASHLOAN_PREMIUM_TOTAL());
 const premium=(amount*bps+9999n)/10000n;
 const F=await e.getContractFactory('AaveDexAtomicFork12913'),ex=await F.deploy();await ex.waitForDeployment();
 const rows=[];
 for(const uniFirst of [true,false]){
  const dir=uniFirst?'UNI_TO_AERO':'AERO_TO_UNI';
  const plan={amount,minWeth:1n,minUsdc:1n,minProfit:1n,deadline:BigInt((await e.provider.getBlock('latest')).timestamp+3600),uniFirst,probeAfterSwaps:true};
  let values=null;
  try{await ex.start.staticCall(plan,{gasLimit:7000000});}catch(err){
   const d=err?.data||err?.error?.data||err?.info?.error?.data;
   if(typeof d==='string')try{const parsed=ex.interface.parseError(d);if(parsed?.name==='BothSwapsReached')values=parsed.args;}catch{}
  }
  assert(values,dir+'_DID_NOT_REACH_BOTH_SWAPS');
  const returned=BigInt(values[1]),gross=returned-amount,afterPremium=gross-premium;
  const spreadOverHalfPercent=gross*10000n>amount*50n;
  // Unknown gas and MEV prevent profit qualification even with a positive pre-gas result.
  let normalRevert=null;
  try{await ex.start.staticCall({...plan,probeAfterSwaps:false},{gasLimit:7000000});}
  catch(err){
   const d=err?.data||err?.error?.data||err?.info?.error?.data;
   if(typeof d==='string')try{normalRevert=ex.interface.parseError(d)?.name||null;}catch{}
  }
  if(afterPremium<=0n)assert.equal(normalRevert,'Unprofitable',dir+'_WRONG_FAIL_CLOSED_REVERT');
  rows.push({direction:dir,loanPrincipalUsdc:loanUsdc,usdcReturnedRaw:returned.toString(),grossUsdcRaw:gross.toString(),aavePremiumUsdcRaw:premium.toString(),afterPremiumUsdcRaw:afterPremium.toString(),spreadGreaterThanHalfPercent:spreadOverHalfPercent,atomicNormalPathRevert:normalRevert,netProfitVerified:false,qualified:false});
 }
 console.log(JSON.stringify({success:true,build:'12.9.15',principalSource:'AAVE_V3_FLASH_LOAN',operatorFundsFor:'GAS_AND_OPERATING_COSTS_ONLY',aavePremiumBps:Number(bps),rows,fullAtomicGasMeasured:false,netProfitVerified:false,alerts:[],mainnetBroadcast:false,executionEligible:false}));
}
main().catch(err=>{console.error('ATOMIC_PROFIT_GATE_FAILED',String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,350));process.exitCode=1});
