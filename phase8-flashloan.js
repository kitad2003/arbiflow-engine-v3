"use strict";
// Phase 8 preflight: strictly arithmetic; NOT an on-chain or fork execution.
// Loan principal is borrowed; the user's wallet is responsible for gas only.
const MAX_LOAN=1e9;
function numeric(v, name, {min=0,max=MAX_LOAN}={}) {
  const n=Number(v);
  if(v===undefined||v===null||v===""||!Number.isFinite(n)||n<min||n>max)throw Error("INVALID_"+name);
  return n;
}
function evaluate(input){
 const principal=numeric(input.loanAmount,"LOAN_AMOUNT",{min:0.000001});
 const proceeds=numeric(input.swapProceeds,"SWAP_PROCEEDS");
 const loanFeeBps=numeric(input.loanFeeBps,"LOAN_FEE_BPS",{max:10000});
 const gasUSD=numeric(input.gasUSD,"GAS_USD",{max:1e6});
 const extraCostsUSD=numeric(input.extraCostsUSD??0,"EXTRA_COSTS_USD",{max:1e6});
 const minimumNetProfitUSD=numeric(input.minimumNetProfitUSD??0,"MINIMUM_NET_PROFIT_USD",{max:1e6});
 const fee=principal*loanFeeBps/10000;
 const repayment=principal+fee;
 const surplus=proceeds-repayment-extraCostsUSD;
 const netAfterGas=surplus-gasUSD;
 return {success:true,build:"8.0.0",stage:"ARITHMETIC_FLASH_LOAN_PREFLIGHT_ONLY",fundingModel:"FLASH_LOAN_PRINCIPAL_USER_PAYS_GAS",loanAmount:principal,swapProceeds:proceeds,loanFeeBps,loanFee:fee,repaymentDue:repayment,extraCostsUSD,gasUSD,minimumNetProfitUSD,contractRepaymentPossible:proceeds>=repayment+extraCostsUSD,netAfterGasUSD:Number(netAfterGas.toFixed(6)),passesAssumedThreshold:netAfterGas>=minimumNetProfitUSD,executionEligible:false,profitVerified:false,forkSimulated:false,liveLiquidityVerified:false,atomicTransactionVerified:false,readOnly:true,automaticScanning:false,mainnetBroadcast:false,notice:"Illustrative same-asset amounts and user-supplied costs; no live quotes, gas estimation, on-chain loan, swap, or fork execution."};
}
function mount(app){
 app.get('/api/phase8/status',(_req,res)=>res.json({success:true,build:'8.0.0',stage:'FLASH_LOAN_ATOMIC_PIPELINE_FOUNDATION',fundingModel:'FLASH_LOAN_PRINCIPAL_USER_PAYS_GAS',capabilities:{arithmeticPreflight:true,liveProviderVerification:false,liveDexRouteVerification:false,forkAtomicSimulation:false,mainnetExecution:false,dex500Verified:false},nextRequired:['Verify Aave pool liquidity and fees on selected network','Build and test approved-router atomic executor contract','Fork-execute borrow/swap/repay against verified liquidity','Audit real DEX adapters and pools'],readOnly:true,automaticScanning:false,mainnetBroadcast:false}));
 app.get('/api/phase8/preflight',(req,res)=>{try{res.json(evaluate(req.query));}catch(e){res.status(400).json({success:false,error:e.message,required:['loanAmount','swapProceeds','loanFeeBps','gasUSD'],optional:['extraCostsUSD','minimumNetProfitUSD']});}});
}
module.exports={mount,evaluate};
