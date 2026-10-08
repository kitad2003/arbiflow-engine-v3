"use strict";
// Phase 7.1: manual public market-data observation ONLY. No keys, orders or execution.
const VENUES=Object.freeze({
 binance:{currency:'USDT',url:'https://api.binance.com/api/v3/ticker/bookTicker?symbol=BTCUSDT',parse:d=>[d.bidPrice,d.askPrice]},
 coinbase:{currency:'USD',url:'https://api.exchange.coinbase.com/products/BTC-USD/book?level=2',parse:d=>[d.bids?.[0]?.[0],d.asks?.[0]?.[0]],depth:d=>({bids:d.bids,asks:d.asks})},
 kraken:{currency:'USD',url:'https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=10',parse:d=>{if(d.error?.length)throw Error('EXCHANGE_ERROR');const x=Object.values(d.result||{})[0];return [x?.bids?.[0]?.[0],x?.asks?.[0]?.[0]];},depth:d=>{const x=Object.values(d.result||{})[0];return {bids:x?.bids,asks:x?.asks};}},
 okx:{currency:'USDT',url:'https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=10',parse:d=>{if(d.code!=='0')throw Error('EXCHANGE_ERROR');return [d.data?.[0]?.bids?.[0]?.[0],d.data?.[0]?.asks?.[0]?.[0]];},depth:d=>({bids:d.data?.[0]?.bids,asks:d.data?.[0]?.asks})},
 bybit:{currency:'USDT',url:'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT',parse:d=>[d.result?.list?.[0]?.bid1Price,d.result?.list?.[0]?.ask1Price]},
 gemini:{currency:'USD',url:'https://api.gemini.com/v1/book/btcusd?limit_bids=10&limit_asks=10',parse:d=>[d.bids?.[0]?.price,d.asks?.[0]?.price],depth:d=>({bids:d.bids?.map(x=>[x.price,x.amount]),asks:d.asks?.map(x=>[x.price,x.amount])})},
 bitstamp:{currency:'USD',url:'https://www.bitstamp.net/api/v2/order_book/btcusd/?limit=10',parse:d=>[d.bids?.[0]?.[0],d.asks?.[0]?.[0]],depth:d=>({bids:d.bids,asks:d.asks})}
});
const names=Object.keys(VENUES);
const safe=n=>{const x=Number(n);return Number.isFinite(x)&&x>0?x:null};
const cooldown=new Map();
function levels(raw){return (Array.isArray(raw)?raw:[]).slice(0,10).map(x=>({price:safe(x?.[0]),quantityBTC:safe(x?.[1])})).filter(x=>x.price&&x.quantityBTC);}
function classify(status){if(status===451)return 'ACCESS_RESTRICTED_451';if(status===403)return 'ACCESS_FORBIDDEN_403';if(status===429)return 'RATE_LIMITED_429';return 'HTTP_'+status;}
async function probe(name,fetcher=globalThis.fetch){
 const v=VENUES[name];if(!v)return {success:false,venue:name,error:'UNKNOWN_VENUE'};
 const until=cooldown.get(name)||0;if(Date.now()<until)return {success:false,venue:name,error:'TEMPORARY_COOLDOWN',retryAfterSeconds:Math.ceil((until-Date.now())/1000)};
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8500);
 try{
  const r=await fetcher(v.url,{method:'GET',headers:{Accept:'application/json'},signal:ctl.signal});
  if(!r.ok){const error=classify(r.status);if([403,451,429].includes(r.status))cooldown.set(name,Date.now()+(r.status===429?120000:3600000));return {success:false,venue:name,error,readOnly:true};}
  const d=await r.json(),[b,a]=v.parse(d),bid=safe(b),ask=safe(a);
  if(!bid||!ask||bid>ask)return {success:false,venue:name,error:'INVALID_BOOK_QUOTE'};
  const depth=v.depth?v.depth(d):null;
  return {success:true,venue:name,symbol:'BTC',quoteCurrency:v.currency,bid,ask,spread:Math.round((ask-bid)*100)/100,depth:depth?{bids:levels(depth.bids),asks:levels(depth.asks)}:null,observedAt:new Date().toISOString(),readOnly:true,executable:false,feeAdjusted:false};
 }catch(e){return {success:false,venue:name,error:e.name==='AbortError'?'TIMEOUT':'FETCH_OR_PARSE_FAILED',readOnly:true};}
 finally{clearTimeout(timer);}
}
let comparisonBusy=false;
async function compare(fetcher=globalThis.fetch){
 const quotes=[];for(const name of ['coinbase','kraken','gemini','bitstamp','okx']){quotes.push(await probe(name,fetcher));}
 const usd=quotes.filter(x=>x.success&&x.quoteCurrency==='USD');const candidates=[];
 for(const buy of usd)for(const sell of usd){if(buy.venue===sell.venue)continue;const rawSpread=sell.bid-buy.ask;if(rawSpread>0)candidates.push({buyVenue:buy.venue,sellVenue:sell.venue,buyAsk:buy.ask,sellBid:sell.bid,rawSpreadUSDPerBTC:Math.round(rawSpread*100)/100,profitVerified:false,reason:'FEES_BALANCES_LATENCY_AND_EXECUTION_UNVERIFIED'});}
 candidates.sort((a,b)=>b.rawSpreadUSDPerBTC-a.rawSpreadUSDPerBTC);
 return {success:true,stage:'MANUAL_INDICATIVE_CEX_COMPARISON',quotes,candidates,quoteCurrenciesCompared:['USD'],usdtExcludedFromUsdComparison:true,simultaneousQuotes:false,executionEligible:false,profitVerified:false,automaticScanning:false,readOnly:true,mainnetBroadcast:false};
}
function mount(app){
 app.get('/api/phase7/status',(_req,res)=>res.json({success:true,stage:'PHASE7_1_MANUAL_PUBLIC_CEX_MARKET_DATA',venues:names,restrictedVenues:['binance','bybit'],depthVenues:names.filter(n=>!!VENUES[n].depth),automaticScanning:false,readOnly:true,mainnetBroadcast:false,tradeExecution:false}));
 app.get('/api/phase7/quote',async(req,res)=>{const name=String(req.query.venue||'').toLowerCase();if(!Object.hasOwn(VENUES,name))return res.status(400).json({success:false,error:'UNKNOWN_VENUE',venues:names});res.json(await probe(name));});
 app.get('/api/phase7/compare',async(_req,res)=>{if(comparisonBusy)return res.status(409).json({success:false,error:'COMPARISON_ALREADY_RUNNING'});comparisonBusy=true;try{res.json(await compare());}catch(e){res.status(500).json({success:false,error:'COMPARISON_FAILED'});}finally{comparisonBusy=false;}});
}
module.exports={mount,probe,compare,VENUES};
