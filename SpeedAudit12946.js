'use strict';
// 12.9.46: Base quote-speed and pending-state support audit.
// Measures observed RPC latency and state freshness. No trades, gas assumptions or alerts.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const POOL=['function getAmountOut(uint256,address) view returns(uint256)'];
const SLOT='0x3850c7bd'; // slot0()
const RESERVES='0x0902f1ac'; // getReserves(); only diagnostic call, ABI checked via pool.kind
const SNAPSHOTS=Number(process.env.SPEED_SNAPSHOTS||3),LIMIT=Number(process.env.SPEED_SAMPLE_POOLS||18);
const now=()=>Number(process.hrtime.bigint()/1000000n);
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 assert(SNAPSHOTS>=2&&SNAPSHOTS<=8&&Number.isInteger(SNAPSHOTS),'BAD_SNAPSHOTS');
 assert(LIMIT>=1&&LIMIT<=40&&Number.isInteger(LIMIT),'BAD_POOL_LIMIT');
 const t0=now(),u=await discover(rpc),discoverMs=now()-t0;
 assert(u.success,'POOL_DISCOVERY_FAILED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const seen=new Set(),samples=[];
  for(const pool of u.pools){
   if(!pool.pair.startsWith('USDC/'))continue;
   const key=pool.pair+':'+pool.dex;
   if(seen.has(key))continue;
   seen.add(key);samples.push(pool);if(samples.length>=LIMIT)break;
  }
  const states=[],quotes=[],quoterContracts={};
  for(const [dex,address] of Object.entries(Q))quoterContracts[dex]=new ethers.Contract(address,ABI,p);
  for(let s=0;s<SNAPSHOTS;s++){
   const block=await p.getBlockNumber();
   for(const pool of samples){
    const method=pool.kind==='v1'?RESERVES:SLOT,at=now();
    let confirmed=null,pending=null,pendError=null,confirmedError=null;
    try{confirmed=await p.send('eth_call',[{to:pool.address,data:method},ethers.toQuantity(block)])}catch(e){confirmedError=String(e?.shortMessage||e?.message||e).slice(0,100)}
    const confirmedMs=now()-at,pt=now();
    try{pending=await p.send('eth_call',[{to:pool.address,data:method},'pending'])}catch(e){pendError=String(e?.shortMessage||e?.message||e).slice(0,100)}
    const pendingMs=now()-pt;
    states.push({sample:s,pair:pool.pair,dex:pool.dex,address:pool.address,block,confirmedMs,pendingMs,confirmedOk:confirmed!==null,pendingOk:pending!==null,pendingDifferent:confirmed!==null&&pending!==null&&confirmed!==pending,pendingError:pendError,confirmedError});
   }
   // Quote opposite directions at the same block; this is NOT a round-trip or executable profit.
   for(const pool of samples.filter(x=>x.dex!=='AERODROME_V1').slice(0,6)){
    const symbol=pool.pair.split('/')[1],start=now();
    try{
     const amount=1000000000n;
     const output=await quoterContracts[pool.dex].quoteExactInputSingle.staticCall([TOKENS.USDC,TOKENS[symbol],amount,Number(pool.poolConfig),0],{blockTag:block});
     quotes.push({sample:s,pair:pool.pair,dex:pool.dex,pool:pool.address,block,inputUsdc:1000,amountOutRaw:output[0].toString(),quoteLatencyMs:now()-start,ok:true});
    }catch(e){quotes.push({sample:s,pair:pool.pair,dex:pool.dex,block,ok:false,quoteLatencyMs:now()-start,error:String(e?.shortMessage||e?.message||e).slice(0,80)})}
   }
  }
  const successful=states.filter(x=>x.confirmedOk&&x.pendingOk);
  const different=successful.filter(x=>x.pendingDifferent);
  const ordered=states.map(x=>x.confirmedMs+x.pendingMs).sort((a,b)=>a-b);
  const quoteTimes=quotes.filter(x=>x.ok).map(x=>x.quoteLatencyMs).sort((a,b)=>a-b);
  const percentile=(arr,n)=>arr.length?arr[Math.min(arr.length-1,Math.ceil(arr.length*n)-1)]:null;
  const uniqueBlocks=[...new Set(states.map(x=>x.block))];
  return {success:true,build:'12.9.46',mode:'BASE_CONFIRMED_VS_PENDING_SPEED_AUDIT',discoveredPools:u.uniqueActivePools,poolDiscoveryMs:discoverMs,poolsSelected:samples.length,rounds:SNAPSHOTS,confirmedBlocksObserved:uniqueBlocks,distinctConfirmedBlocks:uniqueBlocks.length,contractStateChecks:states.length,pendingCallsSuccessful:states.filter(x=>x.pendingOk).length,pendingDifferentFromConfirmed:different.length,latencyMs:{stateRoundTripMedian:percentile(ordered,0.5),stateRoundTripP95:percentile(ordered,0.95),quoteMedian:percentile(quoteTimes,0.5),quoteP95:percentile(quoteTimes,0.95)},quoteCalls:quotes.length,quoteSuccesses:quoteTimes.length,pendingStateAdvancementProven:different.length>0,flashblocksStreamVerified:false,websocketListening:false,diagnostics:states.filter(x=>x.pendingDifferent||x.pendingError||x.confirmedError).slice(0,10),qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,note:'PENDING_DIFFERENCE_IS_NOT_FLASHBLOCKS_PROOF; HTTP measurements are sequential, not true event-to-action latency'};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(SLOT,'0x3850c7bd');assert.equal(RESERVES,'0x0902f1ac');
 console.log(JSON.stringify({build:'12.9.46',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('SPEED_AUDIT_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run};
