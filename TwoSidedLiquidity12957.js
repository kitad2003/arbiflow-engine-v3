'use strict';
// 12.9.57 read-only two-sided $10,000 viability screening.
// Uses $100 diagnostic probes and exact $10,000 first-leg quotes;
// prefilters second legs by scaling of an actual intermediate-token input.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {rankRoutes}=require('./OpportunityAudit12953');
const {RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const QA=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const VA=['function getAmountOut(uint256,address) view returns(uint256)'];
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const PROBE=100n*1000000n,LOAN=10000n*1000000n,MIN_GROWTH=1000n,OUT='arbiflow-two-sided-12957.json';
const LIMIT=Number(process.env.TWO_SIDED_ROUND_TRIPS||80);
function growthBps(small,big){return small>0n&&big>0n?big*100n/small:0n}
function reason(first,second){
 if(!first)return 'FIRST_LEG_FAILED';
 if(!second)return 'SECOND_LEG_FAILED';
 return 'BOTH_SIDES_PASS';
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(Number.isSafeInteger(LIMIT)&&LIMIT>=1&&LIMIT<=200,'BAD_ROUND_TRIP_LIMIT');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const block=d.confirmedBlock,universe=routesFor(d.pools,3000),screen=rankRoutes(universe.selected);
  const score=new Map(screen.ranked.map(x=>[x.first.address.toLowerCase()+'>'+x.second.address.toLowerCase(),x.scoreBps]));
  const pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
  const q=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,QA,provider)]));
  const v1=new Map();
  async function quote(pool,from,to,amount){
   if(pool.kind==='v1'){
    const k=pool.address.toLowerCase();if(!v1.has(k))v1.set(k,new ethers.Contract(pool.address,VA,provider));
    return BigInt(await pacer.run(()=>v1.get(k).getAmountOut(amount,TOKENS[from],{blockTag:block})));
   }
   return BigInt((await pacer.run(()=>q[pool.dex].quoteExactInputSingle.staticCall([TOKENS[from],TOKENS[to],amount,Number(pool.poolConfig),0],{blockTag:block})))[0]);
  }
  const first=new Map(),byFirst=new Map();
  for(const r of universe.selected)byFirst.set(r.first.address.toLowerCase(),r);
  for(const [k,r] of byFirst){
   try{
    const small=await quote(r.first,'USDC',r.token,PROBE),large=await quote(r.first,'USDC',r.token,LOAN),growth=growthBps(small,large);
    first.set(k,{small,large,growth,pass:small>0n&&large>0n&&growth>=MIN_GROWTH});
   }catch(e){first.set(k,{pass:false,error:String(e?.shortMessage||e?.message||e).slice(0,80)})}
  }
  const viable=universe.selected.filter(r=>first.get(r.first.address.toLowerCase())?.pass);
  const eligible=[],rejected=[],secondCache=new Map();
  // Distinct second pool + token + actual intermediate amount. No synthetic amount extrapolation.
  for(const r of viable){
   const amount=first.get(r.first.address.toLowerCase()).large;
   const cacheKey=r.second.address.toLowerCase()+':'+r.token+':'+amount.toString();
   let s=secondCache.get(cacheKey);
   if(!s){
    try{
     const smallAmount=amount/100n>0n?amount/100n:1n;
     const small=await quote(r.second,r.token,'USDC',smallAmount),large=await quote(r.second,r.token,'USDC',amount);
     const growth=growthBps(small,large);
     s={small,large,growth,pass:small>0n&&large>0n&&growth>=MIN_GROWTH};
    }catch(e){s={pass:false,error:String(e?.shortMessage||e?.message||e).slice(0,80)}}
    secondCache.set(cacheKey,s);
   }
   const row={pair:r.pair,route:'USDC>'+r.token+'>USDC',pools:[r.first.address,r.second.address],firstLegGrowthBps:Number(first.get(r.first.address.toLowerCase()).growth),secondLegGrowthBps:s.growth===undefined?null:Number(s.growth),spotBps:score.get(r.first.address.toLowerCase()+'>'+r.second.address.toLowerCase())??null};
   if(!s.pass){rejected.push({...row,rejection:'SECOND_LEG_EXHAUSTED_OR_QUOTE_FAILURE'});continue}
   const back=s.large,gross=back-LOAN;eligible.push({...row,grossRaw:gross.toString(),roundTripOutputRaw:back.toString()});
  }
  const premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const fee=(LOAN*premium+9999n)/10000n;
  const ranking=eligible.map(x=>({...x,grossUsdc:Number(BigInt(x.grossRaw))/1e6,afterAaveBeforeGasUsdc:Number(BigInt(x.grossRaw)-fee)/1e6,spreadAboveHalfPercent:BigInt(x.grossRaw)*10000n>LOAN*50n})).sort((a,b)=>b.afterAaveBeforeGasUsdc-a.afterAaveBeforeGasUsdc);
  const selected=ranking.slice(0,LIMIT);
  const reasonCounts={firstLegRejected:universe.selected.length-viable.length,secondLegRejected:rejected.length,twoSidedPassed:eligible.length,reportedTop: selected.length,unreportedTwoSidedPassed:eligible.length-selected.length};
  const report={build:'12.9.57',mode:'TWO_SIDED_EXACT_AMOUNT_READ_ONLY',createdAt:new Date().toISOString(),block,discoveredPools:d.uniqueActivePools,indexedRoutes:universe.selected.length,uniqueFirstPools:byFirst.size,uniqueSecondChecks:secondCache.size,reasonCounts,aavePremiumBps:premium.toString(),positiveAfterAave:eligible.filter(x=>BigInt(x.grossRaw)>fee).length,spreadPassing:eligible.filter(x=>BigInt(x.grossRaw)*10000n>LOAN*50n).length,topCandidates:selected,rejectedSecondLeg:rejected.slice(0,50),rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['EXACT_QUOTE_AT_CONFIRMED_BLOCK_ONLY','PRICE_IMPACT_HEURISTIC_NOT_TICK_BY_TICK_PROOF','NO_GAS_L1_FEE_SLIPPAGE_ATOMIC_OR_RISK_VALIDATION','NO_AUTOMATIC_EXECUTION']};
  fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');return report;
 }finally{provider.destroy()}
}
if(require.main===module){
 assert.equal(growthBps(100n,10000n),10000n);assert.equal(growthBps(100n,100n),100n);assert.equal(reason(true,true),'BOTH_SIDES_PASS');
 console.log(JSON.stringify({build:'12.9.57',unitAssertionsPassed:3}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('TWO_SIDED_12957_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,growthBps,reason};
