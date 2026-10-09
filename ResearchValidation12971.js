'use strict';
// ArbiFlow 12.9.71 empirical TVL, five-minute volatility, LST/LRT/long-tail vs controls.
// Read-only. Indicative quote-derived TVL is NOT independent oracle verification.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {TOKENS}=require('./PoolUniverse12939');
const {RpcPacer}=require('./RpcPacer12950');
const T={...TOKENS,wstETH:'0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',weETH:'0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A'};
const CATEGORY={USDT:'BLUE_CHIP',DAI:'BLUE_CHIP',WETH:'BLUE_CHIP',cbETH:'LST',wstETH:'LST',weETH:'LRT',AERO:'LONG_TAIL',VIRTUAL:'LONG_TAIL',BRETT:'LONG_TAIL'};
const F=[{dex:'UNISWAP_V3',addr:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',fees:[100,500,3000,10000],quoter:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2'},
{dex:'PANCAKESWAP_V3',addr:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',fees:[100,500,2500,10000],quoter:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'}];
const FACT=['function getPool(address,address,uint24) view returns(address)'];
const POOL=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)'];
const TOKEN=['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)'];
const QUOTE=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const SIZES=[500,1000,2500,5000,10000,25000,50000],SET={minTvlUsd:50000,maxTvlUsd:500000,ethFiveMinuteTriggerPct:1.5};
const LIMIT=Number(process.env.RESEARCH_12971_ROUTE_LIMIT||60);
async function blockAt(p,end,target){let lo=Math.max(0,end.number-3000),hi=end.number;while(lo<hi){const mid=Math.ceil((lo+hi)/2),b=await p.getBlock(mid);if(b.timestamp<=target)lo=mid;else hi=mid-1}return lo}
function bands(v){return v==null?'UNVERIFIED':v<SET.minTvlUsd?'BELOW_RANGE':v>SET.maxTvlUsd?'ABOVE_RANGE':'IN_RANGE_INDICATIVE'}
function best(rows){return rows.filter(x=>x.quoteSuccess).sort((a,b)=>b.afterBalancerBeforeGasUsdc-a.afterBalancerBeforeGasUsdc)[0]||null}
function shortlist(routes,max){const groups=new Map();for(const r of routes){const k=r.category+'|'+r.path.join('>');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
 const out=[];while(out.length<max){let found=false;for(const group of groups.values()){if(group.length){out.push(group.shift());found=true;if(out.length===max)break}}if(!found)break}return out}
async function main(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(Number.isInteger(LIMIT)&&LIMIT>0&&LIMIT<=150,'BAD_LIMIT');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),errors=[],pacer=new RpcPacer({gapMs:110,parallel:2,retries:2});
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const block=await p.getBlockNumber(),end=await p.getBlock(block),old=await blockAt(p,end,end.timestamp-300),dec={};
  for(const k of ['USDC','WETH',...Object.keys(CATEGORY)]){if(dec[k]!=null)continue;
   try{dec[k]=Number(await pacer.run(()=>new ethers.Contract(T[k],TOKEN,p).decimals({blockTag:block})))}catch(e){errors.push({stage:'DECIMALS',token:k,error:String(e?.shortMessage||e?.message||e).slice(0,90)})}}
  assert.equal(dec.USDC,6,'USDC_DECIMALS_INVALID');
  const pairs=[['USDC','WETH'],...Object.keys(CATEGORY).filter(x=>x!=='WETH').flatMap(t=>[['USDC',t],['WETH',t]])],pools=[],known=new Set(),quoters={};
  for(const f of F){const fac=new ethers.Contract(f.addr,FACT,p);quoters[f.dex]=new ethers.Contract(f.quoter,QUOTE,p);
   for(const [a,b] of pairs)for(const fee of f.fees){
    try{const addr=await pacer.run(()=>fac.getPool(T[a],T[b],fee,{blockTag:block}));
     if(addr===ethers.ZeroAddress||known.has(addr.toLowerCase()))continue;
     const pool=new ethers.Contract(addr,POOL,p),[t0,t1,actualFee,liq,slot]=await Promise.all([
      pool.token0({blockTag:block}),pool.token1({blockTag:block}),pool.fee({blockTag:block}),pool.liquidity({blockTag:block}),pool.slot0({blockTag:block})]);
     const expected=[T[a].toLowerCase(),T[b].toLowerCase()].sort();
     if([t0.toLowerCase(),t1.toLowerCase()].sort().join()!==expected.join()||fee!==Number(actualFee)||liq<=0n||slot[0]<=0n)continue;
     known.add(addr.toLowerCase());pools.push({address:addr,dex:f.dex,a,b,fee,token0:t0,token1:t1});
    }catch(e){errors.push({stage:'DISCOVERY',pair:a+'/'+b,dex:f.dex,error:String(e?.shortMessage||e?.message||e).slice(0,90)})}
   }
  }
  const cache=new Map();
  async function quote(pool,a,b,amount,tag=block){const key=pool.address+':'+a+':'+amount+':'+tag;if(cache.has(key))return cache.get(key);
   const out=BigInt((await pacer.run(()=>quoters[pool.dex].quoteExactInputSingle.staticCall([T[a],T[b],amount,pool.fee,0],{blockTag:tag})))[0]);
   cache.set(key,out);return out}
  const ep=pools.filter(x=>x.a==='USDC'&&x.b==='WETH');let ethMove=null,ethSource=null,ethUsd=null;
  for(const x of ep){try{const one=10n**BigInt(dec.WETH);
    const before=await quote(x,'WETH','USDC',one,old),after=await quote(x,'WETH','USDC',one);
    if(before>0n&&after>0n){ethMove=(Number(after)/Number(before)-1)*100;ethUsd=Number(after)/1e6;ethSource=x.address;break}
   }catch(e){errors.push({stage:'ETH_PRICE',pool:x.address,error:String(e?.shortMessage||e?.message||e).slice(0,90)})}}
  // Pool reserve balances are real onchain. USD valuation is inferred from exact swap
  // quotes, so it is indicative, NOT a verified TVL oracle. Independently unpriced assets remain null.
  const prices={USDC:1};if(ethUsd!=null)prices.WETH=ethUsd;
  for(const asset of Object.keys(CATEGORY)){if(asset==='WETH'||asset==='USDC')continue;
   const usdcPools=pools.filter(x=>x.a==='USDC'&&x.b===asset),one=dec[asset]!=null?10n**BigInt(dec[asset]):null;
   if(one==null)continue;
   for(const x of usdcPools){try{const val=await quote(x,asset,'USDC',one);if(val>0n){prices[asset]=Number(val)/1e6;break}}catch{}}
  }
  for(const pool of pools){try{
   const [r0,r1]=await Promise.all([new ethers.Contract(T[pool.a],TOKEN,p).balanceOf(pool.address,{blockTag:block}),new ethers.Contract(T[pool.b],TOKEN,p).balanceOf(pool.address,{blockTag:block})]);
   const v0=Number(r0)/10**dec[pool.a],v1=Number(r1)/10**dec[pool.b];
   pool.reserveAmounts={[pool.a]:v0,[pool.b]:v1};
   pool.tvlUsdIndicative=prices[pool.a]!=null&&prices[pool.b]!=null?v0*prices[pool.a]+v1*prices[pool.b]:null;
   pool.tvlBand=bands(pool.tvlUsdIndicative);pool.independentTvlOracleVerified=false;
  }catch(e){pool.tvlUsdIndicative=null;pool.tvlBand='UNVERIFIED';errors.push({stage:'RESERVES',pool:pool.address,error:String(e?.shortMessage||e?.message||e).slice(0,90)})}}
  const routes=[];
  for(const asset of Object.keys(CATEGORY).filter(k=>k!=='WETH')){
   const direct=pools.filter(x=>x.a==='USDC'&&x.b===asset),through=pools.filter(x=>x.a==='WETH'&&x.b===asset);
   for(const a of direct)for(const b of direct)if(a.address.toLowerCase()!==b.address.toLowerCase())routes.push({category:CATEGORY[asset],path:['USDC',asset,'USDC'],legs:[[a,'USDC',asset],[b,asset,'USDC']]});
   for(const a of ep)for(const b of through)for(const c of direct)routes.push({category:CATEGORY[asset],path:['USDC','WETH',asset,'USDC'],legs:[[a,'USDC','WETH'],[b,'WETH',asset],[c,asset,'USDC']]});
  }
  const bal=BigInt(await new ethers.Contract(T.USDC,TOKEN,p).balanceOf(VAULT,{blockTag:block}));
  const collector=await new ethers.Contract(VAULT,['function getProtocolFeesCollector() view returns(address)'],p).getProtocolFeesCollector({blockTag:block});
  const feeWad=BigInt(await new ethers.Contract(collector,['function getFlashLoanFeePercentage() view returns(uint256)'],p).getFlashLoanFeePercentage({blockTag:block}));
  const selection=shortlist(routes,LIMIT),results=[];
  for(const route of selection){
   const poolTvl=route.legs.map(x=>x[0].tvlUsdIndicative),bandsRoute=route.legs.map(x=>x[0].tvlBand);
   const row={category:route.category,path:route.path.join('>'),pools:route.legs.map(x=>x[0].address),indicativePoolTvlUsd:poolTvl,poolTvlBands:bandsRoute,
    researchTvlWindowMatched:bandsRoute.every(x=>x==='IN_RANGE_INDICATIVE'),independentTvlOracleVerified:false,tokenSafetyVerified:false,
    instantExitForkVerified:false,sizes:[]};
   for(const dollars of SIZES){const principal=BigInt(dollars)*1000000n,entry={sizeUsdc:dollars,borrowableByVault:principal<=bal,quoteSuccess:false,qualified:false};
    if(principal>bal){entry.error='VAULT_BALANCE_INSUFFICIENT';row.sizes.push(entry);continue}
    try{let amount=principal;for(const [pool,a,b] of route.legs)amount=await quote(pool,a,b,amount);
     const fee=(principal*feeWad+10n**18n-1n)/10n**18n,profit=amount-principal-fee;
     Object.assign(entry,{quoteSuccess:true,returnUsdc:Number(amount)/1e6,spreadPct:Number(amount-principal)/Number(principal)*100,
      afterBalancerBeforeGasUsdc:Number(profit)/1e6,positiveBeforeGas:profit>0n,spreadGtHalfPercent:(amount-principal)*10000n>principal*50n});
     // All diagnostic sizes remain in the report; no premature negative-price stop.
    }catch(e){entry.error=String(e?.shortMessage||e?.message||e).slice(0,90);errors.push({stage:'QUOTE',path:row.path,dollars,error:entry.error})}
    row.sizes.push(entry);
   }
   const b=best(row.sizes);row.bestSizeUsdc=b?.sizeUsdc??null;row.bestBeforeGasUsdc=b?.afterBalancerBeforeGasUsdc??null;
   row.qualificationBlocked=['NO_INDEPENDENT_TVL_ORACLE','TOKEN_TRANSFER_SAFETY_UNVERIFIED','ATOMIC_EXECUTION_UNVERIFIED','GAS_UNVERIFIED'];results.push(row);
  }
  const summary={};for(const category of ['BLUE_CHIP','LST','LRT','LONG_TAIL']){const rr=results.filter(x=>x.category===category),qq=rr.flatMap(x=>x.sizes.filter(v=>v.quoteSuccess));summary[category]={routes:rr.length,quoteEvaluations:qq.length,positiveBeforeGas:qq.filter(x=>x.positiveBeforeGas).length,indicativeTvlWindowRoutes:rr.filter(x=>x.researchTvlWindowMatched).length,best:rr.filter(x=>x.bestSizeUsdc!=null).sort((a,b)=>b.bestBeforeGasUsdc-a.bestBeforeGasUsdc).slice(0,3).map(x=>({path:x.path,size:x.bestSizeUsdc,profitBeforeGas:x.bestBeforeGasUsdc}))}}
  const out={build:'12.9.71',mode:'EMPIRICAL_RESEARCH_COVERAGE_READ_ONLY',block,priorBlock:old,settings:{...SET,dynamicSizesUsdc:SIZES},
   ethFiveMinuteMovePct:ethMove,ethTriggerMet:ethMove!=null&&Math.abs(ethMove)>SET.ethFiveMinuteTriggerPct,ethReferencePool:ethSource,
   poolsDiscovered:pools.length,candidatesDiscovered:routes.length,candidatesTested:selection.length,poolTvlBands:{inRange:pools.filter(x=>x.tvlBand==='IN_RANGE_INDICATIVE').length,outOfRange:pools.filter(x=>x.tvlBand==='BELOW_RANGE'||x.tvlBand==='ABOVE_RANGE').length,unverified:pools.filter(x=>x.tvlBand==='UNVERIFIED').length},
   valuationMethod:'ONCHAIN_ERC20_POOL_BALANCES_TIMES_SINGLE_POOL_EXACT_QUOTE_DERIVED_USD_PRICES_INDICATIVE_NOT_ORACLE_VERIFIED',
   balancer:{vault:VAULT,availableUsdc:Number(bal)/1e6,feeWad:feeWad.toString(),borrowed:false},summary,pools,results,
   errors:errors.slice(0,100),rpcPacer:pacer.stats,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,
   limitations:['QUOTED_TVL_NOT_INDEPENDENT_ORACLE_VERIFIED','TRANSFER_TOKEN_SAFETY_NOT_VALIDATED','NO_CURVE_AERODROME_ADAPTER_YET','NO_ATOMIC_HARDHAT_FORK','NO_GAS_L1_COST','NO_REALTIME_VOLATILITY_MONITORING_SINGLE_FIVE_MINUTE_WINDOW','ROUTE_SAMPLING']};
  fs.writeFileSync('arbiflow-research-validation-12971.json',JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({...out,pools:undefined,results:undefined}));return out;
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(bands(50000),'IN_RANGE_INDICATIVE');assert.equal(bands(500001),'ABOVE_RANGE');assert.equal(shortlist([{category:'LST',path:['A']},{category:'LST',path:['A']},{category:'LRT',path:['B']}],2).length,2);console.log(JSON.stringify({build:'12.9.71',unitAssertionsPassed:3}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else main(process.env.BASE_RPC_URL).catch(e=>{console.error('RESEARCH_12971_FAILED',String(e?.shortMessage||e?.message||e).slice(0,180));process.exitCode=1})}
module.exports={main,blockAt,bands,shortlist};
