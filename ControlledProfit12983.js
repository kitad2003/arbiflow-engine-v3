'use strict';
// Controlled POSITIVE and NEGATIVE opportunity experiments.
// Deterministic constant-product pool math; atomic ledger simulation, NOT EVM execution.
// No RPC, real funds, fabricated historical P&L, or mainnet broadcasts.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const UNIT=1000000n;
function pool(usdc,eth,feeBps=30n){
 return {usdc:BigInt(usdc)*UNIT,eth:BigInt(eth)*10n**18n,feeBps:BigInt(feeBps)};
}
function quote(amountIn,reserveIn,reserveOut,feeBps){
 if(amountIn<=0n||reserveIn<=0n||reserveOut<=0n||feeBps<0n||feeBps>=10000n)return 0n;
 const after=amountIn*(10000n-feeBps);
 return after*reserveOut/(reserveIn*10000n+after);
}
function trade(usd,pA,pB,{loanFeeBps=5n,gasUsdc=8n*UNIT}={}){
 const n=BigInt(usd)*UNIT;
 const eth=quote(n,pA.usdc,pA.eth,pA.feeBps);
 const back=quote(eth,pB.eth,pB.usdc,pB.feeBps);
 const funding=(n*BigInt(loanFeeBps)+9999n)/10000n;
 const gas=BigInt(gasUsdc);
 return {inputUsdcRaw:n,ethBoughtRaw:eth,usdcReturnedRaw:back,
   loanFeeUsdcRaw:funding,gasUsdcRaw:gas,netUsdcRaw:back-n-funding-gas};
}
function optimize(a,b,params,maxUsd=10000){
 let best=null;for(let size=1;size<=maxUsd;size++){
  const t=trade(size,a,b,params);
  if(!best||t.netUsdcRaw>best.netUsdcRaw)best={sizeUsd:size,...t};
 }return best;
}
function settleAtomically(amount,a,b,params){
 const A={...a},B={...b};
 const input=BigInt(amount)*UNIT;
 const borrowed=input;
 const eth=quote(input,A.usdc,A.eth,A.feeBps);
 if(eth===0n) return {executed:false,reason:'ZERO_OUTPUT'};
 A.usdc+=input;A.eth-=eth;
 const back=quote(eth,B.eth,B.usdc,B.feeBps);
 if(back===0n)return {executed:false,reason:'ZERO_RETURN'};
 B.eth+=eth;B.usdc-=back;
 const fee=(borrowed*BigInt(params.loanFeeBps)+9999n)/10000n;
 const repayment=borrowed+fee,gas=BigInt(params.gasUsdc);
 if(back<=repayment+gas)return {executed:false,reason:'NET_PROFIT_GATE_REVERT',netUsdcRaw:(back-repayment-gas).toString()};
 // Success commits simulated reserves only. No wallet / chain access.
 return {executed:true,netUsdcRaw:(back-repayment-gas).toString(),
    flashBorrowedUsdcRaw:borrowed.toString(),flashRepaidUsdcRaw:repayment.toString(),
    gasReserveUsdcRaw:gas.toString(),poolAAfter:{usdc:A.usdc.toString(),eth:A.eth.toString()},
    poolBAfter:{usdc:B.usdc.toString(),eth:B.eth.toString()}};
}
function run(){
 const parameters={loanFeeBps:5n,gasUsdc:8n*UNIT};
 const cheap=pool(200000,100),expensive=pool(210000,100);
 const best=optimize(cheap,expensive,parameters);
 const fixed500=trade(500,cheap,expensive,parameters);
 const settlement=settleAtomically(best.sizeUsd,cheap,expensive,parameters);
 assert(best.netUsdcRaw>0n,'positive control not profitable');
 assert(best.netUsdcRaw>=fixed500.netUsdcRaw,'optimizer worse than fixed size');
 assert(settlement.executed,'simulated atomic settlement failed');
 assert.equal(settlement.netUsdcRaw,best.netUsdcRaw.toString());
 const neutralA=pool(200000,100),neutralB=pool(200000,100);
 const negative=optimize(neutralA,neutralB,parameters);
 const negativeSettlement=settleAtomically(negative.sizeUsd,neutralA,neutralB,parameters);
 assert(negative.netUsdcRaw<0n,'negative control incorrectly profitable');
 assert.equal(negativeSettlement.executed,false,'negative control allowed settlement');
 // If the buy-side pool becomes expensive, this direction must not pass.
 const reversed=optimize(expensive,cheap,parameters);
 assert(reversed.netUsdcRaw<0n,'reversed control incorrectly profitable');
 function brief(x){return {sizeUsd:x.sizeUsd,netUsdcRaw:x.netUsdcRaw.toString(),netUsdc: Number(x.netUsdcRaw)/1e6,
   loanFeeUsdc:Number(x.loanFeeUsdcRaw)/1e6,gasUsdc:Number(x.gasUsdcRaw)/1e6};}
 const report={build:'12.9.83',mode:'CONTROLLED_CONSTANT_PRODUCT_FLASH_FUNDED_SIMULATION',
   verdict:'PASS',checksPassed:7,scenarios:{
    deliberateDislocation:{description:'Pool A: 100 ETH/200000 USDC; Pool B: 100 ETH/210000 USDC',best:brief(best),fixed500:brief({sizeUsd:500,...fixed500}),atomicLedgerSettlement:settlement},
    balancedMarkets:{best:brief(negative),rejected:!negativeSettlement.executed},
    wrongDirection:{best:brief(reversed),rejected:reversed.netUsdcRaw<0n}},
   assumptions:{constantProduct:true,feeBps:30,loanFeeBps:0.05,gasUsdc:8,
    amounts:'USDC has 6 decimals; ETH has 18 decimals',
    optimizedSize:'integer dollar grid 1 to 10000 USDC',
    ordering:'two swaps executed on cloned pool reserves; no competing transactions'},
   limitations:['This tests independent reference math, not the deployed ArbiFlow scanner','Not a Hardhat/EVM execution, real DEX pool, current quote, or flash-loan callback','No proof of profitable live opportunity','Must port assertions into the actual scanner and perform EVM atomic fork tests'],
   funding:'simulated same-asset USDC loan and repayment',readOnly:true,mainnetBroadcast:false,
   executionEligible:false,fundsMovedOnMainnet:false};
 fs.writeFileSync('arbiflow-controlled-profit-12983.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,scenarios:{deliberateDislocation:{best:report.scenarios.deliberateDislocation.best,simulatedAtomicSettlementPassed:settlement.executed},balancedMarkets:report.scenarios.balancedMarkets,wrongDirection:report.scenarios.wrongDirection}}));
 return report;
}
if(require.main===module){try{run()}catch(e){console.error('CONTROLLED_PROFIT_TEST_FAILED',e);process.exitCode=1}}
module.exports={pool,quote,trade,optimize,settleAtomically,run};
