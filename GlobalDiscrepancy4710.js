"use strict";

const { JsonRpcProvider, Contract, formatUnits, parseUnits, getAddress } = require("ethers");

const VERSION="4.73.1";
const BASE_CHAIN_ID=8453;
const BASE_WETH="0x4200000000000000000000000000000000000006";
const BASE_USDC="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const MORPHO="0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
const AAVE={provider:"0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d",poolFallback:"0xa238dd80c259a72e81d7e4664a9801593f98d1c5",data:"0x0f43731eb8d45a581f4a36dd74f5f358bc90c73a"};
const ERC20=["function balanceOf(address) view returns(uint256)"];
const ADDR_PROVIDER=["function getPool() view returns(address)"];
const AAVE_POOL=["function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)"];
const DATA=["function getReserveTokensAddresses(address) view returns(address,address,address)"];

const MIN_SPREAD_PCT=Math.max(0.01,Number(process.env.ARBIFLOW_GLOBAL_MIN_SPREAD_PCT||"0.50"));
const MIN_NET_USD=Math.max(0,Number(process.env.ARBIFLOW_GLOBAL_MIN_NET_USD||"15"));
const POLL_MS=Math.max(1000,Number(process.env.ARBIFLOW_REFERENCE_POLL_MS||"3000"));
const FULL_RECONCILE_MS=Math.max(60000,Math.min(300000,Number(process.env.ARBIFLOW_GLOBAL_RECONCILE_MS||"300000")));
const MAX_REFERENCE_AGE_MS=Math.max(2000,Number(process.env.ARBIFLOW_REFERENCE_MAX_AGE_MS||"10000"));
const ONEINCH_KEY=process.env.ONEINCH_API_KEY||"";
const BASE_RPC_URL=process.env.BASE_RPC_URL||"";
const provider=BASE_RPC_URL?new JsonRpcProvider(BASE_RPC_URL,BASE_CHAIN_ID,{staticNetwork:true}):null;

const registry={
 ETH:{canonical:"ETH",class:"A_NATIVE_WRAPPED",representations:{base:{native:"ETH",wrapped:BASE_WETH},cex:["ETH-USD","ETHUSDT","ETH/USD"]}},
 USDC:{canonical:"USDC",class:"A_STABLE_DIRECT",representations:{base:{token:BASE_USDC},cex:["USDC-USD","USDCUSDT","USDC/USD"]}},
 USDT:{canonical:"USDT",class:"D_INDEPENDENT_STABLE",representations:{cex:["USDT-USD","USDT/USD"]}}
};

const S=global.__arbiflow4710||{
 status:"IDLE",startedAt:null,lastReferencePollAt:null,lastReconcileAt:null,lastBaseBlock:null,lastBaseBlockAt:null,lastError:null,timer:null,reconcileTimer:null,
 feeds:{coinbase:{status:"IDLE"},binance:{status:"IDLE"},kraken:{status:"IDLE"}},reference:{ETHUSD:null,USDCUSD:null},aggregator:{status:ONEINCH_KEY?"CONFIGURED":"UNCONFIGURED",lastQuoteAt:null,lastError:null},
 financing:{status:"IDLE",lastCheckedAt:null,morpho:null,aave:null},candidates:[],qualified:[],rejections:{},
 metrics:{referencePolls:0,referenceUpdates:0,baseStateUpdates:0,pairEvaluations:0,rawDiscrepancies:0,spreadGatePassed:0,depthPassed:0,sizingPassed:0,prequalified:0,firmQuotesRequested:0,firmQuotesPassed:0,financingChecks:0,financingPassed:0,simulations:0,simulationPassed:0,riskPassed:0,qualified:0,expired:0,invalidated:0}
};
global.__arbiflow4710=S;

function now(){return new Date().toISOString();}
function addr(value){return getAddress(String(value).toLowerCase());}
function age(ts){return ts?Date.now()-Date.parse(ts):null;}
function reject(reason){S.rejections[reason]=(S.rejections[reason]||0)+1;}
async function fetchJson(url,opts={},timeout=2500){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);try{const r=await fetch(url,{...opts,signal:ac.signal});if(!r.ok)throw new Error(`HTTP_${r.status}`);return await r.json();}finally{clearTimeout(t);}}
function setFeed(name,ok,data,error=null){const prev=S.feeds[name]||{};S.feeds[name]={...prev,status:ok?"LIVE":"ERROR",lastMessageAt:ok?now():prev.lastMessageAt||null,lastAttemptAt:now(),updates:(prev.updates||0)+(ok?1:0),errors:(prev.errors||0)+(ok?0:1),data:ok?data:prev.data||null,lastError:error};}

