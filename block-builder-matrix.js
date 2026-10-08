'use strict';
// Read-only block-builder evaluation matrix. No relay calls, signatures or broadcasts.
const builders=[
 {id:'flashbots',name:'Flashbots',ecosystem:'Ethereum',integration:'NOT_CONFIGURED'},
 {id:'bloxroute',name:'bloXroute',ecosystem:'Multi-chain (verify chain-specific support)',integration:'NOT_CONFIGURED'},
 {id:'public-rpc',name:'Public RPC baseline',ecosystem:'Chain-dependent',integration:'READ_ONLY_BASELINE'}
];
function evaluate(input){
 const chainId=Number(input.chainId||8453);
 const gross=Number(input.grossProfitUsd),loan=Number(input.flashLoanPremiumUsd),gas=Number(input.gasUsd),builderFee=Number(input.builderFeeUsd),slippage=Number(input.slippageReserveUsd);
 const values=[gross,loan,gas,builderFee,slippage];
 const valid=values.every(Number.isFinite)&&values.every((v,i)=>i===0||v>=0);
 const net=valid?gross-loan-gas-builderFee-slippage:null;
 const simulation=input.atomicSimulation===true;
 const spread=Number(input.spreadPct);
 const risk=String(input.risk||'UNVERIFIED').toUpperCase();
 const qualifies=valid&&simulation&&Number.isFinite(spread)&&spread>0.5&&net>0&&(risk==='LOW'||risk==='MEDIUM');
 return {chainId,netProfitUsd:net,qualified:qualifies,reason:!valid?'MISSING_OR_INVALID_COSTS':!simulation?'ATOMIC_SIMULATION_REQUIRED':!Number.isFinite(spread)||spread<=0.5?'SPREAD_THRESHOLD_NOT_MET':net<=0?'NONPOSITIVE_NET_PROFIT':!['LOW','MEDIUM'].includes(risk)?'RISK_NOT_APPROVED':'QUALIFIED_FOR_REVIEW_NOT_EXECUTION',mainnetBroadcast:false};
}
module.exports={evaluate,mount(app){
 app.get('/api/block-builder/matrix',(_req,res)=>res.json({success:true,mode:'READ_ONLY',builders,chainSupportVerified:false,liveLatencyBenchmarked:false,relayIntegrationConfigured:false,speedMultiplierMeasured:null,metricsToBenchmark:['quoteLatencyP50Ms','quoteLatencyP95Ms','simulationLatencyP95Ms','builderSubmissionLatencyP95Ms','inclusionRate','gasCostUsd'],notes:['No measured speed multiplier without baseline benchmarks','A builder is not a substitute for profitable atomic simulation','Builder and private relay availability differ by chain'],mainnetBroadcast:false}));
 app.post('/api/block-builder/evaluate',(req,res)=>res.json({success:true,...evaluate(req.body||{})}));
}};