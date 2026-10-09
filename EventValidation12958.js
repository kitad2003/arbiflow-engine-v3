'use strict';
// 12.9.58 event-driven candidate validation. Diagnostic only.
const assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers'),WebSocket=require('ws');
const {cachedRegistry,routesFor}=require('./EventWatch12951');
const {TOKENS}=require('./PoolUniverse12939');
const {RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const QA=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const VA=['function getAmountOut(uint256,address) view returns(uint256)'];
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',LOAN=10000000000n,PROBE=100000000n;
function passes(gross,fee){return gross>fee&&gross*10000n>LOAN*50n}
async function run(rpc,wss){
 assert(/^https:\/\//.test(rpc||''),'RPC_REQUIRED');assert(/^wss:\/\//.test(wss||''),'WSS_REQUIRED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
 try{
  const registry=await cachedRegistry(rpc),block=await provider.getBlockNumber(),routes=routesFor(registry.pools,3000).selected;
  const q=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,QA,provider)]));
  async function quote(pool,a,b,amount,tag){
   if(pool.kind==='v1')return BigInt(await pacer.run(()=>new ethers.Contract(pool.address,VA,provider).getAmountOut(amount,TOKENS[a],{blockTag:tag})));
   return BigInt((await pacer.run(()=>q[pool.dex].quoteExactInputSingle.staticCall([TOKENS[a],TOKENS[b],amount,Number(pool.poolConfig),0],{blockTag:tag})))[0]);
  }
  const first=new Map();for(const r of routes)first.set(r.first.address.toLowerCase(),r);
  const outputs=new Map();
  for(const [k,r] of first){try{const s=await quote(r.first,'USDC',r.token,PROBE,block),l=await quote(r.first,'USDC',r.token,LOAN,block);outputs.set(k,{large:l,pass:s>0n&&l*100n/s>=1000n})}catch{outputs.set(k,{pass:false})}}
  const candidates=[],rejected={first:0,second:0};
  for(const r of routes){
   const firstResult=outputs.get(r.first.address.toLowerCase());
   if(!firstResult?.pass){rejected.first++;continue}
   try{
    const amt=firstResult.large,s=await quote(r.second,r.token,'USDC',amt/100n||1n,block),l=await quote(r.second,r.token,'USDC',amt,block);
    if(s===0n||l*100n/s<1000n){rejected.second++;continue}
    candidates.push({route:r,baselineGross:l-LOAN});
   }catch{rejected.second++}
  }
  candidates.sort((a,b)=>a.baselineGross>b.baselineGross?-1:a.baselineGross<b.baselineGross?1:0);
  const selected=candidates.slice(0,80),byAddress=new Map();
  for(const x of selected)for(const pool of [x.route.first,x.route.second]){const k=pool.address.toLowerCase();if(!byAddress.has(k))byAddress.set(k,[]);byAddress.get(k).push(x.route)}
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL()),fee=LOAN*premium/10000n;
  const observations=[],busy=new Set(),jobs=[],stats={events:0,matched:0,coalesced:0,quoted:0,failed:0};
  if(byAddress.size)await new Promise((resolve,reject)=>{
   const socket=new WebSocket(wss,{handshakeTimeout:10000});let ended=false;
   const timer=setTimeout(()=>finish(),30000);
   function finish(err){if(ended)return;ended=true;clearTimeout(timer);socket.close();err?reject(err):resolve()}
   socket.on('open',()=>socket.send(JSON.stringify({jsonrpc:'2.0',id:12958,method:'eth_subscribe',params:['pendingLogs',{address:[...byAddress.keys()]}]})));
   socket.on('error',e=>finish(Error(String(e.message).slice(0,80))));
   socket.on('close',()=>finish());
   socket.on('message',data=>{
    let m;try{m=JSON.parse(String(data))}catch{return}
    if(m.id===12958){if(m.error)finish(Error('SUBSCRIPTION_REJECTED'));return}
    if(m.method!=='eth_subscription')return;
    stats.events++;const address=String(m.params?.result?.address||'').toLowerCase(),rs=byAddress.get(address);if(!rs)return;
    stats.matched++;if(busy.has(address)){stats.coalesced++;return}
    if(observations.length+busy.size>=20)return;
    busy.add(address);const start=Date.now();
    jobs.push((async()=>{
     const items=[];for(const r of rs.slice(0,3)){
      try{const mid=await quote(r.first,'USDC',r.token,LOAN,'pending'),back=await quote(r.second,r.token,'USDC',mid,'pending'),gross=back-LOAN;
       items.push({pair:r.pair,afterAaveBeforeGasUsdc:Number(gross-fee)/1e6,spreadGtHalfPercent:gross*10000n>LOAN*50n,positiveAfterAave:gross>fee,preliminaryPass:passes(gross,fee),executionEligible:false});stats.quoted++;
      }catch(e){items.push({pair:r.pair,error:String(e?.shortMessage||e?.message||e).slice(0,90)});stats.failed++}
     }
     observations.push({address,latencyMs:Date.now()-start,items});
    })().finally(()=>busy.delete(address)));
   });
  });
  await Promise.allSettled(jobs);
  const report={build:'12.9.58',mode:'TWO_SIDED_EVENT_VALIDATION_READ_ONLY',createdAt:new Date().toISOString(),block,discoveredPools:registry.pools.length,routesIndexed:routes.length,firstPoolsScreened:first.size,rejected,twoSidedCandidates:candidates.length,watchedCandidates:selected.length,watchedAddresses:byAddress.size,premiumBps:premium.toString(),stats,observations,gasVerified:false,slippageVerified:false,atomicForkVerified:false,riskVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,rpcPacer:pacer.stats};
  fs.writeFileSync('arbiflow-event-validation-12958.json',JSON.stringify(report,null,2)+'\n');return report;
 }finally{provider.destroy()}
}
if(require.main===module){assert(passes(60000000n,5000000n));assert(!passes(50000000n,5000000n));console.log(JSON.stringify({build:'12.9.58',unitAssertionsPassed:2}));if(!process.env.BASE_RPC_URL||!process.env.BASE_FLASHBLOCKS_WSS_URL){console.error('RPC_AND_WSS_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL,process.env.BASE_FLASHBLOCKS_WSS_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('AUDIT_FAILED',String(e.message).slice(0,100));process.exitCode=1})}
module.exports={run,passes};