async function pollReferences(){
 S.metrics.referencePolls++;S.lastReferencePollAt=now();
 const jobs=[
  ["coinbase",async()=>{const j=await fetchJson("https://api.exchange.coinbase.com/products/ETH-USD/ticker");return {bid:Number(j.bid),ask:Number(j.ask)};}],
  ["binance",async()=>{const j=await fetchJson("https://api.binance.com/api/v3/ticker/bookTicker?symbol=ETHUSDT");return {bid:Number(j.bidPrice),ask:Number(j.askPrice)};}],
  ["kraken",async()=>{const j=await fetchJson("https://api.kraken.com/0/public/Ticker?pair=ETHUSD");const x=Object.values(j.result||{})[0];return {bid:Number(x?.b?.[0]),ask:Number(x?.a?.[0])};}]
 ];
 await Promise.all(jobs.map(async([n,fn])=>{try{const d=await fn();if(!(d.bid>0&&d.ask>0))throw new Error("INVALID_BOOK");setFeed(n,true,d);}catch(e){setFeed(n,false,null,e.message);}}));
 const live=Object.values(S.feeds).filter(f=>f.status==="LIVE"&&age(f.lastMessageAt)<=MAX_REFERENCE_AGE_MS&&f.data?.bid>0&&f.data?.ask>0);
 if(live.length>=2){const mids=live.map(f=>(f.data.bid+f.data.ask)/2).sort((a,b)=>a-b);const mid=mids[Math.floor(mids.length/2)];const bids=live.map(f=>f.data.bid).sort((a,b)=>a-b);const asks=live.map(f=>f.data.ask).sort((a,b)=>a-b);S.reference.ETHUSD={status:"LIVE",sources:live.length,mid,bid:bids[Math.floor(bids.length/2)],ask:asks[Math.floor(asks.length/2)],updatedAt:now(),method:"MEDIAN_LIVE_BOOKS"};S.metrics.referenceUpdates++;}
 else S.reference.ETHUSD={status:"DEGRADED",sources:live.length,updatedAt:now(),method:"INSUFFICIENT_LIVE_BOOKS"};
}

async function refreshBase(){if(!provider)return;try{const b=await provider.getBlockNumber();if(b!==S.lastBaseBlock){S.lastBaseBlock=b;S.lastBaseBlockAt=now();S.metrics.baseStateUpdates++;}}catch(e){S.lastError=`BASE_RPC:${e.message}`;}}
async function resolveAavePool(){if(!provider)return addr(AAVE.poolFallback);try{return addr(await new Contract(addr(AAVE.provider),ADDR_PROVIDER,provider).getPool());}catch{return addr(AAVE.poolFallback);}}
async function refreshFinancing(){
 if(!provider){S.financing={status:"UNAVAILABLE",lastCheckedAt:now(),reason:"BASE_RPC_URL_MISSING"};return;}
 S.metrics.financingChecks++;
 try{
  const usdc=new Contract(addr(BASE_USDC),ERC20,provider);const morphoRaw=await usdc.balanceOf(addr(MORPHO));const pool=await resolveAavePool();const data=new Contract(addr(AAVE.data),DATA,provider);const [aTokenRaw]=await data.getReserveTokensAddresses(addr(BASE_USDC));const aToken=addr(aTokenRaw);const aaveRaw=await usdc.balanceOf(aToken);let premiumBps=null;try{premiumBps=Number(await new Contract(pool,AAVE_POOL,provider).FLASHLOAN_PREMIUM_TOTAL());}catch{}
  S.financing={status:"LIVE",lastCheckedAt:now(),morpho:{provider:"MORPHO",asset:"USDC",capacity:formatUnits(morphoRaw,6),flashFeeBps:0,address:addr(MORPHO)},aave:{provider:"AAVE_V3",asset:"USDC",capacity:formatUnits(aaveRaw,6),flashFeeBps:premiumBps,pool,resolvedDynamically:pool.toLowerCase()!==AAVE.poolFallback.toLowerCase()}};S.metrics.financingPassed++;
 }catch(e){S.financing={status:"ERROR",lastCheckedAt:now(),lastError:e.message};}
}

