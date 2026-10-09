'use strict';
// 12.9.52: bounded, read-only size comparison and durable closest-miss audit.
// Runs after event-watch diagnosis; does not alter its working WebSocket code.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {RpcPacer}=require('./RpcPacer12950');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const SIZES=[10000,25000,35000],MAX=Number(process.env.AUDIT_ROUTE_LIMIT||36),FILE='arbiflow-audit-12952.json';
function entryKey(route){return [route.first.address.toLowerCase(),route.second.address.toLowerCase()].join('>')}
function selectRoutes(routes,limit){
 const buckets=new Map();
 for(const r of routes){if(!buckets.has(r.pair))buckets.set(r.pair,[]);buckets.get(r.pair).push(r)}
 // Fast screening: spread coverage across pairs; an ordering heuristic, not an economics guarantee.
 const out=[];while(out.length<limit){let found=false;for(const bucket of buckets.values()){if(bucket.length){out.push(bucket.shift());found=true;if(out.length>=limit)break}}if(!found)break}
 return out;
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 assert(Number.isSafeInteger(MAX)&&MAX>=1&&MAX<=120,'BAD_AUDIT_ROUTE_LIMIT');
 const discovery=await discover(rpc);assert(discovery.success,'POOL_DISCOVERY_FAILED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await provider.send('eth_chainId',[])),8453n);
  const all=routesFor(discovery.pools,3000),selected=selectRoutes(all.selected,MAX);
  const block=discovery.confirmedBlock,pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const qs=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,ABI,provider)]));
  async function quote(pool,a,b,amount){
   if(pool.kind==='v1')return BigInt(await new ethers.Contract(pool.address,V1,provider).getAmountOut(amount,TOKENS[a],{blockTag:block}));
   return BigInt((await qs[pool.dex].quoteExactInputSingle.staticCall([TOKENS[a],TOKENS[b],amount,Number(pool.poolConfig),0],{blockTag:block}))[0]);
  }
  const results=[];
  for(const r of selected){
   const row={pair:r.pair,path:'USDC>'+r.token+'>USDC',pools:[r.first.address,r.second.address],venues:[r.first.dex,r.second.dex],sizes:[]};
   for(const size of SIZES){
    const principal=BigInt(size)*1000000n,fee=(principal*premium+9999n)/10000n,entry={loanUsdc:size};
    try{
     const mid=await pacer.run(()=>quote(r.first,'USDC',r.token,principal));
     const back=await pacer.run(()=>quote(r.second,r.token,'USDC',mid));
     const gross=back-principal,after=gross-fee;
     Object.assign(entry,{success:true,returnedUsdcRaw:back.toString(),grossProfitRaw:gross.toString(),aaveFeeRaw:fee.toString(),afterAaveBeforeGasRaw:after.toString(),spreadGreaterThanHalfPercent:gross*10000n>principal*50n,qualified:false,remainingGates:['GAS','L1_FEE','SLIPPAGE','ATOMIC_FORK','RISK']});
    }catch(e){entry.success=false;entry.error=String(e?.shortMessage||e?.message||e).slice(0,90)}
    row.sizes.push(entry);
   }
   results.push(row);
  }
  const ranked=results.flatMap(r=>r.sizes.filter(x=>x.success).map(x=>({path:r.path,pools:r.pools,venues:r.venues,loanUsdc:x.loanUsdc,grossProfitRaw:x.grossProfitRaw,aaveFeeRaw:x.aaveFeeRaw,afterAaveBeforeGasRaw:x.afterAaveBeforeGasRaw,spreadGreaterThanHalfPercent:x.spreadGreaterThanHalfPercent}))).sort((a,b)=>BigInt(a.afterAaveBeforeGasRaw)>BigInt(b.afterAaveBeforeGasRaw)?-1:BigInt(a.afterAaveBeforeGasRaw)<BigInt(b.afterAaveBeforeGasRaw)?1:0);
  const record={build:'12.9.52',mode:'INDICATIVE_CLOSEST_MISS_AUDIT',createdAt:new Date().toISOString(),block,discoveredPools:discovery.uniqueActivePools,totalRoutesIndexed:all.total,selectedRoutes:results.length,loanSizesUsdc:SIZES,sampleSizeQuotes:ranked.length,failedQuotes:results.flatMap(x=>x.sizes).filter(x=>!x.success).length,positiveAfterAaveBeforeGas:ranked.filter(x=>BigInt(x.afterAaveBeforeGasRaw)>0n).length,spreadPassing:ranked.filter(x=>x.spreadGreaterThanHalfPercent).length,topClosestMisses:ranked.slice(0,20),rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,warning:'DOES_NOT_PROVE_EVENT_LATENCY_OR_FULL_NET_PROFIT; NO_GAS_SLIPPAGE_ATOMIC_VALIDATION'};
  fs.writeFileSync(FILE,JSON.stringify(record,null,2)+'\n');
  return record;
 }finally{provider.destroy()}
}
if(require.main===module){
 assert.deepEqual(SIZES,[10000,25000,35000]);
 assert.deepEqual(selectRoutes([{pair:'A',id:1},{pair:'A',id:2},{pair:'B',id:3}],2).map(x=>x.id),[1,3]);
 console.log(JSON.stringify({build:'12.9.52',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('AUDIT_12952_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,160));process.exitCode=1});
}
module.exports={run,selectRoutes};
