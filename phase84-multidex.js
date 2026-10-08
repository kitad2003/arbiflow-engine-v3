'use strict';
// Phase 8.4: bounded manual, read-only verification of two Base V3 protocol deployments.
const {Interface}=require('ethers');
const ADDR={USDC:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH:'0x4200000000000000000000000000000000000006'};
const VENUES=[
 {name:'Uniswap V3',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoter:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',fees:[500,3000],quoterAbi:'v2'},
 {name:'PancakeSwap V3',factory:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',quoter:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',fees:[100,500],quoterAbi:'v2'}
];
const f=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const p=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)']);
const q=new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const ZERO='0x0000000000000000000000000000000000000000';
const safety={readOnly:true,automaticScanning:false,mainnetBroadcast:false,executionEligible:false};
const error=e=>String(e?.shortMessage||e?.message||e).replace(/https?:\/\/[^\s]+/g,'[REDACTED_URL]').slice(0,200);
function mount(app,{getBaseChain,rpc}){
 const state={running:false,runs:0,lastStartedAt:null,lastCompletedAt:null,lastResult:null};
 app.get('/api/phase84/status',(_req,res)=>res.json({success:true,build:'8.4.0',stage:'BASE_MULTI_DEX_DIRECT_VERIFICATION',...state,safety}));
 async function run(){
  const chain=getBaseChain();if(!chain||Number(chain.chainId)!==8453)throw Error('BASE_NOT_CONFIGURED');
  const id=Number(BigInt(await rpc(chain,'eth_chainId',[])));if(id!==8453)throw Error('WRONG_CHAIN_'+id);
  const block=await rpc(chain,'eth_blockNumber',[]),blockNumber=Number(BigInt(block));
  async function call(to,abi,method,args=[]){const result=await rpc(chain,'eth_call',[{to,data:abi.encodeFunctionData(method,args)},block]);return abi.decodeFunctionResult(method,result)}
  async function codeAt(addr){const code=await rpc(chain,'eth_getCode',[addr,block]);return !!code&&code!=='0x'}
  const results=[];
  for(const venue of VENUES){
   const v={name:venue.name,factory:venue.factory,quoter:venue.quoter,verifiedPools:0,quotedPools:0,pools:[],errors:[]};results.push(v);
   try{v.factoryCodeVerified=await codeAt(venue.factory);v.quoterCodeVerified=await codeAt(venue.quoter);if(!v.factoryCodeVerified)throw Error('FACTORY_CODE_MISSING');}
   catch(e){v.errors.push('VENUE_CODE: '+error(e));continue;}
   for(const fee of venue.fees){
    const r={feeTier:fee,pool:null,identityVerified:false,quoteVerified:false};v.pools.push(r);
    try{
     const [addr]=await call(venue.factory,f,'getPool',[ADDR.USDC,ADDR.WETH,fee]);r.pool=addr;
     if(addr.toLowerCase()===ZERO) {r.reason='POOL_NOT_DEPLOYED';continue;}
     if(!await codeAt(addr))throw Error('POOL_CODE_MISSING');
     const [[t0],[t1],[actualFee],[liq],slot]=await Promise.all([
       call(addr,p,'token0'),call(addr,p,'token1'),call(addr,p,'fee'),call(addr,p,'liquidity'),call(addr,p,'slot0')]);
     r.token0=t0;r.token1=t1;r.activeLiquidity=liq.toString();r.unlocked=Boolean(slot[6]);
     r.identityVerified=Number(actualFee)===fee&&[t0.toLowerCase(),t1.toLowerCase()].sort().join(':')===[ADDR.USDC.toLowerCase(),ADDR.WETH.toLowerCase()].sort().join(':');
     if(!r.identityVerified)throw Error('POOL_IDENTITY_MISMATCH');v.verifiedPools++;
     if(!v.quoterCodeVerified){r.quoteError='QUOTER_CODE_MISSING';continue;}
     try{const quote=await call(venue.quoter,q,'quoteExactInputSingle',[[ADDR.USDC,ADDR.WETH,1000000n,fee,0]]);r.quoteVerified=quote[0]>0n;r.inputRaw='1000000';r.outputRaw=quote[0].toString();r.quoterGasMetric=quote[3].toString();if(r.quoteVerified)v.quotedPools++;}
     catch(e){r.quoteError=error(e);r.note='Quoter ABI or pool support may differ; no quote counted';}
    }catch(e){r.error=error(e)}
   }
  }
  const verified=new Set(results.flatMap(v=>v.pools.filter(x=>x.identityVerified&&x.quoteVerified).map(x=>`8453:${x.pool.toLowerCase()}`)));
  return {success:true,build:'8.4.0',chainId:8453,blockNumber,venueDeploymentsChecked:results.length,identityVerifiedPools:results.reduce((n,v)=>n+v.verifiedPools,0),uniqueQuoteVerifiedPools:verified.size,results,limitations:['TWO_V3_DEPLOYMENTS_ONLY','BOUNDED_FEE_TIERS','NO_PERSISTENT_DATABASE','NO_FLASH_LOAN','NO_ATOMIC_SIMULATION','NO_NET_PROFIT_VALIDATION'],safety};
 }
 app.get('/api/phase84/run',(_req,res)=>{if(state.running)return res.status(409).json({success:false,error:'RUN_IN_PROGRESS',safety});state.running=true;state.runs++;state.lastStartedAt=new Date().toISOString();setImmediate(async()=>{try{state.lastResult=await run()}catch(e){state.lastResult={success:false,error:error(e),safety}}finally{state.running=false;state.lastCompletedAt=new Date().toISOString()}});res.json({success:true,status:'STARTED_BACKGROUND',statusRoute:'/api/phase84/status',safety})});
 return {state};
}
module.exports={mount};