async function oneInchQuote(src,dst,amount){
 if(!ONEINCH_KEY)throw new Error("ONEINCH_API_KEY_MISSING");S.metrics.firmQuotesRequested++;
 const u=new URL(`https://api.1inch.dev/swap/v6.1/${BASE_CHAIN_ID}/quote`);u.searchParams.set("src",src);u.searchParams.set("dst",dst);u.searchParams.set("amount",String(amount));
 const j=await fetchJson(u.toString(),{headers:{Authorization:`Bearer ${ONEINCH_KEY}`}},4500);S.metrics.firmQuotesPassed++;S.aggregator={status:"LIVE",lastQuoteAt:now(),lastError:null};return j;
}
async function evaluateEthUsdc(){
 const ref=S.reference.ETHUSD;if(ref?.status!=="LIVE")return;
 S.metrics.pairEvaluations++;
 if(!ONEINCH_KEY){S.aggregator.status="UNCONFIGURED";reject("AGGREGATOR_UNCONFIGURED");return;}
 try{
  const amount=parseUnits("1",18);const q=await oneInchQuote(BASE_WETH,BASE_USDC,amount);const dst=BigInt(q.dstAmount||q.toAmount||0);if(dst<=0n)throw new Error("NO_DST_AMOUNT");const dexPrice=Number(formatUnits(dst,6));const executableSpreadPct=((dexPrice-ref.ask)/ref.ask)*100;S.metrics.rawDiscrepancies++;
  const id=`BASE:ETH-USDC:CEX_REFERENCE:1INCH`;const c={candidateId:id,opportunityType:"CEX_REFERENCE_TO_DEX_SIGNAL",canonicalPair:"ETH/USDC",chainId:BASE_CHAIN_ID,buyVenue:"CEX_CONSENSUS_REFERENCE",sellVenue:"1INCH_BASE",referencePrice:ref.ask,dexExecutablePrice:dexPrice,rawSpreadPct:executableSpreadPct,executableSpreadPct,optimalNotionalUsd:null,grossProfitUsd:null,estimatedNetProfitUsd:null,financingProvider:null,riskLevel:"UNASSESSED",detectedAt:now(),stateVersion:`base:${S.lastBaseBlock||"unknown"}`,quoteAgeMs:0,deadline:new Date(Date.now()+2500).toISOString(),validationStatus:"REFERENCE_SIGNAL_ONLY",simulationStatus:"NOT_RUN",executionMode:"READ_ONLY",executionEligible:false};
  if(Math.abs(executableSpreadPct)<MIN_SPREAD_PCT){reject("EXECUTABLE_SPREAD_TOO_LOW");S.candidates=[{...c,status:"REJECTED",rejectionReason:"EXECUTABLE_SPREAD_TOO_LOW"}];return;}
  S.metrics.spreadGatePassed++;S.metrics.prequalified++;S.candidates=[{...c,status:"PREQUALIFIED",rejectionReason:null,note:"CEX is reference-only in 4.71.0; this is not claimed as atomic executable arbitrage."}];
 }catch(e){S.aggregator={...S.aggregator,status:"ERROR",lastError:e.message};reject("FIRM_QUOTE_FAILED");}
}

async function reconcile(){S.lastReconcileAt=now();await Promise.allSettled([refreshBase(),refreshFinancing()]);await evaluateEthUsdc();}
async function tick(){try{await Promise.allSettled([pollReferences(),refreshBase()]);await evaluateEthUsdc();}catch(e){S.lastError=e.message;}}
function start(){if(S.status==="RUNNING")return;S.status="RUNNING";S.startedAt=now();tick();reconcile();S.timer=setInterval(tick,POLL_MS);S.reconcileTimer=setInterval(reconcile,FULL_RECONCILE_MS);}
function stop(){if(S.timer)clearInterval(S.timer);if(S.reconcileTimer)clearInterval(S.reconcileTimer);S.timer=null;S.reconcileTimer=null;S.status="STOPPED";}
function feedHealth(){const out={};for(const [k,v] of Object.entries(S.feeds)){const a=age(v.lastMessageAt);out[k]={...v,ageMs:a,status:v.status==="LIVE"&&a!=null&&a>MAX_REFERENCE_AGE_MS?"STALE":v.status};}return out;}
function readiness(){const feeds=feedHealth();const liveFeeds=Object.values(feeds).filter(x=>x.status==="LIVE").length;const baseLive=age(S.lastBaseBlockAt)!=null&&age(S.lastBaseBlockAt)<30000;const agg=ONEINCH_KEY?S.aggregator.status:"UNCONFIGURED";const financing=S.financing.status;const gates={reference:liveFeeds>=2?"PASS":"FAIL",assetRegistry:"PASS",baseMarket:baseLive?"PASS":"FAIL",aggregator:agg==="LIVE"?"PASS":(agg==="CONFIGURED"?"PENDING":"FAIL"),candidateEngine:S.status==="RUNNING"?"PASS":"FAIL",financing:financing==="LIVE"?"PASS":"FAIL",validator:"READ_ONLY_NOT_EXECUTION_READY"};return {gates,tradingReadiness:Object.values(gates).every(x=>x==="PASS")?"READY":"NOT_READY"};}
function common(){const r=readiness();return {success:true,version:VERSION,process:S.status,tradingReadiness:r.tradingReadiness,gates:r.gates,readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false};}

