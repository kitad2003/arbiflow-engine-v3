'use strict';
// 12.9.59 transaction intelligence: decode pool swap logs and inspect actual affected routes.
// Read-only observations; no mainnet signing, transaction submission or qualifying dashboard alerts.
const assert=require('node:assert/strict'),fs=require('node:fs'),WebSocket=require('ws'),{ethers}=require('ethers');
const {cachedRegistry,routesFor}=require('./EventWatch12951');
const {TOKENS}=require('./PoolUniverse12939');
const {RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const QA=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'],VA=['function getAmountOut(uint256,address) view returns(uint256)'];
const SWAP_V3=new ethers.Interface(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
const SWAP_AERO=new ethers.Interface(['event Swap(address indexed sender,address indexed to,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out)']);
const SWAP_V3_TOPIC=SWAP_V3.getEvent('Swap').topicHash.toLowerCase(),SWAP_AERO_TOPIC=SWAP_AERO.getEvent('Swap').topicHash.toLowerCase();
const LOAN=10000000000n,MAX_EVENTS=Number(process.env.INTELLIGENCE_MAX_EVENTS||15),WATCH=Number(process.env.INTELLIGENCE_WATCH_SECONDS||30);
function decodeSwap(log,pool){
 if(!log||!pool||!Array.isArray(log.topics))return null;
 const topic=String(log.topics[0]||'').toLowerCase();
 try{
  if(pool.kind==='v3'&&topic===SWAP_V3_TOPIC){
   const v=SWAP_V3.parseLog({topics:log.topics,data:log.data});const a=BigInt(v.args.amount0),b=BigInt(v.args.amount1);
   return {kind:'V3_SWAP',token0In:a>0n,token1In:b>0n,amount0Raw:a.toString(),amount1Raw:b.toString(),tick:Number(v.args.tick),sqrtPriceX96:v.args.sqrtPriceX96.toString(),liquidityRaw:v.args.liquidity.toString()};
  }
  if(pool.kind==='v1'&&topic===SWAP_AERO_TOPIC){
   const v=SWAP_AERO.parseLog({topics:log.topics,data:log.data});
   return {kind:'AERODROME_SWAP',amount0InRaw:v.args.amount0In.toString(),amount1InRaw:v.args.amount1In.toString(),amount0OutRaw:v.args.amount0Out.toString(),amount1OutRaw:v.args.amount1Out.toString()};
  }
 }catch{return null}return null;
}
async function run(rpc,wss){
 assert(/^https:\/\//.test(rpc||''),'RPC_REQUIRED');assert(/^wss:\/\//.test(wss||''),'WSS_REQUIRED');
 assert(Number.isSafeInteger(MAX_EVENTS)&&MAX_EVENTS>=1&&MAX_EVENTS<=100,'BAD_EVENTS');assert(Number.isSafeInteger(WATCH)&&WATCH>=5&&WATCH<=120,'BAD_WATCH');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),pacer=new RpcPacer({gapMs:90,parallel:2,retries:2});
 try{
  const reg=await cachedRegistry(rpc),routes=routesFor(reg.pools,3000).selected,byAddress=new Map(),poolByAddress=new Map();
  for(const route of routes)for(const pool of [route.first,route.second]){const k=pool.address.toLowerCase();poolByAddress.set(k,pool);if(!byAddress.has(k))byAddress.set(k,[]);byAddress.get(k).push(route)}
  const quoters=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,QA,provider)])),v1=new Map();
  async function quote(pool,from,to,amount){
   if(pool.kind==='v1'){const k=pool.address.toLowerCase();if(!v1.has(k))v1.set(k,new ethers.Contract(pool.address,VA,provider));return BigInt(await pacer.run(()=>v1.get(k).getAmountOut(amount,TOKENS[from],{blockTag:'pending'})))}
   return BigInt((await pacer.run(()=>quoters[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:'pending'})))[0]);
  }
  const stats={eventsReceived:0,swapDecoded:0,unknownTopics:0,coalesced:0,eventJobs:0,successfulRoutes:0,quoteFailures:0};
  const jobs=[],busy=new Set(),observations=[];
  if(byAddress.size)await new Promise((resolve,reject)=>{
   const socket=new WebSocket(wss,{handshakeTimeout:10000});let done=false,acked=false;const timer=setTimeout(()=>finish(),WATCH*1000);
   function finish(err){if(done)return;done=true;clearTimeout(timer);socket.close();err?reject(err):resolve()}
   socket.on('open',()=>socket.send(JSON.stringify({jsonrpc:'2.0',id:12959,method:'eth_subscribe',params:['pendingLogs',{address:[...byAddress.keys()]}]})));
   socket.on('error',e=>finish(Error(String(e.message).slice(0,100))));socket.on('close',()=>finish());
   socket.on('message',raw=>{
    let m;try{m=JSON.parse(String(raw))}catch{return}
    if(m.id===12959){if(m.error)finish(Error('SUBSCRIPTION_REJECTED'));else acked=true;return}
    if(!acked||m.method!=='eth_subscription')return;
    const log=m.params?.result,address=String(log?.address||'').toLowerCase(),pool=poolByAddress.get(address);if(!pool)return;
    stats.eventsReceived++;const swap=decodeSwap(log,pool);
    if(!swap){stats.unknownTopics++;return}stats.swapDecoded++;
    if(busy.has(address)){stats.coalesced++;return}
    if(stats.eventJobs>=MAX_EVENTS)return;
    stats.eventJobs++;busy.add(address);const arrived=Date.now();
    jobs.push((async()=>{
     const candidates=(byAddress.get(address)||[]).slice(0,3),entries=[];
     for(const r of candidates){
      try{
       const t1=Date.now(),mid=await quote(r.first,'USDC',r.token,LOAN),firstMs=Date.now()-t1;
       const t2=Date.now(),back=await quote(r.second,r.token,'USDC',mid),secondMs=Date.now()-t2;
       const gross=back-LOAN;
       entries.push({pair:r.pair,pools:[r.first.address,r.second.address],grossUsdc:Number(gross)/1e6,spreadOverHalfPercent:gross*10000n>LOAN*50n,firstQuoteMs:firstMs,secondQuoteMs:secondMs,executionEligible:false});stats.successfulRoutes++;
      }catch(e){entries.push({pair:r.pair,quoteError:String(e?.shortMessage||e?.message||e).slice(0,80)});stats.quoteFailures++}
     }
     observations.push({poolAddress:address,swap,receivedAt:new Date(arrived).toISOString(),totalEvaluationMs:Date.now()-arrived,quoteResults:entries});
    })().finally(()=>busy.delete(address)));
   });
  });
  await Promise.allSettled(jobs);
  const report={build:'12.9.59',mode:'SWAP_EVENT_INTELLIGENCE_READ_ONLY',createdAt:new Date().toISOString(),poolCount:reg.pools.length,routesIndexed:routes.length,watchedPools:byAddress.size,stats,observations,rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['EVENT_DIRECTION_IS_DIAGNOSTIC_ONLY','NO_TRANSACTION_ORDER_PROOF','SEQUENTIAL_PENDING_QUOTES_NOT_ATOMIC','PREMIUM_GAS_L1_SLIPPAGE_FORK_RISK_NOT_YET_FULLY_VERIFIED']};
  fs.writeFileSync('arbiflow-event-intelligence-12959.json',JSON.stringify(report,null,2)+'\n');return report;
 }finally{provider.destroy()}
}
if(require.main===module){assert(SWAP_V3_TOPIC.startsWith('0x'));assert(SWAP_AERO_TOPIC.startsWith('0x'));assert.equal(decodeSwap({topics:['0xdead'],data:'0x'},{kind:'v3'}),null);console.log(JSON.stringify({build:'12.9.59',unitAssertionsPassed:3}));if(!process.env.BASE_RPC_URL||!process.env.BASE_FLASHBLOCKS_WSS_URL){console.error('RPC_WSS_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL,process.env.BASE_FLASHBLOCKS_WSS_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('INTELLIGENCE_FAILED',String(e?.message||e).slice(0,120));process.exitCode=1})}
module.exports={run,decodeSwap};
