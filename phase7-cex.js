'use strict';
// Manual, read-only, public market-data probes. No credentials or order placement.
const VENUES = Object.freeze({
  binance: {url:'https://api.binance.com/api/v3/ticker/bookTicker?symbol=BTCUSDT', parse:d=>({bid:d.bidPrice,ask:d.askPrice})},
  coinbase: {url:'https://api.exchange.coinbase.com/products/BTC-USD/ticker', parse:d=>({bid:d.bid,ask:d.ask})},
  kraken: {url:'https://api.kraken.com/0/public/Ticker?pair=XBTUSD', parse:d=>{if(d.error?.length)throw Error('EXCHANGE_ERROR'); const x=Object.values(d.result||{})[0];return {bid:x?.b?.[0],ask:x?.a?.[0]};}},
  okx: {url:'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT', parse:d=>({bid:d.data?.[0]?.bidPx,ask:d.data?.[0]?.askPx})},
  bybit: {url:'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT', parse:d=>({bid:d.result?.list?.[0]?.bid1Price,ask:d.result?.list?.[0]?.ask1Price})}
});
function safePrice(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
async function probe(name,fetcher=globalThis.fetch){
  const venue=VENUES[name]; if(!venue)return {success:false,venue:name,error:'UNKNOWN_VENUE'};
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),7000);
  try {
    const r=await fetcher(venue.url,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal});
    if(!r.ok)return {success:false,venue:name,error:r.status===429?'RATE_LIMITED':'HTTP_'+r.status};
    const parsed=venue.parse(await r.json());const bid=safePrice(parsed.bid),ask=safePrice(parsed.ask);
    if(bid===null||ask===null||bid>ask)return {success:false,venue:name,error:'INVALID_BOOK_QUOTE'};
    return {success:true,venue:name,bid,ask,quoteCurrency:name==='coinbase'||name==='kraken'?'USD':'USDT',symbol:'BTC',readOnly:true,executable:false};
  }catch(e){return {success:false,venue:name,error:e.name==='AbortError'?'TIMEOUT':'FETCH_OR_PARSE_FAILED'};}
  finally{clearTimeout(timeout);}
}
function mount(app){
  app.get('/api/phase7/status',(_req,res)=>res.json({success:true,stage:'MANUAL_PUBLIC_CEX_QUOTES',venues:Object.keys(VENUES),automaticScanning:false,readOnly:true,mainnetBroadcast:false,tradeExecution:false}));
  app.get('/api/phase7/quote',async(req,res)=>{
    const name=String(req.query.venue||'').toLowerCase();
    if(!Object.hasOwn(VENUES,name))return res.status(400).json({success:false,error:'UNKNOWN_VENUE',venues:Object.keys(VENUES)});
    res.json(await probe(name));
  });
}
module.exports={mount,probe,VENUES};
