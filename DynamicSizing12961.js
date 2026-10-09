'use strict';
// 12.9.61 read-only multi-size profit discovery; outputs are estimates before gas.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939'),{routesFor}=require('./EventWatch12951'),{RpcPacer}=require('./RpcPacer12950');
const Q={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const ABI=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const SIZES=[100,1000,5000,10000,25000,35000],PRIMARY=10000,PROBE=100n*1000000n,LOAN=10000n*1000000n;
const MAX=Number(process.env.SIZE_OPT_ROUTE_LIMIT||45);
function fee(amt,bps){return (amt*bps+9999n)/10000n}
function classify(gross,amt,bps){return {afterAaveRaw:(gross-fee(amt,bps)).toString(),spreadOverHalfPercent:gross*10000n>amt*50n,positiveAfterAave:gross>fee(amt,bps)}}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(Number.isInteger(MAX)&&MAX>0&&MAX<=150,'BAD_LIMIT');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const block=d.confirmedBlock,all=routesFor(d.pools,3000).selected,pacer=new RpcPacer({gapMs:100,parallel:2,retries:2});
  const q=Object.fromEntries(Object.entries(Q).map(([k,v])=>[k,new ethers.Contract(v,ABI,provider)])),v1=new Map(),cache=new Map();
  async function quote(pool,a,b,input){
   const key=pool.address.toLowerCase()+':'+a+':'+input.toString();if(cache.has(key))return cache.get(key);
   let result;
   if(pool.kind==='v1'){const k=pool.address.toLowerCase();if(!v1.has(k))v1.set(k,new ethers.Contract(pool.address,V1,provider));result=BigInt(await pacer.run(()=>v1.get(k).getAmountOut(input,TOKENS[a],{blockTag:block})))}
   else result=BigInt((await pacer.run(()=>q[pool.dex].quoteExactInputSingle.staticCall([TOKENS[a],TOKENS[b],input,Number(pool.poolConfig),0],{blockTag:block})))[0]);
   cache.set(key,result);return result;
  }
  const first=new Map();for(const r of all)first.set(r.first.address.toLowerCase(),r);
  const viability=new Map();for(const [k,r] of first){try{
   const low=await quote(r.first,'USDC',r.token,PROBE),high=await quote(r.first,'USDC',r.token,LOAN);
   viability.set(k,{pass:low>0n&&high>0n&&high*100n/low>=1000n,high});
  }catch{viability.set(k,{pass:false})}}
  const routes=all.filter(r=>viability.get(r.first.address.toLowerCase())?.pass),base=[];
  for(const r of routes){try{
   const amount=viability.get(r.first.address.toLowerCase()).high,small=await quote(r.second,r.token,'USDC',amount/100n||1n),back=await quote(r.second,r.token,'USDC',amount);
   if(small===0n||back*100n/small<1000n)continue;
   base.push({route:r,gross:back-LOAN});
  }catch{}}
  base.sort((a,b)=>a.gross>b.gross?-1:a.gross<b.gross?1:0);
  const selected=base.slice(0,MAX),premium=BigInt(await new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],provider).FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
  const results=[];for(const entry of selected){
   const r=entry.route,row={pair:r.pair,pools:[r.first.address,r.second.address],sizes:[]};
   for(const size of SIZES){
    const amt=BigInt(size)*1000000n,x={loanUsdc:size,diagnosticOnly:size<PRIMARY};
    try{const mid=await quote(r.first,'USDC',r.token,amt),back=await quote(r.second,r.token,'USDC',mid),gross=back-amt,calc=classify(gross,amt,premium);
     Object.assign(x,{success:true,grossUsdc:Number(gross)/1e6,afterAaveBeforeGasUsdc:Number(BigInt(calc.afterAaveRaw))/1e6,spreadOverHalfPercent:calc.spreadOverHalfPercent,positiveAfterAave:calc.positiveAfterAave,estimatedGasUsdc:null,estimatedNetUsdc:null,executionEligible:false});
    }catch(e){x.success=false;x.error=String(e?.shortMessage||e?.message||e).slice(0,90)}
    row.sizes.push(x);
   }
   const successful=row.sizes.filter(x=>x.success).sort((a,b)=>b.afterAaveBeforeGasUsdc-a.afterAaveBeforeGasUsdc);
   row.bestObserved=successful[0]||null;row.primary= row.sizes.find(x=>x.loanUsdc===PRIMARY);results.push(row);
  }
  const allSizes=results.flatMap(r=>r.sizes.filter(x=>x.success));
  const report={build:'12.9.61',mode:'DYNAMIC_LOAN_SIZE_DIAGNOSTIC_READ_ONLY',createdAt:new Date().toISOString(),block,pools:d.pools.length,routesIndexed:all.length,firstPoolsScreened:first.size,routesFirstLegPassing:routes.length,twoSidedBaselinePassing:base.length,multiSizeRoutes:results.length,loanSizesUsdc:SIZES,primaryLoanUsdc:PRIMARY,aavePremiumBps:premium.toString(),positiveAfterAaveBySize:Object.fromEntries(SIZES.map(size=>[size,allSizes.filter(x=>x.loanUsdc===size&&x.positiveAfterAave).length])),spreadPassBySize:Object.fromEntries(SIZES.map(size=>[size,allSizes.filter(x=>x.loanUsdc===size&&x.spreadOverHalfPercent).length])),topByPrimary:results.slice(0,15),bestByAnySize:results.filter(x=>x.bestObserved).sort((a,b)=>b.bestObserved.afterAaveBeforeGasUsdc-a.bestObserved.afterAaveBeforeGasUsdc).slice(0,10).map(x=>({pair:x.pair,pools:x.pools,bestObserved:x.bestObserved})),rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['NOT_EVENT_DRIVEN','GAS_L1_SLIPPAGE_NOT_ESTIMATED','NO_ATOMIC_FORK_TEST','RISK_NOT_CLASSIFIED','SMALLER_AMOUNTS_DIAGNOSTIC_ONLY','MAX_ROUTE_COUNT_LIMIT']};
  fs.writeFileSync('arbiflow-sizing-12961.json',JSON.stringify(report,null,2)+'\n');return report;
 }finally{provider.destroy()}
}
if(require.main===module){assert.equal(fee(10000000000n,5n),5000000n);assert.equal(classify(60000000n,10000000000n,5n).spreadOverHalfPercent,true);assert.equal(classify(50000000n,10000000000n,5n).spreadOverHalfPercent,false);console.log(JSON.stringify({build:'12.9.61',unitAssertionsPassed:3}));if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('SIZING_12961_FAILED',String(e.message).slice(0,120));process.exitCode=1})}
module.exports={run,fee,classify};
