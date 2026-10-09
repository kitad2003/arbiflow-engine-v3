'use strict';
// ArbiFlow 12.9.43: dynamically discover Base USDC 2/3-leg cycles and inspect two confirmed snapshots.
// Preflight at 10k only; no execution, no positive dashboard alert until atomic net-cost verification.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const U='0x222ca98f00ed15b1fae10b61c277703a194cf5d2',C='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const USDC=10000n*1000000n;
const MAX_ROUTES=Number(process.env.MAX_DYNAMIC_ROUTES||120);
const tokenSort=Object.keys(TOKENS);
function pair(a,b){return [a,b].sort((x,y)=>tokenSort.indexOf(x)-tokenSort.indexOf(y)).join('/')}
function choosePools(pools,max=2){return [...pools].sort((a,b)=>{const x=BigInt(Array.isArray(a.liquidityRaw)?a.liquidityRaw[0]:a.liquidityRaw),y=BigInt(Array.isArray(b.liquidityRaw)?b.liquidityRaw[0]:b.liquidityRaw);return x>y?-1:x<y?1:0}).slice(0,max)}
function construct(pools){
 const byPair=new Map();for(const p of pools){if(!byPair.has(p.pair))byPair.set(p.pair,[]);byPair.get(p.pair).push(p)}
 const available=Object.keys(TOKENS).filter(x=>x!=='USDC'&&byPair.has(pair('USDC',x))),res=[];
 for(const x of available){const xx=choosePools(byPair.get(pair('USDC',x)));for(const a of xx)for(const b of xx){if(a.address.toLowerCase()!==b.address.toLowerCase())res.push({path:['USDC',x,'USDC'],pools:[a,b]})}}
 for(const x of available)for(const y of available){if(x===y||!byPair.has(pair(x,y)))continue;
  const a=choosePools(byPair.get(pair('USDC',x)),1)[0],b=choosePools(byPair.get(pair(x,y)),2),c=choosePools(byPair.get(pair('USDC',y)),1)[0];
  for(const middle of b)if(new Set([a.address,middle.address,c.address].map(z=>z.toLowerCase())).size===3)res.push({path:['USDC',x,y,'USDC'],pools:[a,middle,c]});
 }
 return res.slice(0,MAX_ROUTES);
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');assert(Number.isInteger(MAX_ROUTES)&&MAX_ROUTES>0&&MAX_ROUTES<=500,'BAD_ROUTE_BUDGET');
 const u=await discover(rpc);assert(u.success,'INSUFFICIENT_DISCOVERED_POOLS');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const qu={UNISWAP_V3:new ethers.Contract(U,ABI,p),PANCAKESWAP_V3:new ethers.Contract(C,ABI,p)};
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p).FLASHLOAN_PREMIUM_TOTAL({blockTag:u.confirmedBlock}));
  const quote=async(pool,from,to,size,block)=>{
   if(pool.kind==='v1')return BigInt(await new ethers.Contract(pool.address,V1,p).getAmountOut(size,TOKENS[from],{blockTag:block}));
   return BigInt((await qu[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],size,Number(pool.poolConfig),0],{blockTag:block}))[0]);
  };
  const routes=construct(u.pools),rows=[];
  const snapshotBlocks=[u.confirmedBlock,await p.getBlockNumber()];
  for(const route of routes){
   const row={path:route.path.join('>'),pools:route.pools.map(x=>x.address),snapshots:[],qualified:false,alerts:[]};
   for(const block of snapshotBlocks){
    try{
     let n=USDC;
     for(let i=0;i<route.pools.length;i++){n=await quote(route.pools[i],route.path[i],route.path[i+1],n,block);if(n<=0n)throw Error('ZERO_OUTPUT')}
     const fee=(USDC*premium+9999n)/10000n,net=n-USDC-fee;
     row.snapshots.push({block,success:true,returnedUsdcRaw:n.toString(),afterAaveBeforeGasRaw:net.toString(),spreadGtHalfPercent:(n-USDC)*10000n>USDC*50n});
    }catch(e){row.snapshots.push({block,success:false,error:String(e?.shortMessage||e?.code||e?.message||e).slice(0,90)})}
   }
   row.preGasCandidate=row.snapshots.every(s=>s.success&&BigInt(s.afterAaveBeforeGasRaw)>0n&&s.spreadGtHalfPercent);
   row.blockedReasons=['GAS_L1_SLIPPAGE_UNVERIFIED','POOL_TRADE_DEPTH_UNVERIFIED','ATOMIC_SETTLEMENT_UNVERIFIED','RISK_UNVERIFIED'];
   rows.push(row);
  }
  const candidates=rows.filter(x=>x.preGasCandidate);
  return {success:true,build:'12.9.43',mode:'DYNAMIC_TWO_THREE_LEG_TWO_SNAPSHOT_READ_ONLY',discoveredPools:u.uniqueActivePools,distinctRoutesEnumerated:routes.length,confirmedSnapshotBlocks:snapshotBlocks,rowsCompleted:rows.length,successfulBothSnapshots:rows.filter(x=>x.snapshots.every(s=>s.success)).length,preGasCandidatesBothSnapshots:candidates.length,topPreGasCandidates:candidates.slice(0,10),qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,note:'Snapshots can be same block when RPC has not advanced; trade-size and fork execution NOT verified'};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(pair('USDC','WETH'),'USDC/WETH');assert.equal(construct([{pair:'USDC/WETH',address:'0x1',liquidityRaw:'10'},{pair:'USDC/WETH',address:'0x2',liquidityRaw:'20'}]).length,2);
 console.log(JSON.stringify({build:'12.9.43',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('DYNAMIC_12943_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,160));process.exitCode=1});
}
module.exports={run,construct,pair};
