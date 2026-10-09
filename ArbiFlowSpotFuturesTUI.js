'use strict';
// ArbiFlow local spot/futures basis TUI. Public market data, research only.
// Does not place orders, sign transactions, request wallets, or classify as executable arbitrage.
const readline=require('node:readline');
const https=require('node:https');
const PAIRS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const ENDPOINTS={spot:'https://api.binance.com/api/v3/ticker/bookTicker',perp:'https://fapi.binance.com/fapi/v1/ticker/bookTicker',funding:'https://fapi.binance.com/fapi/v1/premiumIndex'};
function requestJson(url,timeout=5500){return new Promise((resolve,reject)=>{const req=https.get(url,{timeout,headers:{'user-agent':'ArbiFlowResearchTUI/1.0'}},res=>{let data='';res.on('data',chunk=>{data+=chunk;if(data.length>2e6)req.destroy(Error('OVERSIZED_RESPONSE'))});res.on('end',()=>{if(res.statusCode!==200)return reject(Error('HTTP_'+res.statusCode));try{resolve(JSON.parse(data))}catch{reject(Error('INVALID_JSON'))}})});req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.on('error',reject)})}
function records(rows){return new Map((Array.isArray(rows)?rows:[rows]).filter(x=>x?.symbol).map(x=>[x.symbol,x]))}
function inspect(symbol,spot,perp,funding,updatedAt){
 const s=spot.get(symbol),f=perp.get(symbol),fund=funding.get(symbol);
 if(!s||!f)return {symbol,status:'MISSING_FEED',qualified:false};
 const sb=Number(s.bidPrice),sa=Number(s.askPrice),fb=Number(f.bidPrice),fa=Number(f.askPrice);
 if(![sb,sa,fb,fa].every(x=>Number.isFinite(x)&&x>0)||sa<sb||fa<fb)return {symbol,status:'INVALID_BOOK',qualified:false};
 // Two directions. Selling perp against bought spot carries basis exposure; not atomic arb.
 const cashAndCarryPct=(fb/sa-1)*100;
 const reversePct=(sb/fa-1)*100;
 const fr=Number(fund?.lastFundingRate);
 return {symbol,spotBid:sb,spotAsk:sa,perpBid:fb,perpAsk:fa,basisPct:((fb+fa)/(sb+sa)-1)*100,
 cashAndCarryPct,reversePct,fundingRatePct:Number.isFinite(fr)?fr*100:null,
 bestDirection:cashAndCarryPct>=reversePct?'BUY_SPOT_SELL_PERP':'SELL_SPOT_BUY_PERP',
 bestRawEdgePct:Math.max(cashAndCarryPct,reversePct),updatedAt,status:'INDICATIVE_ONLY',qualified:false,
 risk:'UNVERIFIED',netProfitUsd:null,executable:false};
}
async function scan(fetcher=requestJson,symbols=PAIRS){
 const queries=await Promise.allSettled([fetcher(ENDPOINTS.spot),fetcher(ENDPOINTS.perp),fetcher(ENDPOINTS.funding)]);
 const errors=queries.map((x,i)=>x.status==='rejected'?{feed:Object.keys(ENDPOINTS)[i],message:String(x.reason?.message||x.reason).slice(0,90)}:null).filter(Boolean);
 const [spot,perp,funding]=queries.map(x=>x.status==='fulfilled'?records(x.value):new Map());
 const updatedAt=new Date().toISOString();
 return {updatedAt,source:'BINANCE_PUBLIC_REST',mode:'SPOT_PERPETUAL_BASIS_RESEARCH',errors,
 rows:symbols.map(s=>inspect(s,spot,perp,funding,updatedAt)),
 qualified:[],alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
}
const num=(x,places=2)=>Number.isFinite(x)?x.toFixed(places):'--';
function render(d,tab='all'){
 const width=process.stdout.columns||100;
 const line='─'.repeat(Math.min(width-2,96)),seen=d.rows.filter(x=>tab==='all'||(tab==='positive'&&x.bestRawEdgePct>0));
 return ['ARBIFLOW PRO   |   SPOT / FUTURES TERMINAL   |   READ ONLY',line,
 'Source: '+d.source+'  Updated: '+d.updatedAt,
 'Prices are indicative bid/ask snapshots; these are NOT risk-free or executable arbitrage.',
 '', 'PAIR        SPOT ASK       PERP BID      BASIS%      EDGE%      FUNDING%    DIRECTION',
 ...seen.map(x=>x.status!=='INDICATIVE_ONLY'?x.symbol.padEnd(12)+x.status:
 x.symbol.padEnd(12)+num(x.spotAsk).padStart(12)+num(x.perpBid).padStart(14)+num(x.basisPct,3).padStart(11)+num(x.bestRawEdgePct,3).padStart(11)+num(x.fundingRatePct,4).padStart(14)+'   '+x.bestDirection),
 line,'Feeds: '+(d.errors.length?d.errors.map(e=>e.feed+':'+e.message).join(' | '):'OK')+
 '  | Qualified: 0 | Trading: DISABLED',
 'Keys: [r] refresh  [a] all  [p] positive raw edges  [q] quit',
 'Basis trades involve funding, fees, liquidation, execution and venue risk.'].join('\n');
}
async function start(){
 if(!process.stdin.isTTY){const d=await scan();console.log(render(d));return}
 let busy=false,tab='all',data=null,closed=false;
 readline.emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);
 const update=async()=>{if(busy||closed)return;busy=true;try{data=await scan()}catch(e){data={updatedAt:new Date().toISOString(),source:'ERROR',rows:[],errors:[{feed:'ALL',message:String(e.message)}]}}finally{busy=false}process.stdout.write('\x1b[2J\x1b[H'+render(data,tab)+'\n')};
 const timer=setInterval(update,10000);
 const stop=()=>{closed=true;clearInterval(timer);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n')};
 process.stdin.on('keypress',(_,key)=>{if(key?.ctrl&&key.name==='c'||key?.name==='q'){stop();return}if(key?.name==='r')update();if(key?.name==='a'||key?.name==='p'){tab=key.name==='a'?'all':'positive';if(data)process.stdout.write('\x1b[2J\x1b[H'+render(data,tab)+'\n')}});
 await update();
}
if(require.main===module)start().catch(e=>{console.error('TUI_FAILED',String(e?.message||e));process.exitCode=1});
module.exports={scan,inspect,render,records,start,ENDPOINTS};
