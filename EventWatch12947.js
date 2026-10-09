'use strict';
// ArbiFlow 12.9.47: Cache verified pools once, then watch Flashblocks pendingLogs.
// Read-only event-to-targeted-roundtrip audit. NO live execution or qualifying alerts.
const fs=require('node:fs'),assert=require('node:assert/strict'),WebSocket=require('ws'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const QUOTERS={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const AERO=['function getAmountOut(uint256,address) view returns(uint256)'];
const CACHE='.arbiflow-pools-12947.json',PRINCIPAL=10000n*1000000n;
const DURATION=Number(process.env.WATCH_SECONDS||35),MAX_EVENTS=Number(process.env.WATCH_MAX_EVENTS||12);
const ms=()=>Date.now();
function plan(pools,limit=24){
 const byPair=new Map();
 for(const p of pools.filter(x=>x.pair.startsWith('USDC/'))){if(!byPair.has(p.pair))byPair.set(p.pair,[]);byPair.get(p.pair).push(p)}
 const routes=[];
 for(const [pair,ps] of byPair){
  for(const a of ps)for(const b of ps){
   if(a.address.toLowerCase()===b.address.toLowerCase()||a.dex===b.dex)continue;
   routes.push({pair,token:pair.split('/')[1],first:a,second:b});
  }
 }
 // Deterministic bounded routing; no claim that this chooses the highest economic spread.
 routes.sort((x,y)=>x.pair.localeCompare(y.pair)||x.first.address.localeCompare(y.first.address));
 return routes.slice(0,limit);
}
async function registry(rpc){
 if(fs.existsSync(CACHE)){
  try{const data=JSON.parse(fs.readFileSync(CACHE,'utf8'));if(data.chainId===8453&&Array.isArray(data.pools)&&data.pools.length>=20&&ms()-data.savedAt<3600000)return {...data,cacheHit:true}}catch{}
 }
 const started=ms(),u=await discover(rpc);assert(u.success,'POOL_DISCOVERY_FAILED');
 const data={chainId:8453,savedAt:ms(),confirmedBlock:u.confirmedBlock,pools:u.pools,discoveryMs:ms()-started};
 fs.writeFileSync(CACHE,JSON.stringify(data),{mode:0o600});return {...data,cacheHit:false};
}
async function run(rpc,wss){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(/^wss:\/\//.test(wss||''),'BASE_FLASHBLOCKS_WSS_URL_REQUIRED');
 assert(Number.isSafeInteger(DURATION)&&DURATION>=5&&DURATION<=120,'INVALID_WATCH_SECONDS');
 assert(Number.isSafeInteger(MAX_EVENTS)&&MAX_EVENTS>=1&&MAX_EVENTS<=100,'INVALID_EVENT_BUDGET');
 const reg=await registry(rpc),p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const routes=plan(reg.pools),index=new Map();
  for(const route of routes)for(const pool of [route.first,route.second]){
   const k=pool.address.toLowerCase();if(!index.has(k))index.set(k,[]);index.get(k).push(route);
  }
  const qs={};for(const [dex,address] of Object.entries(QUOTERS))qs[dex]=new ethers.Contract(address,ABI,p);
  const quote=async(pool,from,to,value)=>{
   if(pool.kind==='v1')return BigInt(await new ethers.Contract(pool.address,AERO,p).getAmountOut(value,TOKENS[from],{blockTag:'pending'}));
   return BigInt((await qs[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],value,Number(pool.poolConfig),0],{blockTag:'pending'}))[0]);
  };
  const results=[],counters={notifications:0,matched:0,quotesCompleted:0,quotesFailed:0},started=ms();
  const watch=await new Promise((resolve,reject)=>{
   const ws=new WebSocket(wss,{handshakeTimeout:10000}),id=901;
   let ack=false,finished=false,busy=false;
   const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);try{ws.close()}catch{}resolve({ack,elapsedMs:ms()-started})};
   const timer=setTimeout(finish,DURATION*1000);
   ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id,method:'eth_subscribe',params:['pendingLogs',{address:[...index.keys()]}]})));
   ws.on('error',e=>{if(!ack&&!finished){clearTimeout(timer);finished=true;reject(Error('WEBSOCKET_CONNECTION_FAILED: '+e.message))}});
   ws.on('close',()=>{if(!finished)finish()});
   ws.on('message',async data=>{
    let msg;try{msg=JSON.parse(String(data))}catch{return}
    if(msg.id===id){if(msg.error){clearTimeout(timer);finished=true;reject(Error('PENDING_LOGS_NOT_SUPPORTED: '+String(msg.error.message).slice(0,100)));try{ws.close()}catch{}}else if(msg.result)ack=true;return}
    if(msg.method!=='eth_subscription'||!msg.params?.result||!ack)return;
    counters.notifications++;
    const log=msg.params.result,k=String(log.address||'').toLowerCase(),affected=index.get(k);
    if(!affected||!affected.length||busy||counters.matched>=MAX_EVENTS)return;
    counters.matched++;busy=true;const eventAt=ms();
    const route=affected[0],row={pool:k,path:'USDC>'+route.token+'>USDC',receivedAt:eventAt,qualified:false};
    try{
     const amount=await quote(route.first,'USDC',route.token,PRINCIPAL);
     const returned=await quote(route.second,route.token,'USDC',amount);
     row.afterPoolQuotesRaw=(returned-PRINCIPAL).toString();
     row.quoteLatencyMs=ms()-eventAt;row.success=true;counters.quotesCompleted++;
    }catch(e){row.success=false;row.error=String(e?.shortMessage||e?.code||e?.message||e).slice(0,90);row.quoteLatencyMs=ms()-eventAt;counters.quotesFailed++}
    results.push(row);busy=false;if(counters.matched>=MAX_EVENTS)finish();
   });
  });
  return {success:true,build:'12.9.47',mode:'FLASHBLOCKS_PENDINGLOGS_EVENT_DRIVEN_DIAGNOSTIC',registry:{poolCount:reg.pools.length,cacheHit:reg.cacheHit,discoveryMs:reg.discoveryMs},routesIndexed:routes.length,watchedPoolAddresses:index.size,subscriptionAcknowledged:watch.ack,observedMs:watch.elapsedMs,counters,events:results.slice(0,MAX_EVENTS),qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,warning:'CANDIDATE_QUOTES_EXCLUDE_AAVE_GAS_SLIPPAGE_AND_FORK_VALIDATION; NO_PROFIT_OR_FLASHLOAN_CLAIM'};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(plan([{pair:'USDC/WETH',dex:'A',address:'0x1'},{pair:'USDC/WETH',dex:'B',address:'0x2'}]).length,2);
 console.log(JSON.stringify({build:'12.9.47',unitAssertionsPassed:1}));
 if(!process.env.BASE_RPC_URL||!process.env.BASE_FLASHBLOCKS_WSS_URL){console.error('REQUIRED_SECRETS_BASE_RPC_URL_AND_BASE_FLASHBLOCKS_WSS_URL');process.exitCode=1}
 else run(process.env.BASE_RPC_URL,process.env.BASE_FLASHBLOCKS_WSS_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('EVENT_WATCH_FAILED',String(e?.message||e).replace(/wss?:\/\/\S+/g,'[REDACTED]').slice(0,220));process.exitCode=1});
}
module.exports={run,plan,registry};
