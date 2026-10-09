'use strict';
// Phase 12.7 read-only Base USDC/WETH direct cross-venue quote reconnaissance.
// The two sequential quotes share a pinned block; they are NOT atomic execution.
// No profit alerts, no wallet, no execution.
const {Interface}=require('ethers');
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH='0x4200000000000000000000000000000000000006';
const uni={name:'UNISWAP_V3',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoter:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2'};
const aero={name:'AERODROME_SLIPSTREAM',factory:'0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A',quoter:'0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0'};
const uniFactory=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const aeroFactory=new Interface(['function getPool(address,address,int24) view returns(address)']);
const uniQuote=new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const aeroQuote=new Interface(['function quoteExactInputSingle(address tokenIn,address tokenOut,int24 tickSpacing,uint256 amountIn,uint160 sqrtPriceLimitX96) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const token0=new Interface(['function token0() view returns(address)']);
const token1=new Interface(['function token1() view returns(address)']);
const liquidity=new Interface(['function liquidity() view returns(uint128)']);
const ZERO='0x0000000000000000000000000000000000000000';
const safety=Object.freeze({readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false});
function safe(e){return String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC_REDACTED]').slice(0,150)}
async function scan(chain,rpc,amountUsdc){
 if(Number(chain?.chainId)!==8453)throw Error('BASE_CHAIN_REQUIRED');
 if(![100,500,1000].includes(amountUsdc))throw Error('INVALID_AMOUNT');
 if(BigInt(await rpc(chain,'eth_chainId',[]))!==8453n)throw Error('RPC_WRONG_CHAIN');
 const block=await rpc(chain,'eth_blockNumber',[]);
 const deadline=Date.now()+90000;
 const bounded=async(method,params)=>{const remaining=deadline-Date.now();if(remaining<=0)throw Error('SCAN_DEADLINE_90000MS');let timer;try{return await Promise.race([rpc(chain,method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPC_TIMEOUT_OR_SCAN_DEADLINE')),Math.min(15000,remaining));})]);}finally{clearTimeout(timer)}};
 const call=async(addr,abi,fn,args=[])=>abi.decodeFunctionResult(fn,await bounded('eth_call',[{to:addr,data:abi.encodeFunctionData(fn,args)},block]));
 // Interleave venues so a slow Uniswap tier cannot consume the entire budget before Aerodrome.
 const possibilities=[
  {...uni,tier:500,factoryAbi:uniFactory,quoterAbi:uniQuote},
  {...aero,tier:100,factoryAbi:aeroFactory,quoterAbi:aeroQuote},
  {...aero,tier:1,factoryAbi:aeroFactory,quoterAbi:aeroQuote},
  {...uni,tier:100,factoryAbi:uniFactory,quoterAbi:uniQuote},
  {...aero,tier:10,factoryAbi:aeroFactory,quoterAbi:aeroQuote},
  {...uni,tier:3000,factoryAbi:uniFactory,quoterAbi:uniQuote},
  {...aero,tier:50,factoryAbi:aeroFactory,quoterAbi:aeroQuote},
  {...aero,tier:200,factoryAbi:aeroFactory,quoterAbi:aeroQuote}
 ];
 const pools=[],failures=[];
 for(const p of possibilities){
  if(Date.now()>=deadline){failures.push({error:'SCAN_DEADLINE_REACHED_DURING_POOL_DISCOVERY'});break;}
  const stepStartedAt=Date.now();
  try{
   const [addr]=await call(p.factory,p.factoryAbi,'getPool',[USDC,WETH,p.tier]);
   if(addr.toLowerCase()===ZERO)continue;
   const [a]=await call(addr,token0,'token0'),[b]=await call(addr,token1,'token1');
   if([a.toLowerCase(),b.toLowerCase()].sort().join(':')!==[USDC.toLowerCase(),WETH.toLowerCase()].sort().join(':'))throw Error('POOL_TOKEN_MISMATCH');
   const [l]=await call(addr,liquidity,'liquidity');if(l===0n)continue;
   pools.push({name:p.name,tier:p.tier,pool:addr,quoter:p.quoter,quoterAbi:p.quoterAbi});
   if(new Set(pools.map(x=>x.name)).size>=2)break; // reserve time for actual cross-venue quotes
  }catch(e){failures.push({venue:p.name,tier:p.tier,error:safe(e),elapsedMs:Date.now()-stepStartedAt})}
 }
 const quote=async(p,from,to,raw)=>{
  const args=p.name==='UNISWAP_V3'?[[from,to,raw,p.tier,0]]:[from,to,p.tier,raw,0];
  const values=await call(p.quoter,p.quoterAbi,'quoteExactInputSingle',args);
  const out=BigInt(values[0]);if(out===0n)throw Error('EMPTY_QUOTE');
  return out;
 };
 const starting=BigInt(amountUsdc)*1000000n,rows=[];
 for(const buy of pools)for(const sell of pools){
  if(Date.now()>=deadline){failures.push({error:'SCAN_DEADLINE_REACHED_DURING_QUOTES'});break;}
  if(buy.name===sell.name)continue;
  const row={buyDex:buy.name,buyTier:buy.tier,buyPool:buy.pool,sellDex:sell.name,sellTier:sell.tier,sellPool:sell.pool,blockTag:block,quoteSuccess:false,qualifiedForDashboard:false,executionEligible:false};
  try{
   row.failedLeg='BUY_USDC_TO_WETH';
   const weth=await quote(buy,USDC,WETH,starting);
   row.buyQuoteSucceeded=true;
   row.failedLeg='SELL_WETH_TO_USDC';
   const returned=await quote(sell,WETH,USDC,weth);
   row.sellQuoteSucceeded=true;
   row.failedLeg=null;
   const gross=returned-starting;
   row.wethOutRaw=weth.toString();row.returnUsdcRaw=returned.toString();
   row.grossUsdcRaw=gross.toString();
   row.spreadAbovePointFivePct=gross*10000n>starting*50n;
   row.quoteSuccess=true;
  }catch(e){row.error=safe(e);row.errorCategory=row.error.includes('reverted')?'QUOTE_EXECUTION_REVERTED':'QUOTE_RPC_ERROR'}
  rows.push(row);
 }
 return {success:pools.length>0,build:'12.7.6',diagnostic:pools.length===0?'NO_VERIFIED_POOLS':new Set(pools.map(x=>x.name)).size<2?'ONLY_ONE_VENUE_VERIFIED':rows.some(x=>x.quoteSuccess)?'CROSS_VENUE_QUOTES_RECEIVED':'CROSS_VENUE_POOLS_FOUND_QUOTES_UNVERIFIED',network:'BASE',pair:'USDC/WETH',blockTag:block,loanSizeUsdc:amountUsdc,verifiedPools:pools.map(({quoterAbi,...rest})=>rest),routes:rows,failures,qualified:0,alerts:[],limitations:['PINNED_BLOCK_INDICATIVE_QUOTES_NOT_ATOMIC','NO_FLASH_LOAN_RESERVATION','NO_GAS_ESTIMATE','NO_PRIORITY_FEE_OR_L2_DATA_FEE','NO_FORK_EXECUTION','NO_DASHBOARD_ALERTS'],safety};
}
function mount(app,{getBaseChain,rpc}){
 let running=false,lastResult=null,lastCheckedAt=null,startedAt=null;
 app.get('/api/phase12/routes/status',(_req,res)=>res.json({success:true,build:'12.7.6',running,startedAt,lastCheckedAt,lastResult,safety}));
 app.get('/api/phase12/routes/probe',(req,res)=>{
  if(running)return res.status(409).json({success:false,error:'ROUTE_PROBE_RUNNING',startedAt,statusRoute:'/api/phase12/routes/status',safety});
  const amount=Number(req.query.amountUsdc||100);
  if(![100,500,1000].includes(amount))return res.status(400).json({success:false,error:'ALLOWED_AMOUNTS_100_500_1000',safety});
  running=true;startedAt=new Date().toISOString();
  lastResult=null;
  res.json({success:true,build:'12.7.6',status:'SCAN_STARTED',amountUsdc:amount,startedAt,statusRoute:'/api/phase12/routes/status',safety});
  setImmediate(async()=>{
   try{lastResult=await scan(getBaseChain(),rpc,amount)}
   catch(e){lastResult={success:false,error:safe(e),qualified:0,alerts:[],safety}}
   finally{running=false;startedAt=null;lastCheckedAt=new Date().toISOString()}
  });
 });
}
module.exports={scan,mount};
