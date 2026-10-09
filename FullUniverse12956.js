'use strict';
// 12.9.56 full-universe route census with per-first-pool liquidity probe.
// All round trips are indicative; no execution or alerts are permitted.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {rankRoutes}=require('./OpportunityAudit12953');
const {RpcPacer}=require('./RpcPacer12950');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const PROBE=100n*1000000n,MIN=10000n*1000000n,MAX_ROUND=Number(process.env.MAX_ROUND_TRIPS||60);
const OUT='arbiflow-full-universe-12956.json';
function stableRate(probe,large){return probe>0n&&large>0n?Number(large*10000n/(probe*100n)):0}
function selectCandidates(routes,firstLeg,ranked,max){
 const xs=routes.filter(r=>firstLeg.get(r.first.address.toLowerCase())?.usable);
 xs.sort((a,b)=>{
  const aScore=ranked.get(a.first.address.toLowerCase()+'>'+a.second.address.toLowerCase())??-999999;
  const bScore=ranked.get(b.first.address.toLowerCase()+'>'+b.second.address.toLowerCase())??-999999;
  return bScore-aScore;
 });
 const byPair=new Map();for(const r of xs){if(!byPair.has(r.pair))byPair.set(r.pair,[]);byPair.get(r.pair).push(r)}
 const selected=[];while(selected.length<max){let progress=false;for(const bucket of byPair.values()){if(bucket.length){selected.push(bucket.shift());progress=true;if(selected.length>=max)break}}if(!progress)break}
 return selected;
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 assert(Number.isSafeInteger(MAX_ROUND)&&MAX_ROUND>=1&&MAX_ROUND<=200,'INVALID_MAX_ROUND_TRIPS');
 const discovery=await discover(rpc);assert(discovery.success,'DISCOVERY_FAILED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const block=discovery.confirmedBlock,universe=routesFor(discovery.pools,3000),screen=rankRoutes(universe.selected);
  const scores=new Map(screen.ranked.map(x=>[x.first.address.toLowerCase()+'>'+x.second.address.toLowerCase(),x.scoreBps]));
  const pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
  const quoters=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,ABI,provider)]));
  const v1s=new Map();
  async function quote(pool,a,b,amt){
   if(pool.kind==='v1'){
    if(!v1s.has(pool.address))v1s.set(pool.address,new ethers.Contract(pool.address,V1,provider));
    return BigInt(await pacer.run(()=>v1s.get(pool.address).getAmountOut(amt,TOKENS[a],{blockTag:block})));
   }
   return BigInt((await pacer.run(()=>quoters[pool.dex].quoteExactInputSingle.staticCall([TOKENS[a],TOKENS[b],amt,Number(pool.poolConfig),0],{blockTag:block})))[0]);
  }
  const firstPools=new Map();
  for(const r of universe.selected)firstPools.set(r.first.address.toLowerCase(),r);
  const tested=new Map(),probeFailures=[];
  for(const [key,r] of firstPools){
   try{
    const a=await quote(r.first,'USDC',r.token,PROBE);
    const b=await quote(r.first,'USDC',r.token,MIN);
    const scaledBps=stableRate(a,b);
    // A large probe should produce at least 10x the tiny probe output
    // when the input increases 100x. This is a deliberately loose exhaustion gate.
    tested.set(key,{pair:r.pair,token:r.token,firstPool:r.first.address,probeOutputRaw:a.toString(),minLoanOutputRaw:b.toString(),growthBps:scaledBps,usable:a>0n&&b>0n&&scaledBps>=1000,reason:a===0n?'ZERO_PROBE':b===0n?'ZERO_MIN_LOAN':scaledBps<1000?'EXHAUSTED_FIRST_LEG':'GROWTH_GATE_PASS'});
   }catch(e){probeFailures.push({pool:r.first.address,error:String(e?.shortMessage||e?.message||e).slice(0,90)});tested.set(key,{usable:false,reason:'QUOTE_ERROR'})}
  }
  const candidates=selectCandidates(universe.selected,tested,scores,MAX_ROUND);
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const results=[];
  for(const route of candidates){
   const row={path:'USDC>'+route.token+'>USDC',pools:[route.first.address,route.second.address],venues:[route.first.dex,route.second.dex],spotBps:scores.get(route.first.address.toLowerCase()+'>'+route.second.address.toLowerCase())??null,firstLegGrowthBps:tested.get(route.first.address.toLowerCase()).growthBps};
   try{
    const first=BigInt(tested.get(route.first.address.toLowerCase()).minLoanOutputRaw);
    const back=await quote(route.second,route.token,'USDC',first);
    const gross=back-MIN,after=gross-((MIN*premium+9999n)/10000n);
    Object.assign(row,{success:true,grossUsdc:Number(gross)/1e6,afterAaveBeforeGasUsdc:Number(after)/1e6,spreadPassing:gross*10000n>MIN*50n,positiveAfterAave:after>0n});
   }catch(e){row.success=false;row.error=String(e?.shortMessage||e?.message||e).slice(0,90)}
   results.push(row);
  }
  const sorted=[...results].filter(x=>x.success).sort((a,b)=>b.afterAaveBeforeGasUsdc-a.afterAaveBeforeGasUsdc);
  const counts={totalRoutes:universe.total,indexedRoutes:universe.selected.length,firstPoolsScreened:tested.size,firstPoolsUsable:[...tested.values()].filter(x=>x.usable).length,firstPoolsExhausted:[...tested.values()].filter(x=>x.reason==='EXHAUSTED_FIRST_LEG').length,firstPoolQuoteFailures:probeFailures.length,routesPassingFirstLeg:universe.selected.filter(x=>tested.get(x.first.address.toLowerCase())?.usable).length,roundTripsSelected:candidates.length,roundTripsSuccess:sorted.length,roundTripsFailed:results.filter(x=>!x.success).length,spotGreaterThanHalfPercent:screen.ranked.filter(x=>x.scoreBps>50).length,positiveAfterAave:sorted.filter(x=>x.positiveAfterAave).length,exactSpreadPassing:sorted.filter(x=>x.spreadPassing).length};
  const report={build:'12.9.56',mode:'FULL_UNIVERSE_EXHAUSTION_SCREEN_READ_ONLY',createdAt:new Date().toISOString(),block,discoveredPools:discovery.uniqueActivePools,counts,minimumLoanUsdc:10000,probeUsdc:100,firstPoolScreen:[...tested.values()],firstPoolQuoteFailures:probeFailures,topRoundTripResults:sorted.slice(0,30),rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['HEURISTIC_GROWTH_GATE_NOT_FULL_TICK_LIQUIDITY_PROOF','FIRST_LEG_SCREEN_DOES_NOT_VALIDATE_SECOND_POOL_LIQUIDITY','MAX_ROUND_TRIPS_LIMIT','NO_GAS_SLIPPAGE_ATOMIC_RISK_VERIFICATION']};
  fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');return report;
 }finally{provider.destroy()}
}
if(require.main===module){
 assert.equal(stableRate(100n,10000n),10000);
 assert.equal(stableRate(100n,100n),100);
 assert.equal(stableRate(0n,500n),0);
 console.log(JSON.stringify({build:'12.9.56',unitAssertionsPassed:3}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('FULL_12956_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,stableRate,selectCandidates};
