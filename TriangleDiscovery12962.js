'use strict';
// 12.9.62 genuine three-pool triangular discovery, plus two-pool comparator.
// Every leg is quoted at the same confirmed Base block. No execution.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'],V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const SIZES=[1000,10000],MAX_TRI=Number(process.env.TRIANGLE_ROUTE_LIMIT||45),MAX_TWO=Number(process.env.COMPARATOR_ROUTE_LIMIT||25);
function triangles(pools){
 const edges=new Map(),found=[],seen=new Set();
 for(const p of pools){
  const [a,b]=p.pair.split('/');for(const [from,to] of [[a,b],[b,a]]){const k=from+'>'+to;if(!edges.has(k))edges.set(k,[]);edges.get(k).push({pool:p,from,to})}
 }
 for(const [k,ab] of edges){const [a,b]=k.split('>');if(a!=='USDC'||b==='USDC')continue;
  for(const first of ab)for(const [middle,bc] of edges){if(!middle.startsWith(b+'>'))continue;const c=middle.split('>')[1];if(c==='USDC'||c===b)continue;
   for(const second of bc)for(const third of edges.get(c+'>USDC')||[]){
    const ids=[first.pool.address,second.pool.address,third.pool.address].map(x=>x.toLowerCase());if(new Set(ids).size!==3)continue;
    const key=ids.join('>');if(seen.has(key))continue;seen.add(key);
    found.push({path:['USDC',b,c,'USDC'],legs:[first,second,third]});
   }
  }
 }
 return found;
}
function summarize(back,loan,feeBps){
 const gross=back-loan,fee=(loan*feeBps+9999n)/10000n;
 return {returnUsdc:Number(back)/1e6,grossUsdc:Number(gross)/1e6,afterAaveBeforeGasUsdc:Number(gross-fee)/1e6,spreadGtHalfPercent:gross*10000n>loan*50n,positiveAfterAave:gross>fee,estimatedNetUsdc:null,executionEligible:false};
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(Number.isSafeInteger(MAX_TRI)&&MAX_TRI>=1&&MAX_TRI<=150,'INVALID_TRIANGLE_LIMIT');assert(Number.isSafeInteger(MAX_TWO)&&MAX_TWO>=1&&MAX_TWO<=150,'INVALID_TWO_LIMIT');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
 try{
  const block=d.confirmedBlock,all=triangles(d.pools),two=routesFor(d.pools,3000),q=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,ABI,provider)])),v1=new Map(),cache=new Map();
  async function quote(pool,from,to,amount){
   const key=pool.address.toLowerCase()+':'+from+':'+amount.toString();if(cache.has(key))return cache.get(key);
   let out;if(pool.kind==='v1'){const addr=pool.address.toLowerCase();if(!v1.has(addr))v1.set(addr,new ethers.Contract(pool.address,V1,provider));out=BigInt(await pacer.run(()=>v1.get(addr).getAmountOut(amount,TOKENS[from],{blockTag:block})))}
   else out=BigInt((await pacer.run(()=>q[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:block})))[0]);
   cache.set(key,out);return out;
  }
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  // Sample across token paths to reduce bias from many fee tiers on one pair.
  function balanced(routes,limit,name){const buckets=new Map();for(const r of routes){const key=name(r);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r)}const out=[];while(out.length<limit){let changed=false;for(const xs of buckets.values()){if(xs.length){out.push(xs.shift());changed=true;if(out.length===limit)break}}if(!changed)break}return out}
  const pickedTri=balanced(all,MAX_TRI,r=>r.path.join('>')),pickedTwo=balanced(two.selected,MAX_TWO,r=>r.pair),results={triangular:[],twoPool:[]};
  for(const item of pickedTri){const row={path:item.path.join('>'),pools:item.legs.map(x=>x.pool.address),dexes:item.legs.map(x=>x.pool.dex),sizes:[]};
   for(const size of SIZES){const amt=BigInt(size)*1000000n,entry={sizeUsdc:size,diagnosticOnly:size<10000};
    try{let out=amt;for(const leg of item.legs)out=await quote(leg.pool,leg.from,leg.to,out);Object.assign(entry,{success:true,...summarize(out,amt,premium)})}
    catch(e){Object.assign(entry,{success:false,error:String(e?.shortMessage||e?.message||e).slice(0,100)})}
    row.sizes.push(entry);
   }results.triangular.push(row);
  }
  for(const item of pickedTwo){const row={path:'USDC>'+item.token+'>USDC',pools:[item.first.address,item.second.address],dexes:[item.first.dex,item.second.dex],sizes:[]};
   for(const size of SIZES){const amt=BigInt(size)*1000000n,entry={sizeUsdc:size,diagnosticOnly:size<10000};
    try{const intermediate=await quote(item.first,'USDC',item.token,amt),back=await quote(item.second,item.token,'USDC',intermediate);Object.assign(entry,{success:true,...summarize(back,amt,premium)})}
    catch(e){Object.assign(entry,{success:false,error:String(e?.shortMessage||e?.message||e).slice(0,100)})}
    row.sizes.push(entry);
   }results.twoPool.push(row);
  }
  const summarizeType=rows=>{const xs=rows.flatMap(r=>r.sizes.map(s=>({...s,path:r.path}))).filter(x=>x.success);return {routesTested:rows.length,quotesCompleted:xs.length,quoteFailures:rows.reduce((n,r)=>n+r.sizes.filter(s=>!s.success).length,0),positiveAfterAave:xs.filter(x=>x.positiveAfterAave).length,spreadGtHalfPercent:xs.filter(x=>x.spreadGtHalfPercent).length,bestBySize:Object.fromEntries(SIZES.map(size=>[size,xs.filter(x=>x.sizeUsdc===size).sort((a,b)=>b.afterAaveBeforeGasUsdc-a.afterAaveBeforeGasUsdc).slice(0,3)]))}};
  const report={build:'12.9.62',mode:'THREE_POOL_TRIANGLE_DISCOVERY_READ_ONLY',createdAt:new Date().toISOString(),block,pools:d.pools.length,triangleRoutesDiscovered:all.length,twoPoolRoutesDiscovered:two.total,loanSizesUsdc:SIZES,aavePremiumBps:premium.toString(),summary:{triangular:summarizeType(results.triangular),twoPool:summarizeType(results.twoPool)},results,rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['SNAPSHOT_NOT_EVENT_DRIVEN','ROUTE_SAMPLE_NOT_EXHAUSTIVE','GAS_L1_SLIPPAGE_NOT_ESTIMATED','NO_FORK_ATOMIC_TEST','EXECUTION_RISK_NOT_CLASSIFIED']};
  fs.writeFileSync('arbiflow-triangles-12962.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,results:undefined}));return report;
 }finally{provider.destroy()}
}
if(require.main===module){
 const p=(pair,address)=>({pair,address,kind:'v3',dex:'X',poolConfig:500});
 assert.equal(triangles([p('USDC/WETH','a'),p('WETH/DAI','b'),p('USDC/DAI','c')]).length,2);
 assert.equal(triangles([p('USDC/WETH','a'),p('USDC/DAI','c')]).length,0);
 assert.equal(summarize(10060000000n,10000000000n,5n).spreadGtHalfPercent,true);
 console.log(JSON.stringify({build:'12.9.62',unitAssertionsPassed:3}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).catch(e=>{console.error('TRIANGLE_AUDIT_FAILED',String(e?.message||e).slice(0,140));process.exitCode=1});
}
module.exports={run,triangles,summarize};
