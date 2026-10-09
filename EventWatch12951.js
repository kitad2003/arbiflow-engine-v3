'use strict';
// 12.9.51 fast-screen and profit-audited read-only multi-route prioritized pendingLogs watch with cached registry, bounded concurrent quote jobs.
const fs=require('node:fs'),assert=require('node:assert/strict'),WebSocket=require('ws'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {RpcPacer}=require('./RpcPacer12950');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const CACHE='.arbiflow-pools-12951.json',MAX_ROUTES=Number(process.env.ROUTE_LIMIT||600),MAX_ROUTES_PER_EVENT=Number(process.env.ROUTES_PER_EVENT||5),SECONDS=Number(process.env.WATCH_SECONDS||45),WORKERS=Number(process.env.QUOTE_WORKERS||3),MAX_QUEUE=Number(process.env.MAX_EVENT_QUEUE||40),PRINCIPAL=10000n*1000000n;
const QUOTERS={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const now=()=>Date.now();
function routesFor(pools,limit=MAX_ROUTES){
 const groups=new Map();for(const p of pools){if(!p.pair.startsWith('USDC/'))continue;if(!groups.has(p.pair))groups.set(p.pair,[]);groups.get(p.pair).push(p)}
 const routes=[];
 for(const [pair,ps] of groups)for(const first of ps)for(const second of ps){
  if(first.address.toLowerCase()===second.address.toLowerCase()||first.dex===second.dex)continue;
  routes.push({pair,token:pair.split('/')[1],first,second});
 }
 // Round-robin selection across pairs avoids lexical starvation of newer token pairs.
 const buckets=new Map();for(const route of routes){if(!buckets.has(route.pair))buckets.set(route.pair,[]);buckets.get(route.pair).push(route)}
 const picked=[];while(picked.length<limit){let any=false;for(const bucket of buckets.values()){if(bucket.length){picked.push(bucket.shift());any=true;if(picked.length>=limit)break}}if(!any)break}
 return {total:routes.length,selected:picked};
}
async function cachedRegistry(rpc){
 try{const saved=JSON.parse(fs.readFileSync(CACHE,'utf8'));if(saved.chainId===8453&&Array.isArray(saved.pools)&&saved.pools.length>=20&&now()-saved.savedAt<3600000)return {...saved,cacheHit:true}}catch{}
 const start=now(),d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');
 const saved={chainId:8453,pools:d.pools,savedAt:now(),discoveryMs:now()-start,block:d.confirmedBlock};
 fs.writeFileSync(CACHE,JSON.stringify(saved),{mode:0o600});return {...saved,cacheHit:false};
}
async function run(rpc,wss){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(/^wss:\/\//.test(wss||''),'BASE_FLASHBLOCKS_WSS_URL_REQUIRED');
 assert([MAX_ROUTES,MAX_ROUTES_PER_EVENT,SECONDS,WORKERS,MAX_QUEUE].every(Number.isSafeInteger),'INVALID_INTEGER_CONFIG');
 assert(MAX_ROUTES>0&&MAX_ROUTES<=3000&&MAX_ROUTES_PER_EVENT>0&&MAX_ROUTES_PER_EVENT<=20&&SECONDS>=5&&SECONDS<=180&&WORKERS>=1&&WORKERS<=10&&MAX_QUEUE>=1&&MAX_QUEUE<=500,'INVALID_LIMITS');
 const t=now(),reg=await cachedRegistry(rpc),provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await provider.send('eth_chainId',[])),8453n);
  const routeSet=routesFor(reg.pools),index=new Map();
  for(const route of routeSet.selected)for(const pool of [route.first,route.second]){const key=pool.address.toLowerCase();if(!index.has(key))index.set(key,[]);index.get(key).push(route)}
  const qs={};for(const [dex,address] of Object.entries(QUOTERS))qs[dex]=new ethers.Contract(address,ABI,provider);
  async function quote(pool,from,to,amount){
   if(pool.kind==='v1')return BigInt(await new ethers.Contract(pool.address,V1,provider).getAmountOut(amount,TOKENS[from],{blockTag:'pending'}));
   return BigInt((await qs[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:'pending'}))[0]);
  }
  const premiumBps=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL());
  const pacer=new RpcPacer({gapMs:Number(process.env.RPC_GAP_MS||80),parallel:2,retries:3});
  const events=[],queue=[],stats={notifications:0,matched:0,enqueued:0,processed:0,quoteSuccesses:0,quoteFailures:0,droppedQueueFull:0,coalescedEvents:0,dirtyRescans:0,ignoredUnwatched:0,routeEvaluations:0,queuePeak:0,workersPeak:0};const outstanding=new Set(),dirty=new Map();
  let active=0,closing=false;
  const work=()=>{
   while(active<WORKERS&&queue.length){
    const job=queue.shift();active++;stats.workersPeak=Math.max(stats.workersPeak,active);
    (async()=>{
     const row={pool:job.address,receivedAt:job.receivedAt,queueDelayMs:now()-job.receivedAt,qualified:false,routeResults:[]};
     // Quote several routes per event and rank on actual USDC output, NOT pool liquidity units.
     for(const route of job.routes.slice(0,MAX_ROUTES_PER_EVENT)){
      const result={path:'USDC>'+route.token+'>USDC',firstPool:route.first.address,secondPool:route.second.address};
      try{const intermediate=await pacer.run(()=>quote(route.first,'USDC',route.token,PRINCIPAL));const back=await pacer.run(()=>quote(route.second,route.token,'USDC',intermediate));
       result.afterPoolQuotesRaw=(back-PRINCIPAL).toString();result.afterAaveBeforeGasRaw=(back-PRINCIPAL-((PRINCIPAL*premiumBps+9999n)/10000n)).toString();result.spreadGreaterThanHalfPercent=(back-PRINCIPAL)*10000n>PRINCIPAL*50n;result.remainingGates=['GAS','L1_FEE','SLIPPAGE','ATOMIC_FORK','RISK'];result.success=true;stats.quoteSuccesses++;
      }catch(e){result.success=false;result.error=String(e?.shortMessage||e?.code||e?.message||e).slice(0,100);stats.quoteFailures++}
      stats.routeEvaluations++;row.routeResults.push(result);
     }
     row.routeResults.sort((a,b)=>a.success&&b.success?(BigInt(a.afterPoolQuotesRaw)>BigInt(b.afterPoolQuotesRaw)?-1:BigInt(a.afterPoolQuotesRaw)<BigInt(b.afterPoolQuotesRaw)?1:0):a.success?-1:b.success?1:0);
     row.bestRoute=row.routeResults[0]||null;row.eventToQuoteMs=now()-job.receivedAt;stats.processed++;events.push(row);
    })().finally(()=>{outstanding.delete(job.address);active--;const latest=dirty.get(job.address);dirty.delete(job.address);if(latest&&!closing&&queue.length<MAX_QUEUE){outstanding.add(job.address);queue.push({...job,receivedAt:latest});stats.dirtyRescans++;stats.enqueued++}work()});
   }
  };
  const wsResult=await new Promise((resolve,reject)=>{
   let ws,ack=false,done=false,attempts=0;const connect=()=>{if(done)return;attempts++;ws=new WebSocket(wss,{handshakeTimeout:10000});attach(ws)};const attach=(socket)=>{
   const timer=setTimeout(()=>finish(),SECONDS*1000);
   function finish(err){if(done)return;done=true;closing=true;clearTimeout(timer);try{ws.close()}catch{}if(err)reject(err);else resolve({ack,subscriptionElapsedMs:now()-t})}
   socket.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:948,method:'eth_subscribe',params:['pendingLogs',{address:[...index.keys()]}]})));
   socket.on('error',e=>{if(!ack&&!done){const throttled=/429/.test(e.message);if(throttled&&attempts<4){try{socket.terminate()}catch{};setTimeout(connect,Math.min(4000,500*2**attempts))}else finish(Error('WEBSOCKET_FAILED: '+e.message))}});
   socket.on('close',()=>{if(!done&&ack)finish()});
   socket.on('message',data=>{
    let m;try{m=JSON.parse(String(data))}catch{return}
    if(m.id===948){if(m.error)finish(Error('PENDING_LOGS_REJECTED: '+String(m.error.message).slice(0,100)));else if(m.result)ack=true;return}
    if(!ack||m.method!=='eth_subscription')return;
    stats.notifications++;const address=String(m.params?.result?.address||'').toLowerCase(),associated=index.get(address);
    if(!associated){stats.ignoredUnwatched++;return}
    stats.matched++;
    if(outstanding.has(address)){stats.coalescedEvents++;dirty.set(address,now());return}
    if(queue.length>=MAX_QUEUE){stats.droppedQueueFull++;return}
    outstanding.add(address);
    queue.push({address,routes:associated,receivedAt:now()});stats.enqueued++;stats.queuePeak=Math.max(stats.queuePeak,queue.length);work();
   });
   };connect();
  });
  // Drain in-flight and queued work for at most 10s, then keep final counters stable.
  const drainUntil=now()+10000;work();while((queue.length||active)&&now()<drainUntil)await new Promise(done=>setTimeout(done,100));
  const latencies=events.map(e=>e.eventToQuoteMs).sort((a,b)=>a-b),delays=events.map(e=>e.queueDelayMs).sort((a,b)=>a-b),pct=(a,q)=>a.length?a[Math.max(0,Math.ceil(a.length*q)-1)]:null;
  return {success:wsResult.ack,build:'12.9.51',mode:'EVENT_ROUTE_PROFIT_AUDIT_READ_ONLY',aavePremiumBps:premiumBps.toString(),rpcPacer:pacer.stats,maxRoutesPerEvent:MAX_ROUTES_PER_EVENT,registry:{poolCount:reg.pools.length,cacheHit:reg.cacheHit,discoveryMs:reg.discoveryMs},routeCandidates:routeSet.total,routesIndexed:routeSet.selected.length,watchedPoolAddresses:index.size,subscriptionAcknowledged:wsResult.ack,elapsedMs:now()-t,stats,latencyMs:{queueMedian:pct(delays,.5),eventToQuoteMedian:pct(latencies,.5),eventToQuoteP95:pct(latencies,.95)},bestObservedRoutes:events.flatMap(e=>e.routeResults).filter(e=>e.success).sort((a,b)=>BigInt(a.afterAaveBeforeGasRaw)>BigInt(b.afterAaveBeforeGasRaw)?-1:BigInt(a.afterAaveBeforeGasRaw)<BigInt(b.afterAaveBeforeGasRaw)?1:0).slice(0,10),events:events.slice(0,12),qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,warning:'NO_EVENT_ORIGIN_LATENCY_MEASURED; NON_ATOMIC_QUOTES; AAVE_GAS_SLIPPAGE_NOT_INCLUDED; ROUTES_REQUOTED_SEQUENTIALLY'};
 }finally{provider.destroy()}
}
if(require.main===module){
 assert.equal(routesFor([{pair:'USDC/WETH',address:'a',dex:'X'},{pair:'USDC/WETH',address:'b',dex:'Y'}]).selected.length,2);
 console.log(JSON.stringify({build:'12.9.51',unitAssertionsPassed:1}));
 if(!process.env.BASE_RPC_URL||!process.env.BASE_FLASHBLOCKS_WSS_URL){console.error('RPC_AND_FLASHBLOCKS_SECRETS_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL,process.env.BASE_FLASHBLOCKS_WSS_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('WATCH_12951_FAILED',String(e?.message||e).replace(/wss?:\/\/\S+/g,'[REDACTED]').slice(0,200));process.exitCode=1});
}
module.exports={run,routesFor,cachedRegistry};
