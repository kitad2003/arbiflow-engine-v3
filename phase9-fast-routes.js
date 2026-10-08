'use strict';
const {Interface}=require('ethers');
const phase92=require('./phase92-trigger');
const phase91=require('./phase91-events');
const TOKENS={USDC:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH:'0x4200000000000000000000000000000000000006',DAI:'0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',cbBTC:'0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',USDT:'0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',LINK:'0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196'};
const VENUES=[
 {name:'UNISWAP_V3_500',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoter:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',fee:500},
 {name:'UNISWAP_V3_3000',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoter:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',fee:3000},
 {name:'PANCAKE_V3_500',factory:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',quoter:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',fee:500}
];
const AERO={name:'AERODROME_VOLATILE',kind:'AERODROME',factory:'0x420DD381b31aEf6683db6B902084cB0FFECe40Da',router:'0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',stable:false};
VENUES.push(AERO);
const af=new Interface(['function getPool(address,address,bool) view returns(address)']);
const ar=new Interface(['function getReserves(address,address,bool,address) view returns(uint256,uint256)','function getAmountsOut(uint256,(address from,address to,bool stable,address factory)[]) view returns(uint256[])']);
const f=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const erc20=new Interface(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)']);
const p=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function liquidity() view returns(uint128)']);
const q=new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const err=e=>String(e?.shortMessage||e?.message||e).slice(0,140);
const BUILD='9.9.6';
const RPC_TIMEOUT_MS=12000;
const SCAN_TIMEOUT_MS=180000;
const timeout=(promise,ms,label)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'_TIMEOUT_'+ms+'MS')),ms)})]).finally(()=>clearTimeout(timer))};
const safety={readOnly:true,mainnetBroadcast:false,executionEligible:false,atomicSimulation:false};
async function mapLimit(items,limit,fn,shouldStop=()=>false){const results=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length&&!shouldStop()){const i=next++;try{results[i]=await fn(items[i],i)}catch(e){results[i]={error:err(e)}}}}));return results}
function mount(app,{getBaseChain,rpc}){
 const state={running:false,runs:0,lastResult:null,lastCompletedAt:null,startedAt:null,progress:{stage:'IDLE',updatedAt:null},partial:null};
 const poolCache=new Map();
 const cacheTtlMs=30*60*1000;
 let activePromise=null;
 const progress=(stage,details={})=>{state.progress={stage,updatedAt:new Date().toISOString(),...details}};
 async function execute(trigger){if(activePromise)return;state.running=true;state.runs++;state.startedAt=new Date().toISOString();state.partial={triangleRoutes:[],triangleQuote:{completed:0,total:0,failed:0},poolDiscovery:{completed:0,total:0},twoLegRoutes:[]};progress('STARTING');const signal={aborted:false};const work=run(signal);activePromise=work;try{state.lastResult=await timeout(work,SCAN_TIMEOUT_MS,'SCAN');if(trigger)state.lastResult.trigger=trigger;progress('COMPLETED')}catch(e){signal.aborted=true;state.lastResult={success:false,error:err(e),stage:state.progress.stage,partial:state.partial,safety};progress('FAILED',{error:err(e)})}finally{if(signal.aborted){await Promise.race([work.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,RPC_TIMEOUT_MS+1000))])}activePromise=null;state.running=false;state.lastCompletedAt=new Date().toISOString()}}
 async function run(signal){
  const check=()=>{if(signal.aborted)throw Error('SCAN_ABORTED')};
  const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');
  progress('FETCH_BLOCK');
  const block=await timeout(rpc(chain,'eth_blockNumber',[]),RPC_TIMEOUT_MS,'RPC_BLOCK');
  const call=async(to,iface,fn,args)=>{check();const result=await timeout(rpc(chain,'eth_call',[{to,data:iface.encodeFunctionData(fn,args)},block]),RPC_TIMEOUT_MS,'RPC_ETH_CALL');check();return iface.decodeFunctionResult(fn,result)};
  const markets=['WETH','DAI','cbBTC','USDT'];
  progress('TOKEN_DECIMALS');
  const tokenDecimals={};
  for(const asset of markets){const [decimals]=await call(TOKENS[asset],erc20,'decimals',[]);const d=Number(decimals);if(!Number.isInteger(d)||d<0||d>36)throw Error('INVALID_TOKEN_DECIMALS_'+asset);tokenDecimals[asset]=d;}
  const minUsd=500,maxUsd=50000;
  const minReserveUsdc=BigInt(minUsd*10)*1000000n;
  progress('DISCOVER_TWO_LEG_POOLS');
  const pools=await mapLimit(markets.flatMap(asset=>VENUES.map(v=>({...v,asset}))),2,async v=>{
   const [addr]=v.kind==='AERODROME'?await call(v.factory,af,'getPool',[TOKENS.USDC,TOKENS[v.asset],v.stable]):await call(v.factory,f,'getPool',[TOKENS.USDC,TOKENS[v.asset],v.fee]);
   if(!addr||/^0x0{40}$/i.test(addr))return {...v,status:'NO_POOL'};
   if(v.kind==='AERODROME'){
    const [reserveA,reserveB]=await call(v.router,ar,'getReserves',[TOKENS.USDC,TOKENS[v.asset],v.stable,v.factory]);
    return {...v,pool:addr,reserveUsdcRaw:reserveA.toString(),reserveAssetRaw:reserveB.toString(),status:reserveA===0n||reserveB===0n?'POOL_EMPTY':reserveA<minReserveUsdc?'INSUFFICIENT_USDC_RESERVE':'POOL_LIVE'};
   }
   const [[t0],[t1],[liq]]=await Promise.all([call(addr,p,'token0',[]),call(addr,p,'token1',[]),call(addr,p,'liquidity',[])]);
   if(![t0.toLowerCase(),t1.toLowerCase()].includes(TOKENS.USDC.toLowerCase())||![t0.toLowerCase(),t1.toLowerCase()].includes(TOKENS[v.asset].toLowerCase()))throw Error('TOKEN_IDENTITY_MISMATCH');
   const [usdcBalance]=await call(TOKENS.USDC,erc20,'balanceOf',[addr]);
   return {...v,pool:addr,liquidity:liq.toString(),reserveUsdcRaw:usdcBalance.toString(),status:liq===0n?'POOL_EMPTY':usdcBalance<minReserveUsdc?'INSUFFICIENT_USDC_RESERVE':'POOL_LIVE'};
  });
  // Phase 9.9: bounded, read-only triangular route experiment.
  // Uses existing verified Base token addresses; every leg is independently pool-discovered.
  const triangleAssets=['WETH','LINK'];
  const triangleEdges=[['USDC','LINK'],['LINK','WETH'],['WETH','USDC']];
  const triangleCandidates=triangleEdges.flatMap(([from,to])=>VENUES.map(v=>({from,to,...v})));
  progress('DISCOVER_TRIANGLE_POOLS');
  let triangleDiscovered=0;
  state.partial.poolDiscovery.total=triangleCandidates.length;
  const trianglePools=await mapLimit(triangleCandidates,2,async v=>{check();
   const cacheKey=[v.from,v.to,v.name].join(':');const cached=poolCache.get(cacheKey);
   if(cached&&Date.now()-cached.at<cacheTtlMs){triangleDiscovered++;state.partial.poolDiscovery.completed=triangleDiscovered;progress('DISCOVER_TRIANGLE_POOLS',{completed:triangleDiscovered,total:triangleCandidates.length,cached:true});return cached.value;}
   try{
   const [addr]=v.kind==='AERODROME'
    ?await call(v.factory,af,'getPool',[TOKENS[v.from],TOKENS[v.to],v.stable])
    :await call(v.factory,f,'getPool',[TOKENS[v.from],TOKENS[v.to],v.fee]);
   if(!addr||/^0x0{40}$/i.test(addr)){const value={...v,status:'NO_POOL'};poolCache.set(cacheKey,{at:Date.now(),value});return value;}
   if(v.kind==='AERODROME'){
    const [a,b]=await call(v.router,ar,'getReserves',[TOKENS[v.from],TOKENS[v.to],v.stable,v.factory]);
    const value={...v,pool:addr,status:a>0n&&b>0n?'POOL_LIVE':'POOL_EMPTY'};poolCache.set(cacheKey,{at:Date.now(),value});return value;
   }
   const [[t0],[t1],[liq]]=await Promise.all([call(addr,p,'token0',[]),call(addr,p,'token1',[]),call(addr,p,'liquidity',[])]);
   if(![t0.toLowerCase(),t1.toLowerCase()].includes(TOKENS[v.from].toLowerCase())||![t0.toLowerCase(),t1.toLowerCase()].includes(TOKENS[v.to].toLowerCase()))throw Error('TRIANGLE_TOKEN_IDENTITY_MISMATCH');
   const value={...v,pool:addr,status:liq>0n?'POOL_LIVE':'POOL_EMPTY'};poolCache.set(cacheKey,{at:Date.now(),value});return value;
   }finally{triangleDiscovered++;state.partial.poolDiscovery.completed=triangleDiscovered;progress('DISCOVER_TRIANGLE_POOLS',{completed:triangleDiscovered,total:triangleCandidates.length});}
  },()=>signal.aborted);
  check();
  const triangleLive=trianglePools.filter(v=>v&&v.status==='POOL_LIVE');
  const oriented=(from,to)=>triangleLive.filter(v=>(v.from===from&&v.to===to)||(v.from===to&&v.to===from)).map(v=>({...v,from,to}));
  const triangleDirections=[['USDC','LINK','WETH','USDC'],['USDC','WETH','LINK','USDC']];
  const triangleRoutes=[];
  const triangleTradeSizesUsd=[25,50,100];
  let triangleQuoteCalls=0;
  const quoteTiming={calls:0,totalMs:0,maxMs:0};
  async function triangleQuote(v,amount){
   const started=Date.now();
   try{
    if(v.kind==='AERODROME'){
     const [amounts]=await call(v.router,ar,'getAmountsOut',[amount,[[TOKENS[v.from],TOKENS[v.to],v.stable,v.factory]]]);
     return amounts[amounts.length-1];
    }
    const [output]=await call(v.quoter,q,'quoteExactInputSingle',[[TOKENS[v.from],TOKENS[v.to],amount,v.fee,0]]);
    return output;
   }finally{const ms=Date.now()-started;quoteTiming.calls++;quoteTiming.totalMs+=ms;quoteTiming.maxMs=Math.max(quoteTiming.maxMs,ms)}
  }
  // Limit permutations and RPC usage; one $500 quote per route at a pinned block.
  progress('QUOTE_TRIANGLES');
  const triangleQuoteBudget=2;
  for(const path of triangleDirections){
   const legs=[0,1,2].map(i=>oriented(path[i],path[i+1]));
   const candidates=[];
   for(const a of legs[0])for(const b of legs[1])for(const c of legs[2]){
    if(candidates.length<triangleQuoteBudget)candidates.push([a,b,c]);
   }
   state.partial.triangleQuote.total+=candidates.length*triangleTradeSizesUsd.length;
   const jobs=candidates.flatMap(trio=>triangleTradeSizesUsd.map(sizeUsdc=>({trio,sizeUsdc})));
   const results=await mapLimit(jobs,2,async({trio,sizeUsdc})=>{check();
    const base={route:path.join('>'),venues:trio.map(v=>v.name),pools:trio.map(v=>v.pool),sizeUsdc,qualified:false,netProfitUsd:null,atomicSimulation:false,status:'INDICATIVE_ONLY'};
    try{
     const input=BigInt(sizeUsdc)*1000000n;
     let amount=input;
     const legQuotes=[];
     for(const leg of trio){check();const amountIn=amount;triangleQuoteCalls++;amount=await triangleQuote(leg,amount);if(amount<=0n)throw Error('ZERO_OUTPUT');legQuotes.push({from:leg.from,to:leg.to,venue:leg.name,amountInRaw:amountIn.toString(),amountOutRaw:amount.toString(),feeTier:leg.fee??null});}
     const grossProfitUsd=Number(amount-input)/1e6;
     const value={...base,grossProfitUsd,grossSpreadPct:100*grossProfitUsd/sizeUsdc,usdcReturnedRaw:amount.toString(),legQuotes};
     state.partial.triangleRoutes.push(value);return value;
    }catch(e){const value={...base,status:'QUOTE_FAILED',error:err(e),grossProfitUsd:null,grossSpreadPct:null};state.partial.triangleRoutes.push(value);state.partial.triangleQuote.failed++;return value}
    finally{state.partial.triangleQuote.completed++;progress('QUOTE_TRIANGLES',{...state.partial.triangleQuote})}
   },()=>signal.aborted);
   triangleRoutes.push(...results);
  }
  const validTriangle=triangleRoutes.filter(r=>r&&Number.isFinite(r.grossProfitUsd));
  const bestTriangle=validTriangle.slice().sort((a,b)=>b.grossProfitUsd-a.grossProfitUsd)[0]??null;
  const splitComparisons=[];
  const full100=validTriangle.filter(r=>r.sizeUsdc===100);
  const half50=validTriangle.filter(r=>r.sizeUsdc===50);
  for(const single of full100){
   for(let i=0;i<half50.length;i++)for(let j=i+1;j<half50.length;j++){
    const a=half50[i],b=half50[j];
    if(a.route!==single.route||b.route!==single.route)continue;
    const pa=new Set(a.pools.map(x=>x.toLowerCase()));
    if(b.pools.some(x=>pa.has(x.toLowerCase())))continue;
    const combinedReturnRaw=BigInt(a.usdcReturnedRaw)+BigInt(b.usdcReturnedRaw);
    const combinedGrossUsd=Number(combinedReturnRaw-100000000n)/1e6;
    splitComparisons.push({route:single.route,sizeUsdc:100,splitSizesUsd:[50,50],splitVenues:[a.venues,b.venues],splitPools:[a.pools,b.pools],singleGrossProfitUsd:single.grossProfitUsd,splitGrossProfitUsd:combinedGrossUsd,grossImprovementUsd:combinedGrossUsd-single.grossProfitUsd,netProfitUsd:null,executionEligible:false,reason:'DISJOINT_POOLS_QUOTED_AT_SAME_BLOCK_NOT_ATOMIC_AND_GAS_UNVERIFIED'});
   }
  }
  const triangleSizing={method:'BOUNDED_GROSS_SIZE_SEARCH',testedSizesUsd:triangleTradeSizesUsd,bestGrossRoute:bestTriangle,bestPositiveGrossRoute:validTriangle.filter(r=>r.grossProfitUsd>0).sort((a,b)=>b.grossProfitUsd-a.grossProfitUsd)[0]??null,netOptimalSizeUsd:null,breakEvenSizeUsd:null,reason:'GAS_AND_ATOMIC_EXECUTION_NOT_VERIFIED'};
  state.partial.triangleSizing=triangleSizing;
  state.partial.splitComparison={tested:splitComparisons.length,comparisons:splitComparisons,limitation:splitComparisons.length?'GAS_AND_ATOMIC_EXECUTION_UNVERIFIED':'NO_FULLY_DISJOINT_POOL_ROUTE_PAIRS_WITH_COMPLETE_50_AND_100_USD_QUOTES'};
  phase91.registerPools(pools);
  const live=pools.filter(x=>x.status==='POOL_LIVE');
  const combinations=live.flatMap(a=>live.filter(b=>a.asset===b.asset&&a.name!==b.name).map(b=>({buy:a,sell:b})));
  const initial=[minUsd,Math.round(Math.sqrt(minUsd*maxUsd)),maxUsd];
  let quoteCalls=0;
  const quote=async(v,from,to,amount)=>{if(v.kind==='AERODROME'){const [amounts]=await call(v.router,ar,'getAmountsOut',[amount,[[from,to,v.stable,v.factory]]]);return amounts[amounts.length-1]}const [output]=await call(v.quoter,q,'quoteExactInputSingle',[[from,to,amount,v.fee,0]]);return output};
  progress('QUOTE_TWO_LEG_ROUTES',{triangleRoutesChecked:triangleRoutes.length});
  check();
  const routes=await mapLimit(combinations,2,async({buy,sell})=>{check();
   const base={route:'USDC>'+buy.asset+'>USDC',asset:buy.asset,venues:[buy.name,sell.name],pools:[buy.pool,sell.pool],qualified:false,netProfitUsd:null,atomicSimulation:false};
   const samples=[];
   async function sample(sizeUsdc){
    try{
     const input=BigInt(Math.round(sizeUsdc*1e6));
     quoteCalls++;
     const weth=await quote(buy,TOKENS.USDC,TOKENS[buy.asset],input);
     if(weth<=0n)throw Error('ZERO_ASSET_QUOTE');
     quoteCalls++;
     const usdc=await quote(sell,TOKENS[buy.asset],TOKENS.USDC,weth);
     const grossProfitUsd=Number(usdc-input)/1e6;
     const result={sizeUsdc,grossProfitUsd,grossSpreadPct:100*grossProfitUsd/sizeUsdc,wethOutputRaw:weth.toString(),usdcReturnedRaw:usdc.toString()};
     samples.push(result);return result;
    }catch(e){const result={sizeUsdc,error:err(e)};samples.push(result);return result}
   }
   const screening=await sample(minUsd);
   const sane=!['DAI','USDT'].includes(buy.asset)||(BigInt(screening.wethOutputRaw||0)>0n&&Number(BigInt(screening.wethOutputRaw||0))/10**tokenDecimals[buy.asset]>=minUsd*0.95&&Number(BigInt(screening.wethOutputRaw||0))/10**tokenDecimals[buy.asset]<=minUsd*1.05);
   const promising=sane&&Number.isFinite(screening.grossSpreadPct)&&screening.grossSpreadPct>0;
   if(promising)for(const size of initial.filter(x=>x!==minUsd))await sample(size);
   const ranked=()=>samples.filter(s=>Number.isFinite(s.grossProfitUsd)).sort((a,b)=>b.grossProfitUsd-a.grossProfitUsd);
   const bestCoarse=ranked()[0];
   if(promising&&bestCoarse){
    const sizes=initial.slice().sort((a,b)=>a-b);
    const index=sizes.indexOf(bestCoarse.sizeUsdc);
    const neighbors=[sizes[index-1],sizes[index+1]].filter(Number.isFinite);
    for(const n of neighbors.slice(0,2)){
     const refined=Math.round(Math.sqrt(n*bestCoarse.sizeUsdc));
     if(refined>minUsd&&refined<maxUsd&&!samples.some(s=>s.sizeUsdc===refined))await sample(refined);
    }
   }
   const best=ranked()[0];
   const output={...base,status:best?'INDICATIVE_ONLY':'QUOTE_FAILED',sizeUsdc:best?.sizeUsdc??null,grossProfitUsd:best?.grossProfitUsd??null,grossSpreadPct:best?.grossSpreadPct??null,wethOutputRaw:best?.wethOutputRaw,usdcReturnedRaw:best?.usdcReturnedRaw,tradeSizeRange:{minUsd,maxUsd,method:'SCREEN_THEN_ADAPTIVE_REFINEMENT'},screening:{sizeUsdc:minUsd,passed:promising,criterion:'POSITIVE_GROSS_SPREAD_AND_STABLECOIN_SANITY_AT_MIN_SIZE',stablecoinSanityPassed:sane},samples,reason:'GAS_SLIPPAGE_FLASH_ELIGIBILITY_AND_ATOMIC_EXECUTION_UNVERIFIED'};state.partial.twoLegRoutes.push(output);return output;
  },()=>signal.aborted);
  return {success:true,stage:'PHASE990_TRIANGULAR_EXPERIMENT',build:BUILD,chainId:8453,blockNumber:Number(BigInt(block)),concurrency:{poolDiscovery:2,routeQuoting:2},venuesChecked:VENUES.length,marketsChecked:markets,tokenDecimals,minUsdcReserveUsd:Number(minReserveUsdc)/1e6,poolExclusions:pools.filter(x=>x.status==='INSUFFICIENT_USDC_RESERVE').length,livePools:live.length,livePoolsByAsset:Object.fromEntries(markets.map(asset=>[asset,live.filter(p=>p.asset===asset).length])),pools,routeCount:routes.length,quoteCalls,triangleExperiment:{readOnly:true,assets:triangleAssets,tradeSizesUsd:triangleTradeSizesUsd,sizing:triangleSizing,splitComparison:state.partial.splitComparison,quoteTiming:{...quoteTiming,averageMs:quoteTiming.calls?Math.round(quoteTiming.totalMs/quoteTiming.calls):null},poolsDiscovered:trianglePools.length,livePools:triangleLive.length,routeCount:triangleRoutes.length,quoteCalls:triangleQuoteCalls,positiveIndicativeRoutes:triangleRoutes.filter(r=>r.grossProfitUsd>0).length,routes:triangleRoutes,limitations:['NO_GAS_NETTING','NOT_ATOMIC','NO_TOKEN_SAFETY_VERIFICATION','NOT_EXECUTION_ELIGIBLE']},tradeSizeRange:{minUsd,maxUsd,method:'SCREEN_THEN_ADAPTIVE_REFINEMENT'},screenedOutRoutes:routes.filter(r=>r.screening&&!r.screening.passed).length,positiveIndicativeRoutes:routes.filter(r=>r.grossProfitUsd>0).length,qualified:0,alertsEmitted:0,routes,limitations:['USDC_BALANCE_GATE_NOT_FULL_DEPTH_PROOF','QUOTES_NOT_ATOMIC','NO_GAS_OR_SLIPPAGE_NETTING','FLASH_LOAN_ELIGIBILITY_UNVERIFIED','NO_EXECUTION'],safety};
 }
 async function eventRequote(event){if(state.running)return;await execute({type:'CONFIRMED_SWAP',pool:event.pool,blockNumber:event.blockNumber,transactionHash:event.transactionHash})}
 phase92.register(eventRequote);
 app.get('/api/phase92/status',(_req,res)=>res.json({success:true,...phase92.status(),quoteEngineRunning:state.running,lastCompletedAt:state.lastCompletedAt,lastResultSummary:state.lastResult?{success:state.lastResult.success,blockNumber:state.lastResult.blockNumber,routeCount:state.lastResult.routeCount,positiveIndicativeRoutes:state.lastResult.positiveIndicativeRoutes,qualified:state.lastResult.qualified,trigger:state.lastResult.trigger,error:state.lastResult.error}:null,safety}));
 app.get('/api/phase9/status',(_req,res)=>res.json({success:true,build:BUILD,...state,cache:{trianglePools:poolCache.size,ttlMinutes:30,scope:'PROCESS_MEMORY'},safety}));
 app.get('/api/phase9/run',(_req,res)=>{if(state.running||activePromise)return res.status(409).json({success:false,error:'RUNNING',progress:state.progress,startedAt:state.startedAt,safety});state.running=true;setImmediate(()=>execute());res.json({success:true,status:'STARTED_BACKGROUND',statusRoute:'/api/phase9/status',safety})});
}
module.exports={mount,mapLimit};
