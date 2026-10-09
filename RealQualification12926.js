'use strict';
// 12.9.26 independent real, pinned-block cross-DEX quotes and Aave fee screen.
// Quotes are indicative. No mainnet swaps or borrowed funds; no live alerts.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {scan}=require('./phase127-routes');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
function screen(scanResult,loan,feeBps){
 const principal=BigInt(loan)*1000000n,fee=(principal*BigInt(feeBps)+9999n)/10000n;
 return (scanResult.routes||[]).map(r=>{
  const good=r.quoteSuccess===true&&/^[0-9]+$/.test(String(r.returnUsdcRaw??''));
  const returned=good?BigInt(r.returnUsdcRaw):null;
  const gross=good?returned-principal:null;
  const after=good?gross-fee:null;
  const spreadPass=good&&gross*10000n>principal*50n;
  const issues=[];
  if(!good)issues.push('TWO_LEG_QUOTES_UNAVAILABLE');
  if(good&&!spreadPass)issues.push('SPREAD_NOT_ABOVE_0_5_PERCENT');
  if(good&&after<=0n)issues.push('AAVE_PREMIUM_EXCEEDS_GROSS_RETURN');
  issues.push('NO_ATOMIC_SETTLEMENT_RECEIPT','FULL_GAS_AND_L1_USDC_COST_UNVERIFIED','SLIPPAGE_AND_MEV_UNVERIFIED','RISK_NOT_INDEPENDENTLY_ASSESSED');
  return {loanUsdc:loan,route:r.buyDex+' -> '+r.sellDex,buyTier:r.buyTier,sellTier:r.sellTier,blockTag:scanResult.blockTag,quoteSuccess:good,returnedUsdcRaw:returned?.toString()??null,grossUsdcRaw:gross?.toString()??null,aavePremiumRaw:fee.toString(),afterPremiumBeforeGasRaw:after?.toString()??null,spreadGreaterThanHalfPercent:spreadPass,qualified:false,alerts:[],blockedReasons:issues};
 });
}
async function probe({rpcUrl,amounts}){
 if(!/^https:\/\//.test(rpcUrl||''))throw Error('BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const lender=new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p);
  const fee=BigInt(await lender.FLASHLOAN_PREMIUM_TOTAL());
  assert(fee<10000n,'INVALID_AAVE_FEE');
  const rows=[],diagnostics=[];
  for(const amount of amounts){
   const result=await scan({chainId:8453},(_chain,method,params)=>p.send(method,params),amount);
   rows.push(...screen(result,amount,fee));
   diagnostics.push({amountUsdc:amount,blockTag:result.blockTag,diagnostic:result.diagnostic,verifiedPools:result.verifiedPools?.length||0,quoteFailures:result.failures?.length||0});
  }
  return {success:true,build:'12.9.26',mode:'REAL_BASE_DEX_QUOTE_AAVE_PREMIUM_SCREEN',aavePremiumBps:Number(fee),diagnostics,rows,loanPrincipalSource:'AAVE_V3_FLASH_LOAN',operatorFundsFor:'GAS_AND_OPERATING_ONLY',verifiedNetProfit:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy();}
}
module.exports={screen,probe};
if(require.main===module){
 const principal=1000*1000000;
 const stub={blockTag:'0x123',routes:[{buyDex:'UNI',sellDex:'AERO',buyTier:500,sellTier:100,quoteSuccess:true,returnUsdcRaw:String(principal+5000000)},{buyDex:'AERO',sellDex:'UNI',quoteSuccess:true,returnUsdcRaw:String(principal+5000001)}]};
 const tests=screen(stub,1000,5);
 assert.equal(tests.length,2);
 assert.equal(tests[0].spreadGreaterThanHalfPercent,false);
 assert.equal(tests[1].spreadGreaterThanHalfPercent,true);
 assert(tests.every(x=>x.qualified===false&&x.alerts.length===0));
 const missing=screen({routes:[{quoteSuccess:false}]},1000,5)[0];
 assert(missing.blockedReasons.includes('TWO_LEG_QUOTES_UNAVAILABLE'));
 console.log(JSON.stringify({success:true,build:'12.9.26',unitAssertionsPassed:5,realQuotesRun:false,alerts:[],qualified:0,readOnly:true,mainnetBroadcast:false}));
 if(process.env.BASE_RPC_URL){
  const sizes=(process.env.REAL_QUOTE_LOAN_SIZES_USDC||'1000').split(',').map(Number);
  assert(sizes.length>0&&sizes.length<=3&&sizes.every(x=>[100,500,1000].includes(x)),'SCANNER_SUPPORTS_ONLY_100_500_1000');
  probe({rpcUrl:process.env.BASE_RPC_URL,amounts:sizes}).then(x=>{console.log(JSON.stringify(x));if(!x.rows.some(r=>r.quoteSuccess))process.exitCode=1}).catch(e=>{console.error('REAL_QUALIFICATION_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,300));process.exitCode=1});
 }
}
