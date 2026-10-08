 'use strict';
// Phase 8.5: bounded manual two-leg cross-venue quotes; read-only, no executable claims.
const {Interface}=require('ethers');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const venues=[
 {name:'Uniswap V3',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoter:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',fees:[500,3000]},
 {name:'PancakeSwap V3',factory:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',quoter:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',fees:[100,500]}
];
const factory=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const pool=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)']);
const quoter=new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const ZERO='0x0000000000000000000000000000000000000000';
const safety={readOnly:true,automaticScanning:false,mainnetBroadcast:false,executionEligible:false};
const err=e=>String(e?.shortMessage||e?.message||e).replace(/https?:\/\/[^\s]+/g,'[REDACTED_URL]').slice(0,240);
function mount(app,{getBaseChain,rpc}){
 const state={running:false,runs:0,lastStartedAt:null,lastCompletedAt:null,lastResult:null};
 app.get('/api/phase85/status',(_req,res)=>res.json({success:true,build:'8.5.0',stage:'BASE_CROSS_DEX_TWO_LEG_QUOTES',...state,safety}));
 async function run(amountUsdc){
  const chain=getBaseChain();if(!chain||Number(chain.chainId)!==8453)throw Error('BASE_NOT_CONFIGURED');
  if(Number(BigInt(await rpc(chain,'eth_chainId',[])))!==8453)throw Error('WRONG_CHAIN');
  const block=await rpc(chain,'eth_blockNumber',[]),blockNumber=Number(BigInt(block));
  async function call(addr,iface,fn,args=[]){let x=await rpc(chain,'eth_call',[{to:addr,data:iface.encodeFunctionData(fn,args)},block]);return iface.decodeFunctionResult(fn,x)}
  const verified=[];const failures=[];
  for(const venue of venues){
   for(const fee of venue.fees){
    try{
     const [addr]=await call(venue.factory,factory,'getPool',[USDC,WETH,fee]);
     if(addr.toLowerCase()===ZERO)throw Error('POOL_NOT_FOUND');
     const [[t0],[t1],[actualFee],[liquidity],slot]=await Promise.all([
      call(addr,pool,'token0'),call(addr,pool,'token1'),call(addr,pool,'fee'),call(addr,pool,'liquidity'),call(addr,pool,'slot0')]);
     if([t0.toLowerCase(),t1.toLowerCase()].sort().join(':')!==[USDC.toLowerCase(),WETH.toLowerCase()].sort().join(':')||Number(actualFee)!==fee||!slot[6]||liquidity===0n)throw Error('POOL_NOT_USABLE');
     verified.push({...venue,fee,pool:addr});
    }catch(e){failures.push({venue:venue.name,fee,error:err(e)})}
   }
  }
  const routes=[];const initial=BigInt(amountUsdc)*1000000n;
  for(const buy of verified){for(const sell of verified){if(buy.name===sell.name)continue;
   const row={buyDex:buy.name,buyPool:buy.pool,buyFee:buy.fee,sellDex:sell.name,sellPool:sell.pool,sellFee:sell.fee,amountUsdc,quoteBlock:blockNumber,quoteVerified:false,gasUSD:null,loanPremiumUSD:null,netAfterCostsUSD:null,executionEligible:false};
   try{
    const first=await call(buy.quoter,quoter,'quoteExactInputSingle',[[USDC,WETH,initial,buy.fee,0]]);
    const second=await call(sell.quoter,quoter,'quoteExactInputSingle',[[WETH,USDC,first[0],sell.fee,0]]);
    row.wethOutRaw=first[0].toString();row.finalUsdcRaw=second[0].toString();row.grossUsdcRaw=(second[0]-initial).toString();
    row.grossBeforeGasAndLoanFeeUSDC=Number(second[0]-initial)/1e6;row.quoteVerified=first[0]>0n&&second[0]>0n;
    row.quoterGasMetricFirst=first[3].toString();row.quoterGasMetricSecond=second[3].toString();
   }catch(e){row.error=err(e)}
   routes.push(row);
  }}
  const good=routes.filter(x=>x.quoteVerified);
  return {success:true,build:'8.5.0',chainId:8453,blockNumber,amountUsdc,verifiedPools:verified.length,verifiedVenueDeployments:new Set(verified.map(v=>v.name)).size,attemptedRoutes:routes.length,successfulTwoLegQuotes:good.length,positiveGrossBeforeCosts:good.filter(x=>x.grossBeforeGasAndLoanFeeUSDC>0).length,rankedByGrossBeforeCosts:good.slice().sort((a,b)=>b.grossBeforeGasAndLoanFeeUSDC-a.grossBeforeGasAndLoanFeeUSDC),routes,verificationFailures:failures,limitations:['USDC_WETH_ONLY','BASE_ONLY','TWO_V3_DEPLOYMENTS','QUOTES_AT_ONE_PINNED_BLOCK','NO_FLASH_LOAN_PREMIUM','NO_TRANSACTION_GAS_OR_L2_DATA_FEE','NO_ATOMIC_FORK_SIMULATION','NO_EXECUTABLE_PROFIT','NO_PERSISTENT_DATABASE'],safety};
 }
 app.get('/api/phase85/run',(req,res)=>{
  if(state.running)return res.status(409).json({success:false,error:'RUN_IN_PROGRESS',safety});
  const amount=Number(req.query.amountUsdc||1);
  if(![1,10].includes(amount))return res.status(400).json({success:false,error:'AMOUNT_MUST_BE_1_OR_10_USDC',safety});
  state.running=true;state.runs++;state.lastStartedAt=new Date().toISOString();
  setImmediate(async()=>{try{state.lastResult=await run(amount)}catch(e){state.lastResult={success:false,error:err(e),safety}}finally{state.running=false;state.lastCompletedAt=new Date().toISOString()}});
  res.json({success:true,status:'STARTED_BACKGROUND',amountUsdc:amount,statusRoute:'/api/phase85/status',safety});
 });
 return {state};
}
module.exports={mount};
