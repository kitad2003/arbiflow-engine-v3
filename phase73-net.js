"use strict";
// Manual, read-only cost scenarios. Fee inputs are user assumptions, NOT verified exchange rates.
const {probe}=require('./phase7-cex');
const VENUES=['coinbase','kraken','gemini','bitstamp'];
const BUILD='7.3.0';
const round=n=>Number(n.toFixed(6));
function fill(levels,qty){let remaining=qty,total=0;for(const x of levels||[]){const q=Number(x.quantityBTC),p=Number(x.price);if(!(q>0&&p>0))continue;const used=Math.min(remaining,q);total+=used*p;remaining-=used;if(remaining<=1e-12)return total;}return null;}
function evaluate(buy,sell,budget,buyBps,sellBps,transferUSD){
 if(!buy?.success||!sell?.success||buy.quoteCurrency!=='USD'||sell.quoteCurrency!=='USD'||!buy.depth?.asks?.length||!sell.depth?.bids?.length)return null;
 const asks=buy.depth.asks,bids=sell.depth.bids;
 // Solve for maximum BTC size affordable INCLUDING the buy-side trading fee.
 let lo=0,hi=budget/asks[0].price;
 for(let i=0;i<55;i++){const mid=(lo+hi)/2,cost=fill(asks,mid);if(cost!==null&&cost*(1+buyBps/10000)<=budget)lo=mid;else hi=mid;}
 const btc=lo,buyCost=fill(asks,btc),sellValue=fill(bids,btc);
 if(btc<=0||buyCost===null||sellValue===null)return null;
 const buyFee=buyCost*buyBps/10000,sellFee=sellValue*sellBps/10000;
 const gross=sellValue-buyCost,net=gross-buyFee-sellFee-transferUSD;
 return {capitalLimitUSD:budget,buyVenue:buy.venue,sellVenue:sell.venue,btcAmount:round(btc),buyCostUSD:round(buyCost),buyFeeUSD:round(buyFee),totalBuyDebitUSD:round(buyCost+buyFee),sellProceedsUSD:round(sellValue),sellFeeUSD:round(sellFee),transferCostAssumptionUSD:round(transferUSD),grossBeforeFeesUSD:round(gross),netAfterAssumedCostsUSD:round(net),estimatedReturnPercent:round(net/budget*100),costsAreUserAssumptions:true,feesVerified:false,balancesVerified:false,transferVerified:false,executionEligible:false,profitVerified:false,classification:net>0?'POSITIVE_SCENARIO_UNVERIFIED':'NON_POSITIVE_AFTER_ASSUMED_COSTS'};
}
function parseNum(raw,def,min,max){if(raw===undefined)return def;const n=Number(raw);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
let busy=false;
function mount(app){
 app.get('/api/phase73/status',(_req,res)=>res.json({success:true,build:BUILD,stage:'MANUAL_FEE_ADJUSTED_SCENARIOS',venues:VENUES,feeInputs:'USER_ASSUMPTIONS_NOT_EXCHANGE_VERIFIED',automaticScanning:false,readOnly:true,mainnetBroadcast:false,tradeExecution:false}));
 app.get('/api/phase73/net-compare',async(req,res)=>{
  if(busy)return res.status(409).json({success:false,error:'MANUAL_COMPARISON_BUSY'});
  const budget=parseNum(req.query.capitalUSD,500,10,100000),buyBps=parseNum(req.query.buyFeeBps,20,0,1000),sellBps=parseNum(req.query.sellFeeBps,20,0,1000),transferUSD=parseNum(req.query.transferUSD,0,0,100000);
  if([budget,buyBps,sellBps,transferUSD].some(x=>x===null))return res.status(400).json({success:false,error:'INVALID_NUMERIC_INPUT'});
  busy=true;
  try{
   const quotes=[];for(const name of VENUES)quotes.push(await probe(name));
   const rows=[];for(const buy of quotes)for(const sell of quotes){if(buy.venue===sell.venue)continue;const x=evaluate(buy,sell,budget,buyBps,sellBps,transferUSD);if(x)rows.push(x);}
   rows.sort((a,b)=>b.netAfterAssumedCostsUSD-a.netAfterAssumedCostsUSD);
   const observed=quotes.filter(q=>q.success).map(q=>Date.parse(q.observedAt)).filter(Number.isFinite);
   res.json({success:true,build:BUILD,stage:'MANUAL_NET_SCENARIO_COMPARISON',inputs:{capitalUSD:budget,buyFeeBps:buyBps,sellFeeBps:sellBps,transferUSD},feeNotice:'Illustrative assumptions only. Supply actual venue-specific fees; no live execution.',quotesStatus:quotes.map(q=>({venue:q.venue,success:q.success,error:q.error||null,observedAt:q.observedAt||null})),quoteSkewMs:observed.length>1?Math.max(...observed)-Math.min(...observed):null,results:rows,positiveScenarioCount:rows.filter(r=>r.netAfterAssumedCostsUSD>0).length,simultaneousQuotes:false,preFundedBalancesRequired:true,executionEligible:false,profitVerified:false,automaticScanning:false,readOnly:true,mainnetBroadcast:false});
  }catch(e){res.status(500).json({success:false,error:'NET_COMPARISON_FAILED'});}finally{busy=false;}
 });
}
module.exports={mount,evaluate,fill,BUILD};
