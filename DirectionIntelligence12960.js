'use strict';
// 12.9.60 direction-aware event observations. Read only; no execution.
const fs=require('node:fs'),assert=require('node:assert/strict'),WebSocket=require('ws'),{ethers}=require('ethers');
const {cachedRegistry,routesFor}=require('./EventWatch12951');
const {decodeSwap}=require('./TransactionIntelligence12959');
const {TOKENS}=require('./PoolUniverse12939');
const {RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const LOAN=10000000000n,PROBE=100000000n;
function direction(swap,token0,token1){
 if(!swap)return null;
 const zeroIn=swap.kind==='V3_SWAP'?swap.token0In:BigInt(swap.amount0InRaw)>0n;
 const oneIn=swap.kind==='V3_SWAP'?swap.token1In:BigInt(swap.amount1InRaw)>0n;
 if(zeroIn===oneIn)return null;
 return {inputToken:zeroIn?token0:token1,outputToken:zeroIn?token1:token0};
}
function rank(route,poolAddress,dir){
 if(!dir)return -1;
 const isFirst=route.first.address.toLowerCase()===poolAddress;
 const base=TOKENS.USDC.toLowerCase(),sold=dir.inputToken.toLowerCase();
 // Buying intermediate cheaply after token sales; selling it after quote-asset sales
 // are only hints. The exact quotes determine profitability.
 return (isFirst&&sold!==base)?2:(!isFirst&&sold===base)?2:1;
}
async function run(rpc,wss){
 assert(/^https:\/\//.test(rpc||''),'RPC_REQUIRED');assert(/^wss:\/\//.test(wss||''),'WSS_REQUIRED');
 const reg=await cachedRegistry(rpc),p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),pacer=new RpcPacer({gapMs:90,parallel:2,retries:2});
 try{
  const routes=routesFor(reg.pools,3000).selected,block=await p.getBlockNumber(),pools=new Map(),index=new Map();
  for(const r of routes)for(const pool of [r.first,r.second]){const k=pool.address.toLowerCase();pools.set(k,pool);if(!index.has(k))index.set(k,[]);index.get(k).push(r)}
  const q=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,ABI,p)])),v1=new Map();
  async function quote(pool,a,b,amount,tag){
   if(pool.kind==='v1'){const k=pool.address.toLowerCase();if(!v1.has(k))v1.set(k,new ethers.Contract(pool.address,V1,p));return BigInt(await pacer.run(()=>v1.get(k).getAmountOut(amount,TOKENS[a],{blockTag:tag})))}
   return BigInt((await pacer.run(()=>q[pool.dex].quoteExactInputSingle.staticCall([TOKENS[a],TOKENS[b],amount,Number(pool.poolConfig),0],{blockTag:tag})))[0]);
  }
  // Reuse screened first-leg quotes and exclude known first-leg exhaustion.
  const first=new Map();
  for(const r of routes)first.set(r.first.address.toLowerCase(),r);
  const usable=new Map();
  for(const [k,r] of first){
   try{const a=await quote(r.first,'USDC',r.token,PROBE,block),b=await quote(r.first,'USDC',r.token,LOAN,block);usable.set(k,a>0n&&b*100n/a>=1000n)}
   catch{usable.set(k,false)}
  }
  const watches=new Map();for(const [key,rs] of index){const filtered=rs.filter(r=>usable.get(r.first.address.toLowerCase()));if(filtered.length)watches.set(key,filtered)}
  const info=new Map(),tokenAbi=['function token0() view returns(address)','function token1() view returns(address)'];
  for(const [k,pool] of pools){if(!watches.has(k))continue;try{const c=new ethers.Contract(pool.address,tokenAbi,p);const [a,b]=await Promise.all([pacer.run(()=>c.token0({blockTag:block})),pacer.run(()=>c.token1({blockTag:block}))]);info.set(k,[a,b])}catch{}}
  const obs=[],busy=new Set(),jobs=[],stats={events:0,decoded:0,unrecognized:0,coalesced:0,firstQuotes:0,secondQuotes:0,failedQuotes:0,priorityEvents:0};
  if(watches.size)await new Promise((resolve,reject)=>{
   const ws=new WebSocket(wss,{handshakeTimeout:10000});let finished=false,ack=false;
   const timer=setTimeout(()=>finish(),30000);
   function finish(err){if(finished)return;finished=true;clearTimeout(timer);ws.close();err?reject(err):resolve()}
   ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:12960,method:'eth_subscribe',params:['pendingLogs',{address:[...watches.keys()]}]})));
   ws.on('error',e=>finish(Error(String(e.message).slice(0,100))));ws.on('close',()=>finish());
   ws.on('message',buf=>{
    let m;try{m=JSON.parse(String(buf))}catch{return}
    if(m.id===12960){if(m.error)finish(Error('SUBSCRIPTION_REJECTED'));else ack=true;return}
    if(!ack||m.method!=='eth_subscription')return;
    const log=m.params?.result,key=String(log?.address||'').toLowerCase(),pool=pools.get(key),rs=watches.get(key);if(!pool||!rs)return;
    stats.events++;const swap=decodeSwap(log,pool);if(!swap){stats.unrecognized++;return}stats.decoded++;
    if(busy.has(key)){stats.coalesced++;return}if(obs.length+busy.size>=15)return;
    const tokens=info.get(key),dir=tokens?direction(swap,...tokens):null;
    const ordered=[...rs].sort((a,b)=>rank(b,key,dir)-rank(a,key,dir));
    stats.priorityEvents++;busy.add(key);const arrival=Date.now();
    jobs.push((async()=>{
     const chosen=ordered.slice(0,3),firstQuotes=new Map(),rows=[];
     for(const r of chosen){
      const id=r.first.address.toLowerCase();
      try{
       let mid=firstQuotes.get(id);
       if(mid===undefined){const t=Date.now();mid=await quote(r.first,'USDC',r.token,LOAN,'pending');firstQuotes.set(id,mid);stats.firstQuotes++;rows.push({type:'first_quote_timing',pool:id,ms:Date.now()-t})}
       const t=Date.now(),back=await quote(r.second,r.token,'USDC',mid,'pending');stats.secondQuotes++;
       const gross=back-LOAN;
       rows.push({pair:r.pair,firstPool:r.first.address,secondPool:r.second.address,priority:rank(r,key,dir),secondQuoteMs:Date.now()-t,grossUsdc:Number(gross)/1e6,spreadOverHalfPercent:gross*10000n>LOAN*50n,executionEligible:false});
      }catch(e){stats.failedQuotes++;rows.push({pair:r.pair,error:String(e?.shortMessage||e?.message||e).slice(0,90)})}
     }
     obs.push({address:key,swapDirection:dir,eventReceivedAt:new Date(arrival).toISOString(),evaluationMs:Date.now()-arrival,rows});
    })().finally(()=>busy.delete(key)));
   });
  });
  await Promise.allSettled(jobs);
  const report={build:'12.9.60',mode:'DIRECTION_AWARE_EVENT_AUDIT_READ_ONLY',createdAt:new Date().toISOString(),indexedRoutes:routes.length,firstLegPoolsScreened:first.size,firstLegPoolsPassing:[...usable.values()].filter(Boolean).length,watchedPools:watches.size,stats,observations:obs,rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['DIRECTION_IS_HEURISTIC_NOT_PROFIT_PREDICTION','NO_SECOND_LEG_BASELINE_SCREEN','SEQUENTIAL_NON_ATOMIC_QUOTES','NO_GAS_AAVE_SLIPPAGE_OR_FORK_EXECUTION_GATES']};
  fs.writeFileSync('arbiflow-direction-12960.json',JSON.stringify(report,null,2)+'\n');return report;
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(direction({kind:'V3_SWAP',token0In:true,token1In:false},'A','B').inputToken,'A');
 assert.equal(direction({kind:'V3_SWAP',token0In:false,token1In:true},'A','B').inputToken,'B');
 console.log(JSON.stringify({build:'12.9.60',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL||!process.env.BASE_FLASHBLOCKS_WSS_URL){console.error('RPC_AND_WSS_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL,process.env.BASE_FLASHBLOCKS_WSS_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('DIRECTION_AUDIT_FAILED',String(e.message).slice(0,100));process.exitCode=1});
}
module.exports={run,direction,rank};
