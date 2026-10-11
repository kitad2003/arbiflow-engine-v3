'use strict';
// ArbiFlow 12.9.72: public Binance top-of-book market snapshot.
// Full exchange symbol universe from exchangeInfo, no static pair whitelist.
// Informational CEX quotes only: no depth proof, no inventory, no execution.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const API='https://api.binance.com';
async function getJson(path,fetcher=fetch){
 const response=await fetcher(API+path,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('BINANCE_HTTP_'+response.status);
 return response.json();
}
function convert(info,tickers,observedAt=Date.now()){
 assert(Array.isArray(info?.symbols)&&Array.isArray(tickers),'INVALID_BINANCE_PAYLOAD');
 const symbols=new Map(info.symbols.filter(s=>s.status==='TRADING'&&s.baseAsset&&s.quoteAsset).map(s=>[s.symbol,s]));
 const rows=[],rejected=[];
 for(const t of tickers){
  const s=symbols.get(t.symbol);
  if(!s)continue;
  const bid=String(t.bidPrice),ask=String(t.askPrice);
  if(!/^(?:\d+)(?:\.\d+)?$/.test(bid)||!/^(?:\d+)(?:\.\d+)?$/.test(ask)||Number(bid)<=0||Number(ask)<=0||Number(bid)>Number(ask)){
   rejected.push({symbol:t.symbol,reason:'INVALID_OR_CROSSED_TOP_OF_BOOK'});continue;
  }
  rows.push({sourceType:'CEX_ORDERBOOK',venue:'BINANCE',symbol:s.baseAsset+'/'+s.quoteAsset,bid,ask,observedAt,sourceSymbol:s.symbol});
 }
 return {rows,rejected,listed:symbols.size};
}
async function main(){
 const [info,tickers]=await Promise.all([getJson('/api/v3/exchangeInfo'),getJson('/api/v3/ticker/bookTicker')]);
 const output=convert(info,tickers);
 fs.writeFileSync('arbiflow-cex-orderbooks.json',JSON.stringify(output.rows)+'\n');
 const report={build:'12.9.72',mode:'LIVE_CEX_TOP_OF_BOOK_SNAPSHOT',venue:'BINANCE',listedMarkets:output.listed,acceptedMarkets:output.rows.length,rejectedMarkets:output.rejected.length,observedAt:output.rows[0]?.observedAt??Date.now(),depthVerified:false,atomicWithOnchainLoan:false,readOnly:true,executionEligible:false};
 fs.writeFileSync('arbiflow-cex-feed-12972.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
if(require.main===module){
 const test=convert({symbols:[{symbol:'ABCUSDT',status:'TRADING',baseAsset:'ABC',quoteAsset:'USDT'}]},[{symbol:'ABCUSDT',bidPrice:'1.1',askPrice:'1.2'}],1);
 assert(test.rows.length===1&&test.rows[0].symbol==='ABC/USDT');
 assert(convert({symbols:[{symbol:'ABCUSDT',status:'TRADING',baseAsset:'ABC',quoteAsset:'USDT'}]},[{symbol:'ABCUSDT',bidPrice:'1.3',askPrice:'1.2'}],1).rows.length===0);
 console.log(JSON.stringify({build:'12.9.72',unitTests:'PASS'}));
 main().catch(e=>{console.error(JSON.stringify({build:'12.9.72',status:'FEED_UNAVAILABLE',reason:String(e.message).slice(0,120)}));process.exitCode=1});
}
module.exports={convert,getJson};
