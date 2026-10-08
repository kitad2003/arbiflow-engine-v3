'use strict';
// Manual bounded Base V3 PoolCreated event discovery. No trading or automated polling.
const {Interface,id}=require('ethers');
const VENUES=[{name:'Uniswap V3',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD'},{name:'PancakeSwap V3',factory:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'}];
const factory=new Interface(['event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)','function getPool(address,address,uint24) view returns(address)']);
const pool=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)']);
const erc20=new Interface(['function symbol() view returns(string)','function decimals() view returns(uint8)']);
const safe={readOnly:true,automaticScanning:false,mainnetBroadcast:false,executionEligible:false};
const error=e=>String(e?.shortMessage||e?.message||e).replace(/https?:\/\/[^\s]+/g,'[REDACTED_URL]').slice(0,180);
function mount(app,{getBaseChain,rpc}){
 const state={running:false,runs:0,lastStartedAt:null,lastCompletedAt:null,lastResult:null,discovered:new Map(),cursor:null};
 app.get('/api/liquidity86/status',(_req,res)=>res.json({success:true,build:'8.6.1',running:state.running,runs:state.runs,lastStartedAt:state.lastStartedAt,lastCompletedAt:state.lastCompletedAt,cursor:state.cursor,uniquePools:state.discovered.size,lastResult:state.lastResult,safety:safe}));
 app.get('/api/liquidity86/pools',(req,res)=>{const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));res.json({success:true,build:'8.6.1',total:state.discovered.size,pools:Array.from(state.discovered.values()).slice(-limit),safety:safe})});
 async function scan(windowSize,fromOverride){
  const chain=getBaseChain();if(!chain||Number(chain.chainId)!==8453)throw Error('BASE_NOT_CONFIGURED');
  if(Number(BigInt(await rpc(chain,'eth_chainId',[])))!==8453)throw Error('WRONG_CHAIN');
  const latest=Number(BigInt(await rpc(chain,'eth_blockNumber',[])));
  const to=fromOverride===null?latest:Math.min(latest,fromOverride+windowSize-1);
  const from=fromOverride===null?Math.max(0,to-windowSize+1):fromOverride;
  const failures=[], discovered=[];let logsCount=0;
  for(const venue of VENUES){
   let logs=[];
   try{logs=await rpc(chain,'eth_getLogs',[{address:venue.factory,fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16),topics:[id('PoolCreated(address,address,uint24,int24,address)')]}]);}
   catch(e){failures.push({venue:venue.name,stage:'eth_getLogs',error:error(e)});continue}
   logsCount+=logs.length;
   for(const log of logs.slice(0,30)){
    try{
     const ev=factory.parseLog(log);if(!ev)continue;
     const token0=ev.args.token0,token1=ev.args.token1,fee=Number(ev.args.fee),address=ev.args.pool;
     const call=async(toAddr,abi,method,args=[])=>abi.decodeFunctionResult(method,await rpc(chain,'eth_call',[{to:toAddr,data:abi.encodeFunctionData(method,args)},'0x'+latest.toString(16)]));
     const [actualPool]=await call(venue.factory,factory,'getPool',[token0,token1,fee]);
     if(actualPool.toLowerCase()!==address.toLowerCase())throw Error('FACTORY_POOL_MISMATCH');
     const [t0]=await call(address,pool,'token0'),[t1]=await call(address,pool,'token1'),[f]=await call(address,pool,'fee');
     if(t0.toLowerCase()!==token0.toLowerCase()||t1.toLowerCase()!==token1.toLowerCase()||Number(f)!==fee)throw Error('POOL_IDENTITY_MISMATCH');
     const [liquidity]=await call(address,pool,'liquidity');const slot=await call(address,pool,'slot0');
     const tokens=[];
     for(const addr of [token0,token1]){
      const t={address:addr};try{t.symbol=String((await call(addr,erc20,'symbol'))[0]).slice(0,32)}catch(e){t.symbol=null}
      try{t.decimals=Number((await call(addr,erc20,'decimals'))[0])}catch(e){t.decimals=null}
      tokens.push(t);
     }
     const item={chainId:8453,venue:venue.name,pool:address,fee,token0:tokens[0],token1:tokens[1],activeLiquidity:liquidity.toString(),unlocked:Boolean(slot[6]),createdBlock:Number(BigInt(log.blockNumber)),identityVerified:true,quoteVerified:false,depthUSD:null,eligibleForExecution:false};
     state.discovered.set(address.toLowerCase(),item);discovered.push(item);
    }catch(e){failures.push({venue:venue.name,stage:'pool_verification',pool:log.address,txHash:log.transactionHash,error:error(e)})}
   }
   if(logs.length>30)failures.push({venue:venue.name,stage:'bounded_scan',error:'LOG_CAP_30_PER_VENUE_REACHED'});
  }
  if(failures.length===0)state.cursor=to+1;
  return {success:failures.length===0,scanStatus:failures.length?'INCOMPLETE':'COMPLETE',build:'8.6.1',chainId:8453,fromBlock:from,toBlock:to,latestBlock:latest,venueDeployments:VENUES.length,eventsFound:logsCount,verifiedNewOrUpdated:discovered.length,totalUniquePoolsInMemory:state.discovered.size,pools:discovered,failures,limitations:['RECENT_OR_MANUALLY_SELECTED_BLOCK_RANGE_ONLY','MAX_30_EVENTS_PER_VENUE_PER_RUN','V3_FACTORY_EVENTS_ONLY','IN_MEMORY_NOT_PERSISTENT','NO_DEPTH_QUOTES','NO_FLASH_LOAN','NO_PROFIT_VALIDATION'],safety:safe};
 }
 app.get('/api/liquidity86/run',(req,res)=>{
  if(state.running)return res.status(409).json({success:false,error:'RUN_IN_PROGRESS',safety:safe});
  const blocks=Number(req.query.blocks||1000);const fromRaw=req.query.fromBlock;
  if(!Number.isSafeInteger(blocks)||blocks<1||blocks>2000)return res.status(400).json({success:false,error:'BLOCKS_MUST_BE_1_TO_2000',safety:safe});
  const from=fromRaw===undefined?null:Number(fromRaw);
  if(from!==null&&(!Number.isSafeInteger(from)||from<0))return res.status(400).json({success:false,error:'INVALID_FROM_BLOCK',safety:safe});
  state.running=true;state.runs++;state.lastStartedAt=new Date().toISOString();
  setImmediate(async()=>{try{state.lastResult=await scan(blocks,from)}catch(e){state.lastResult={success:false,error:error(e),safety:safe}}finally{state.running=false;state.lastCompletedAt=new Date().toISOString()}});
  res.json({success:true,status:'STARTED_BACKGROUND',build:'8.6.1',statusRoute:'/api/liquidity86/status',safety:safe});
 });
 return {state};
}
module.exports={mount};
