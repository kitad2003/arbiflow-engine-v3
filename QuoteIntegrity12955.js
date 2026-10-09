'use strict';
// 12.9.55: on-chain quote integrity: decimals, token direction, V3 pool identity,
// exact token units, first-leg/second-leg amounts, and loss classification.
// Independent diagnosis; does not authorize mainnet execution.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {routesFor}=require('./EventWatch12951');
const {rankRoutes}=require('./OpportunityAudit12953');
const {RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const QA=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const TOKENABI=['function decimals() view returns(uint8)','function symbol() view returns(string)'];
const POOLABI=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)'];
const VA=['function getAmountOut(uint256,address) view returns(uint256)','function token0() view returns(address)','function token1() view returns(address)','function getReserves() view returns(uint256,uint256,uint256)'];
const SIZES=[100,10000],OUTPUT='arbiflow-quote-integrity-12955.json',LIMIT=Number(process.env.INTEGRITY_ROUTE_LIMIT||12);
function classify(x){
 if(!x.firstLegPositive)return 'ZERO_FIRST_LEG';
 if(x.firstOutputRelativeToSpotPct!==null&&x.firstOutputRelativeToSpotPct<1)return 'FIRST_LEG_EXTREME_IMPACT_OR_BAD_SPOT';
 if(x.secondOutputRelativeToSpotPct!==null&&x.secondOutputRelativeToSpotPct<1)return 'SECOND_LEG_EXTREME_IMPACT_OR_BAD_SPOT';
 if(x.returnPct<-90)return 'NEAR_TOTAL_PRINCIPAL_LOSS';
 if(x.returnPct<0)return 'NEGATIVE_ROUND_TRIP';
 return 'POSITIVE_BEFORE_FEES';
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(Number.isInteger(LIMIT)&&LIMIT>=1&&LIMIT<=40,'INVALID_LIMIT');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),pacer=new RpcPacer({gapMs:90,parallel:2,retries:2});
 try{
  const block=d.confirmedBlock,universe=routesFor(d.pools,3000),screen=rankRoutes(universe.selected);
  const v1=universe.selected.filter(x=>x.first.kind==='v1'||x.second.kind==='v1');
  const pick=new Map();
  for(const x of [...screen.ranked.filter(x=>x.scoreBps>50),...v1,...screen.ranked]){const k=x.first.address.toLowerCase()+'>'+x.second.address.toLowerCase();if(!pick.has(k))pick.set(k,x)}
  const selected=[...pick.values()].slice(0,LIMIT),tokenInfo={};
  const needed=new Set(['USDC',...selected.map(x=>x.token)]);
  for(const symbol of needed){
   const token=new ethers.Contract(TOKENS[symbol],TOKENABI,p);
   const decimals=Number(await pacer.run(()=>token.decimals({blockTag:block})));
   assert(Number.isInteger(decimals)&&decimals>=0&&decimals<=36,'BAD_DECIMALS_'+symbol);
   tokenInfo[symbol]={address:TOKENS[symbol],decimals,onchainSymbol:await pacer.run(()=>token.symbol({blockTag:block}))};
  }
  const q=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,QA,p)]));
  const poolInfo=new Map();
  async function verify(pool,a,b){
   const key=pool.address.toLowerCase();if(poolInfo.has(key))return poolInfo.get(key);
   const contract=new ethers.Contract(pool.address,pool.kind==='v1'?VA:POOLABI,p);
   const [token0,token1]=await Promise.all([pacer.run(()=>contract.token0({blockTag:block})),pacer.run(()=>contract.token1({blockTag:block}))]);
   const actual=new Set([token0.toLowerCase(),token1.toLowerCase()]);
   const directionsMatch=actual.has(TOKENS[a].toLowerCase())&&actual.has(TOKENS[b].toLowerCase())&&actual.size===2;
   const detail={address:pool.address,dex:pool.dex,kind:pool.kind,token0,token1,directionsMatch};
   if(pool.kind==='v3'){
    const [fee,liquidity,slot]=await Promise.all([pacer.run(()=>contract.fee({blockTag:block})),pacer.run(()=>contract.liquidity({blockTag:block})),pacer.run(()=>contract.slot0({blockTag:block}))]);
    detail.fee=Number(fee);detail.feeMatchesRegistry=Number(fee)===Number(pool.poolConfig);detail.activeLiquidityRaw=liquidity.toString();detail.sqrtPriceX96=slot[0].toString();
   }else{
    const reserves=await pacer.run(()=>contract.getReserves({blockTag:block}));
    detail.reservesRaw=[reserves[0].toString(),reserves[1].toString()];detail.stablePool=!!pool.poolConfig;
   }
   poolInfo.set(key,detail);return detail;
  }
  async function quote(pool,a,b,amount){
   if(pool.kind==='v1')return BigInt(await pacer.run(()=>new ethers.Contract(pool.address,VA,p).getAmountOut(amount,TOKENS[a],{blockTag:block})));
   return BigInt((await pacer.run(()=>q[pool.dex].quoteExactInputSingle.staticCall([TOKENS[a],TOKENS[b],amount,Number(pool.poolConfig),0],{blockTag:block})))[0]);
  }
  const rows=[],stats={routesSelected:selected.length,amountTests:0,quoteFailures:0,integrityFailures:0,negative:0,nearTotalLoss:0,positiveGross:0};
  for(const route of selected){
   const firstInfo=await verify(route.first,'USDC',route.token),secondInfo=await verify(route.second,route.token,'USDC');
   const valid=firstInfo.directionsMatch&&secondInfo.directionsMatch&&firstInfo.feeMatchesRegistry!==false&&secondInfo.feeMatchesRegistry!==false;
   const row={pair:route.pair,route:'USDC>'+route.token+'>USDC',pools:[firstInfo,secondInfo],poolIntegrityValid:valid,spotAfterFeesBps:route.scoreBps??null,tests:[]};
   if(!valid){stats.integrityFailures++;rows.push(row);continue}
   for(const size of SIZES){
    const amt=ethers.parseUnits(String(size),tokenInfo.USDC.decimals);
    const test={sizeUsdc:size,firstInputRaw:amt.toString()};
    try{
     const first=await quote(route.first,'USDC',route.token,amt);
     const second=await quote(route.second,route.token,'USDC',first);
     const gross=second-amt;
     const fmt=(amount,token)=>ethers.formatUnits(amount,tokenInfo[token].decimals);
     Object.assign(test,{success:true,firstOutputRaw:first.toString(),firstOutputFormatted:fmt(first,route.token),intermediateDecimals:tokenInfo[route.token].decimals,secondInputRaw:first.toString(),secondOutputRaw:second.toString(),secondOutputUsdc:fmt(second,'USDC'),grossUsdc:fmt(gross,'USDC'),returnPct:Number(gross*10000n/amt)/100,firstLegPositive:first>0n,firstOutputRelativeToSpotPct:null,secondOutputRelativeToSpotPct:null});
     test.classification=classify(test);
     stats.amountTests++;if(gross<0n)stats.negative++;else if(gross>0n)stats.positiveGross++;
     if(test.returnPct<=-90)stats.nearTotalLoss++;
    }catch(e){test.success=false;test.error=String(e?.shortMessage||e?.message||e).slice(0,100);stats.quoteFailures++}
    row.tests.push(test);
   }
   rows.push(row);
  }
  const report={build:'12.9.55',mode:'QUOTE_INTEGRITY_READ_ONLY',createdAt:new Date().toISOString(),block,poolsDiscovered:d.uniqueActivePools,totalRoutes:universe.total,tokenInfo,stats,rows,rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['V1_STABLE_FORMULA_NOT_INDEPENDENTLY_RECOMPUTED','PRICE_IMPACT_NOT_ISOLATED_FROM_DUAL_POOL_SPREAD','NO_ATOMIC_FORK_TEST','NO_GAS_COST_VERIFIED']};
  fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');return report;
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(ethers.parseUnits('10000',6),10000000000n);
 assert.equal(ethers.formatUnits(123456789n,8),'1.23456789');
 console.log(JSON.stringify({build:'12.9.55',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('INTEGRITY_12955_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,classify};
