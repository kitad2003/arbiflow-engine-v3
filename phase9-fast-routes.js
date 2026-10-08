'use strict';
// Phase 9: bounded parallel, read-only two-leg cross-venue Base quote diagnostics.
const {Interface}=require('ethers');
const phase92=require('./phase92-trigger');
const TOKENS={USDC:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH:'0x4200000000000000000000000000000000000006'};
const VENUES=[
 {name:'UNISWAP_V3_500',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoter:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',fee:500},
 {name:'UNISWAP_V3_3000',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoter:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',fee:3000},
 {name:'PANCAKE_V3_500',factory:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',quoter:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',fee:500}
];
const f=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const p=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function liquidity() view returns(uint128)']);
const q=new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const err=e=>String(e?.shortMessage||e?.message||e).slice(0,140);
const safety={readOnly:true,mainnetBroadcast:false,executionEligible:false,atomicSimulation:false};
async function mapLimit(items,limit,fn){const results=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;try{results[i]=await fn(items[i],i)}catch(e){results[i]={error:err(e)}}}}));return results}
function mount(app,{getBaseChain,rpc}){
 const state={running:false,runs:0,lastResult:null,lastCompletedAt:null};
 async function run(){
  const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');
  const block=await rpc(chain,'eth_blockNumber',[]);
  const call=async(to,iface,fn,args)=>iface.decodeFunctionResult(fn,await rpc(chain,'eth_call',[{to,data:iface.encodeFunctionData(fn,args)},block]));
  const pools=await mapLimit(VENUES,2,async v=>{
   const [addr]=await call(v.factory,f,'getPool',[TOKENS.USDC,TOKENS.WETH,v.fee]);
   if(!addr||/^0x0{40}$/i.test(addr))return {...v,status:'NO_POOL'};
   const [[t0],[t1],[liq]]=await Promise.all([call(addr,p,'token0',[]),call(addr,p,'token1',[]),call(addr,p,'liquidity',[])]);
   if(![t0.toLowerCase(),t1.toLowerCase()].includes(TOKENS.USDC.toLowerCase())||![t0.toLowerCase(),t1.toLowerCase()].includes(TOKENS.WETH.toLowerCase()))throw Error('TOKEN_IDENTITY_MISMATCH');
   return {...v,pool:addr,liquidity:liq.toString(),status:liq>0n?'POOL_LIVE':'POOL_EMPTY'};
  });
  const live=pools.filter(x=>x.status==='POOL_LIVE');
  const combinations=live.flatMap(a=>live.filter(b=>a.name!==b.name).map(b=>({buy:a,sell:b})));
  // Adaptive bounded range: 3 coarse points, then up to 2 refinements per route.
  const minUsd=500,maxUsd=50000;
  const initial=[minUsd,Math.round(Math.sqrt(minUsd*maxUsd)),maxUsd];
  let quoteCalls=0;
  const routes=await mapLimit(combinations,2,async({buy,sell})=>{
   const base={route:'USDC>WETH>USDC',venues:[buy.name,sell.name],pools:[buy.pool,sell.pool],qualified:false,netProfitUsd:null,atomicSimulation:false};
   const samples=[];
   async function sample(sizeUsdc){
    try{
     const input=BigInt(Math.round(sizeUsdc*1e6));
     quoteCalls++;
     const [weth]=await call(buy.quoter,q,'quoteExactInputSingle',[[TOKENS.USDC,TOKENS.WETH,input,buy.fee,0]]);
     if(weth<=0n)throw Error('ZERO_WETH_QUOTE');
     quoteCalls++;
     const [usdc]=await call(sell.quoter,q,'quoteExactInputSingle',[[TOKENS.WETH,TOKENS.USDC,weth,sell.fee,0]]);
     const grossProfitUsd=Number(usdc-input)/1e6;
     const result={sizeUsdc,grossProfitUsd,grossSpreadPct:100*grossProfitUsd/sizeUsdc,wethOutputRaw:weth.toString(),usdcReturnedRaw:usdc.toString()};
     samples.push(result);return result;
    }catch(e){const result={sizeUsdc,error:err(e)};samples.push(result);return result}
   }
   for(const size of initial)await sample(size);
   const ranked=()=>samples.filter(s=>Number.isFinite(s.grossProfitUsd)).sort((a,b)=>b.grossProfitUsd-a.grossProfitUsd);
   const bestCoarse=ranked()[0];
   if(bestCoarse){
    const sizes=initial.slice().sort((a,b)=>a-b);
    const index=sizes.indexOf(bestCoarse.sizeUsdc);
    const neighbors=[sizes[index-1],sizes[index+1]].filter(Number.isFinite);
    for(const n of neighbors.slice(0,2)){
     const refined=Math.round(Math.sqrt(n*bestCoarse.sizeUsdc));
     if(refined>minUsd&&refined<maxUsd&&!samples.some(s=>s.sizeUsdc===refined))await sample(refined);
    }
   }
   const best=ranked()[0];
   return {...base,status:best?'INDICATIVE_ONLY':'QUOTE_FAILED',sizeUsdc:best?.sizeUsdc??null,grossProfitUsd:best?.grossProfitUsd??null,grossSpreadPct:best?.grossSpreadPct??null,wethOutputRaw:best?.wethOutputRaw,usdcReturnedRaw:best?.usdcReturnedRaw,tradeSizeRange:{minUsd,maxUsd,method:'ADAPTIVE_COARSE_PLUS_REFINEMENT'},samples,reason:'GAS_SLIPPAGE_FLASH_ELIGIBILITY_AND_ATOMIC_EXECUTION_UNVERIFIED'};
  });
  return {success:true,stage:'ADAPTIVE_SIZE_TWO_SWAP_DIAGNOSTICS',chainId:8453,blockNumber:Number(BigInt(block)),concurrency:{poolDiscovery:2,routeQuoting:3},venuesChecked:VENUES.length,pools,routeCount:routes.length,quoteCalls,tradeSizeRange:{minUsd,maxUsd,method:'ADAPTIVE_COARSE_PLUS_REFINEMENT'},positiveIndicativeRoutes:routes.filter(r=>r.grossProfitUsd>0).length,qualified:0,alertsEmitted:0,routes,limitations:['NO_V3_USD_DEPTH_PROOF','QUOTES_NOT_ATOMIC','NO_GAS_OR_SLIPPAGE_NETTING','FLASH_LOAN_ELIGIBILITY_UNVERIFIED','NO_EXECUTION'],safety};
 }
 async function eventRequote(event){
  if(state.running)return;
  state.running=true;state.runs++;
  try{state.lastResult=await run();state.lastResult.trigger={type:'CONFIRMED_SWAP',pool:event.pool,blockNumber:event.blockNumber,transactionHash:event.transactionHash};}
  catch(e){state.lastResult={success:false,error:err(e),safety}}
  finally{state.running=false;state.lastCompletedAt=new Date().toISOString()}
 }
 phase92.register(eventRequote);
 app.get('/api/phase92/status',(_req,res)=>res.json({success:true,...phase92.status(),quoteEngineRunning:state.running,lastCompletedAt:state.lastCompletedAt,lastResultSummary:state.lastResult?{success:state.lastResult.success,blockNumber:state.lastResult.blockNumber,routeCount:state.lastResult.routeCount,positiveIndicativeRoutes:state.lastResult.positiveIndicativeRoutes,qualified:state.lastResult.qualified,trigger:state.lastResult.trigger,error:state.lastResult.error}:null,safety}));
 app.get('/api/phase9/status',(_req,res)=>res.json({success:true,...state,safety}));
 app.get('/api/phase9/run',(_req,res)=>{if(state.running)return res.status(409).json({success:false,error:'RUNNING',safety});state.running=true;state.runs++;setImmediate(async()=>{try{state.lastResult=await run()}catch(e){state.lastResult={success:false,error:err(e),safety}}finally{state.running=false;state.lastCompletedAt=new Date().toISOString()}});res.json({success:true,status:'STARTED_BACKGROUND',statusRoute:'/api/phase9/status',safety})});
}
module.exports={mount,mapLimit};