function register(app){
 app.get("/api/global/start",(req,res)=>{const alreadyRunning=S.status==="RUNNING";start();res.json({...common(),startResult:alreadyRunning?"ALREADY_RUNNING":"STARTED_BACKGROUND",requestComplete:true,statusRoute:"/api/system/health",note:"Workers continue asynchronously; this HTTP request is complete."});});
 app.get("/api/global/stop",(req,res)=>{stop();res.json(common());});
 app.get("/api/system/health",(req,res)=>res.json({...common(),lastReferencePollAt:S.lastReferencePollAt,lastReconcileAt:S.lastReconcileAt,lastBaseBlock:S.lastBaseBlock,lastBaseBlockAt:S.lastBaseBlockAt,lastError:S.lastError}));
 app.get("/api/reference/status",(req,res)=>res.json({...common(),feeds:feedHealth(),consensus:S.reference}));
 app.get("/api/assets/status",(req,res)=>res.json({...common(),registry,identityPolicy:"CHAIN_ID_PLUS_ADDRESS; symbols are display metadata only",equivalencePolicy:"WRAPPED_NATIVE_DIRECT_ONLY_IN_4.71.0"}));
 app.get("/api/market/base/status",(req,res)=>res.json({...common(),chainId:BASE_CHAIN_ID,blockNumber:S.lastBaseBlock,lastBlockAt:S.lastBaseBlockAt,blockAgeMs:age(S.lastBaseBlockAt),stateVersion:`base:${S.lastBaseBlock||"unknown"}`}));
 app.get("/api/coverage/status",(req,res)=>res.json({...common(),referenceFeeds:{configured:3,live:Object.values(feedHealth()).filter(x=>x.status==="LIVE").length},chains:{configured:1,live:age(S.lastBaseBlockAt)!=null&&age(S.lastBaseBlockAt)<30000?1:0},aggregator:{name:"1inch",chainId:BASE_CHAIN_ID,configured:Boolean(ONEINCH_KEY),requiredEnvironmentVariable:"ONEINCH_API_KEY",credentialEmbedded:false,...S.aggregator},directCandidateEngine4700Preserved:true}));
 app.get("/api/candidates/status",(req,res)=>res.json({...common(),metrics:S.metrics,rejections:S.rejections,candidateCount:S.candidates.length,qualifiedCount:S.qualified.length,candidates:S.candidates.slice(0,20)}));
 app.get("/api/candidates/qualified",(req,res)=>res.json({...common(),policy:{minimumExecutableSpreadPct:MIN_SPREAD_PCT,minimumNetProfitUsd:MIN_NET_USD,maxRisk:"MEDIUM",firmValidationRequired:true,simulationRequired:true},count:S.qualified.length,candidates:S.qualified}));
 app.get("/api/financing/status",async(req,res)=>{if(req.query.refresh==="1")await refreshFinancing();res.json({...common(),financing:S.financing,policy:{walletDoesNotCapDiscovery:true,optimalSizeBeforeFinancing:true,morphoZeroFeeModeled:true,aavePremiumReadLive:true}});});
 app.get("/api/validator/status",(req,res)=>res.json({...common(),validator:{mode:"FAIL_CLOSED",firmQuote:S.aggregator.status,atomicExecutorSimulation:"NOT_ENABLED_FOR_GLOBAL_REFERENCE_SIGNALS",minimumProfitAssertion:"REQUIRED_BEFORE_EXECUTION_MILESTONE",qualifiedRequiresSimulation:true}}));
 app.get("/api/global/reconcile",async(req,res)=>{await reconcile();res.json({...common(),lastReconcileAt:S.lastReconcileAt});});
}

module.exports={register,start,stop,_state:S,_test:{readiness,registry}};
