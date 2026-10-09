'use strict';
// Phase 12.5: read-only USDC flash-loan route economics screening.
// Input figures are explicitly UNVERIFIED. This is not an executable price oracle.
const MICRO=1000000n;
const MAX=1000000000000000n*MICRO;
function amount(value,name) {
  if(typeof value!=='string'|| !/^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,6})?$/.test(value))throw Error(name+'_INVALID_USDC_AMOUNT');
  const [a,b='']=value.split('.');
  const n=BigInt(a)*MICRO+BigInt((b+'000000').slice(0,6));
  if(n>MAX)throw Error(name+'_OUT_OF_RANGE');
  return n;
}
function display(raw){const x=raw<0n?-raw:raw;return (raw<0n?'-':'')+(x/MICRO).toString()+'.'+(x%MICRO).toString().padStart(6,'0');}
function evaluate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_OBJECT_REQUIRED');
 const {loanUsdc,roundTripReturnUsdc,gasUsd,slippageReserveUsd,otherFeesUsd='0',premiumBps,risk}=input;
 if(!Number.isInteger(premiumBps)||premiumBps<0||premiumBps>10000)throw Error('INVALID_PREMIUM_BPS');
 if(!['LOW','MEDIUM','HIGH'].includes(risk))throw Error('INVALID_RISK');
 const loan=amount(loanUsdc,'LOAN'),returned=amount(roundTripReturnUsdc,'RETURN');
 const gas=amount(gasUsd,'GAS'),slippage=amount(slippageReserveUsd,'SLIPPAGE'),other=amount(otherFeesUsd,'OTHER_FEES');
 if(loan===0n)throw Error('LOAN_MUST_BE_POSITIVE');
 const premium=(loan*BigInt(premiumBps)+9999n)/10000n;
 const gross=returned-loan;
 const net=gross-premium-gas-slippage-other;
 const spreadBps=(gross*10000n)/loan;
 const thresholdPass=(gross*10000n>loan*50n); // strictly > 0.5%
 const riskPass=risk==='LOW'||risk==='MEDIUM';
 const economicallyPositive=net>0n;
 const pass=thresholdPass&&riskPass&&economicallyPositive;
 return {
  model:'UNVERIFIED_MANUAL_USDC_ROUND_TRIP_ECONOMICS',
  loanUsdc:display(loan),roundTripReturnUsdc:display(returned),
  grossUsd:display(gross),premiumUsd:display(premium),
  gasUsd:display(gas),slippageReserveUsd:display(slippage),otherFeesUsd:display(other),
  estimatedNetUsd:display(net),indicativeSpreadPct:(Number(spreadBps)/100).toFixed(2),
  risk,screen:{spreadStrictlyAbovePointFivePct:thresholdPass,riskAllowed:riskPass,netPositive:economicallyPositive,passesHypotheticalEconomics:pass},
  verifiedTradeSizeQuotes:false,verifiedCrossVenueRoute:false,verifiedSameBlockQuotes:false,
  verifiedAtomicForkExecution:false,verifiedGasEstimate:false,
  qualifiedForDashboard:false,executionEligible:false,
  notes:['MANUALLY_SUPPLIED_VALUES_ARE_NOT_LIVE_QUOTES','HYPOTHETICAL_PASS_IS_NOT_A_DASHBOARD_ALERT','FLASH_LOAN_AND_SWAP_EXECUTION_NOT_TESTED'],
  safety:{readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false}
 };
}
function mount(app){
 app.get('/api/phase12/economics/status',(_req,res)=>res.json({success:true,build:'12.5.0',mode:'READ_ONLY',requiredInputs:['loanUsdc','roundTripReturnUsdc','gasUsd','slippageReserveUsd','premiumBps','risk'],threshold:'strictly > 0.5%',automatedQuotes:false,qualified:0,alerts:[],executionEligible:false}));
 app.post('/api/phase12/economics/evaluate',(req,res)=>{
  try{res.json({success:true,build:'12.5.0',...evaluate(req.body)});}
  catch(e){res.status(400).json({success:false,error:String(e.message||e).slice(0,100),qualifiedForDashboard:false,executionEligible:false});}
 });
}
module.exports={evaluate,mount};
