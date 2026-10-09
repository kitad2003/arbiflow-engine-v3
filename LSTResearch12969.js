'use strict';
// 12.9.69 test research hypotheses: LST/LRT vs blue chip; read-only Base.
// TVL and token-safety checks are explicit gates, never inferred from V3 liquidity().
const {ethers}=require('ethers'),fs=require('node:fs'),assert=require('node:assert/strict');
const {TOKENS}=require('./PoolUniverse12939');
const BASE={...TOKENS,wstETH:'0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',weETH:'0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A'};
const TYPES={cbETH:'LST',wstETH:'LST',weETH:'LRT',WETH:'BLUE_CHIP',USDT:'BLUE_CHIP',DAI:'BLUE_CHIP'};
const UNI='0x33128a8fC17869897dcE68Ed026d694621f6FDfD',PAN='0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const QUOTERS={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const F=['function getPool(address,address,uint24) view returns(address)'],P=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)'];
const ERC=['function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)'];
const Q=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const OPT={minTvl:50000,maxTvl:500000,loanUsdc:1000,triggerPct:1.5};
const FEES={UNISWAP_V3:[100,500,3000,10000],PANCAKESWAP_V3:[100,500,2500,10000]};
function classify(symbol){return TYPES[symbol]||'UNSUPPORTED'}
function withinTvl(tvl,min=OPT.minTvl,max=OPT.maxTvl){return Number.isFinite(tvl)&&tvl>=min&&tvl<=max}
function gate({tvlUsd,tokenSafetyVerified=false,instantExitVerified=false,triggerPassed=false}){
 const failures=[];if(!Number.isFinite(tvlUsd))failures.push('TVL_UNVERIFIED');else if(!withinTvl(tvlUsd))failures.push('OUTSIDE_TVL_RANGE');
 if(!tokenSafetyVerified)failures.push('TOKEN_SAFETY_UNVERIFIED');if(!instantExitVerified)failures.push('ATOMIC_EXIT_UNVERIFIED');
 if(!triggerPassed)failures.push('ETH_VOLATILITY_TRIGGER_NOT_MET_OR_UNVERIFIED');
 return {eligible:failures.length===0,failures};
}
async function atTimestamp(p,now,secondsAgo){const desired=now.timestamp-secondsAgo;let low=Math.max(0,now.number-2500),high=now.number;while(low<high){const m=Math.floor((low+high+1)/2),b=await p.getBlock(m);if(!b||b.timestamp>desired)high=m-1;else low=m}return low}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),errors=[];
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const block=await p.getBlockNumber(),now=await p.getBlock(block),prior=await atTimestamp(p,now,300);
  const factories=[{dex:'UNISWAP_V3',address:UNI},{dex:'PANCAKESWAP_V3',address:PAN}],pools=[],seen=new Set();
  const basePairs=[['USDC','WETH'],['USDC','USDT'],['USDC','DAI']];
  for(const token of ['cbETH','wstETH','weETH'])basePairs.push(['USDC',token],['WETH',token]);
  for(const f of factories){const fac=new ethers.Contract(f.address,F,p);
   for(const [a,b] of basePairs)for(const fee of FEES[f.dex]){
    try{
     const addr=await fac.getPool(BASE[a],BASE[b],fee,{blockTag:block});
     if(addr===ethers.ZeroAddress||seen.has(addr.toLowerCase()))continue;
     const pool=new ethers.Contract(addr,P,p),[t0,t1,actualFee,liq,slot]=await Promise.all([
      pool.token0({blockTag:block}),pool.token1({blockTag:block}),pool.fee({blockTag:block}),pool.liquidity({blockTag:block}),pool.slot0({blockTag:block})]);
     if(![BASE[a].toLowerCase(),BASE[b].toLowerCase()].includes(t0.toLowerCase())||new Set([t0.toLowerCase(),t1.toLowerCase()]).size!==2||Number(actualFee)!==fee||liq<=0n||slot[0]<=0n)continue;
     seen.add(addr.toLowerCase());pools.push({dex:f.dex,address:addr,a,b,fee,liquidityRaw:liq.toString(),token0:t0});
    }catch(e){errors.push({stage:'POOL_DISCOVERY',pair:a+'/'+b,dex:f.dex,code:String(e?.shortMessage||e?.message||e).slice(0,75)})}
   }
  }
  const dec={};for(const [symbol,addr] of Object.entries(BASE)){if(!['USDC','USDT','DAI','WETH','cbETH','wstETH','weETH'].includes(symbol))continue;
   try{const c=new ethers.Contract(addr,ERC,p);dec[symbol]=Number(await c.decimals({blockTag:block}));assert(dec[symbol]>=0&&dec[symbol]<=36)}catch(e){errors.push({stage:'TOKEN_DECIMALS',symbol,error:String(e?.message||e).slice(0,80)})}
  }
  const quoters=Object.fromEntries(Object.entries(QUOTERS).map(([dex,addr])=>[dex,new ethers.Contract(addr,Q,p)]));
  async function quote(pool,from,to,amount,tag=block){return BigInt((await quoters[pool.dex].quoteExactInputSingle.staticCall([BASE[from],BASE[to],amount,pool.fee,0],{blockTag:tag}))[0])}
  // Benchmark WETH in USDC over an exact five-minute block interval.
  const ethPools=pools.filter(x=>x.a==='USDC'&&x.b==='WETH');
  let ethChangePct=null,ethFeed=null;
  for(const pool of ethPools){try{
   if(dec.WETH==null||dec.USDC==null)break;
   const wethAmount=10n**BigInt(dec.WETH);
   const [oldQuote,newQuote]=await Promise.all([quote(pool,'WETH','USDC',wethAmount,prior),quote(pool,'WETH','USDC',wethAmount,block)]);
   if(oldQuote>0n){ethChangePct=(Number(newQuote)/Number(oldQuote)-1)*100;ethFeed=pool.address;break}
  }catch(e){errors.push({stage:'ETH_VOLATILITY',pool:pool.address,error:String(e?.shortMessage||e?.message||e).slice(0,75)})}}
  const triggered=ethChangePct!==null&&Math.abs(ethChangePct)>OPT.triggerPct;
  const vaultUsdc=BigInt(await new ethers.Contract(BASE.USDC,ERC,p).balanceOf(VAULT,{blockTag:block}));
  // Research quote routes for both derivative category and blue-chip control.
  // TVL is not estimated from liquidity(); full verified USD reserves require separate pricing integration.
  const results=[];
  for(const symbol of ['cbETH','wstETH','weETH','USDT','DAI']){
   const group=pools.filter(x=>x.a==='USDC'&&x.b===symbol),ethLeg=pools.filter(x=>x.a==='WETH'&&x.b===symbol);
   const paths=[];for(const first of group)for(const second of group)if(first.address.toLowerCase()!==second.address.toLowerCase())paths.push({path:['USDC',symbol,'USDC'],legs:[[first,'USDC',symbol],[second,symbol,'USDC']]});
   for(const first of ethPools)for(const middle of ethLeg)for(const last of group)paths.push({path:['USDC','WETH',symbol,'USDC'],legs:[[first,'USDC','WETH'],[middle,'WETH',symbol],[last,symbol,'USDC']]});
   let done=0;
   for(const route of paths){if(done>=8)break;done++;
    const entry={asset:symbol,category:classify(symbol),path:route.path.join('>'),pools:route.legs.map(l=>l[0].address),loanUsdc:OPT.loanUsdc,loanPrincipalFromUser:false,
     poolTvlUsd:null,tvlVerification:'UNAVAILABLE',tokenSafetyVerified:false,instantExitVerified:route.legs.every(l=>l[0]?.address!=null),
     volatilityTriggered:triggered,qualified:false,atomicForkVerified:false,gasVerified:false};
    entry.researchGate=gate({tvlUsd:null,tokenSafetyVerified:false,instantExitVerified:entry.instantExitVerified,triggerPassed:triggered});
    if(dec.USDC==null||dec[symbol]==null){entry.error='TOKEN_DECIMALS_UNAVAILABLE';results.push(entry);continue}
    try{let v=BigInt(OPT.loanUsdc)*10n**BigInt(dec.USDC);for(const [pool,a,b] of route.legs){assert(dec[a]!=null&&dec[b]!=null,'TOKEN_DECIMALS_MISSING');v=await quote(pool,a,b,v)}
     const loan=BigInt(OPT.loanUsdc)*10n**BigInt(dec.USDC);entry.returnRaw=v.toString();entry.grossUsdc=Number(v-loan)/10**dec.USDC;
     entry.spreadPct=entry.grossUsdc/OPT.loanUsdc*100;entry.positiveGross=v>loan;entry.spreadGtHalfPercent=(v-loan)*10000n>loan*50n;
    }catch(e){entry.error=String(e?.shortMessage||e?.message||e).slice(0,100)}
    results.push(entry);
   }
  }
  const groups={};for(const type of ['LST','LRT','BLUE_CHIP']){const x=results.filter(r=>r.category===type);groups[type]={evaluated:x.length,quoted:x.filter(r=>r.returnRaw!==undefined).length,positiveGross:x.filter(r=>r.positiveGross).length,bestBeforeCosts:x.filter(r=>r.returnRaw!==undefined).sort((a,b)=>b.grossUsdc-a.grossUsdc).slice(0,4).map(r=>({path:r.path,grossUsdc:r.grossUsdc,spreadPct:r.spreadPct}))}}
  const output={build:'12.9.69',mode:'RESEARCH_HYPOTHESIS_LST_LRT_VS_BLUECHIP',block,priorBlock:prior,settings:OPT,
   ethVolatility5mPct:ethChangePct,ethTriggerPassed:triggered,ethPricePool:ethFeed,verifiedPoolCount:pools.length,groupSummary:groups,
   balancerV2:{availableUsdc:Number(vaultUsdc)/10**(dec.USDC||6),principalRequested:false},
   results,errors:errors.slice(0,75),tvlMeasure:'NOT_VERIFIED_NO_TVL_FEED',tokenSafety:'NOT_VERIFIED_NO_HONEYPOT_OR_TRANSFER_SIMULATION',
   qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,
   limitations:['TVL_BOUNDS_NOT_ENFORCEABLE_UNTIL_USD_RESERVE_VALUATION','TOKEN_TRANSFER_SAFETY_NOT_PROVEN','LST_REDEMPTION_NOT_ASSUMED_INSTANT','QUOTES_NOT_HARDHAT_EXECUTION','NO_GAS_OR_SLIPPAGE_BUFFER','SAMPLED_ROUTES']};
  fs.writeFileSync('arbiflow-lst-research-12969.json',JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({...output,results:undefined}));return output;
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(classify('weETH'),'LRT');assert.equal(withinTvl(50000),true);assert.equal(withinTvl(500001),false);assert.equal(gate({tvlUsd:null}).eligible,false);
 console.log(JSON.stringify({build:'12.9.69',unitAssertionsPassed:4}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL).catch(e=>{console.error('LST_RESEARCH_FAILED',String(e?.message||e).slice(0,180));process.exitCode=1})}
module.exports={run,gate,withinTvl,classify};
