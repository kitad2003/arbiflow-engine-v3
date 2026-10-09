'use strict';
// 12.9.70 research: dynamic sizing for LST/LRT routes versus blue-chip controls.
// Balancer is capital source in calculations; no actual flash loan or transaction.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {TOKENS}=require('./PoolUniverse12939');
const {RpcPacer}=require('./RpcPacer12950');
const TOK={...TOKENS,wstETH:'0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',weETH:'0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A'};
const GROUP={cbETH:'LST',wstETH:'LST',weETH:'LRT',USDT:'BLUE_CHIP',DAI:'BLUE_CHIP'};
const FACTORIES=[{dex:'UNISWAP_V3',address:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',fees:[100,500,3000,10000]},{dex:'PANCAKESWAP_V3',address:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',fees:[100,500,2500,10000]}];
const QUOTERS={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const F=['function getPool(address,address,uint24) view returns(address)'],P=['function token0() view returns(address)','function token1() view returns(address)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','function fee() view returns(uint24)'];
const Q=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const SIZES=[500,1000,2500,5000,10000,25000,50000],MIN_TVL=50000,MAX_TVL=500000,TRIGGER=1.5;
const CAP=Number(process.env.LST_SIZE_ROUTE_LIMIT||25);
function selectBalanced(rows,limit){const bins=new Map();for(const r of rows){const key=r.category+':'+r.path.join('>');if(!bins.has(key))bins.set(key,[]);bins.get(key).push(r)}const out=[];while(out.length<limit){let added=false;for(const a of bins.values()){if(a.length){out.push(a.shift());added=true;if(out.length===limit)break}}if(!added)break}return out}
function best(sizes){const sorted=sizes.filter(s=>s.quoteSuccess).sort((a,b)=>b.afterBalancerBeforeGasUsdc-a.afterBalancerBeforeGasUsdc);return sorted[0]||null}
function gate({tvlUsd,transferSafetyVerified,atomicExitVerified,gasVerified,forkVerified}){return Number.isFinite(tvlUsd)&&tvlUsd>=MIN_TVL&&tvlUsd<=MAX_TVL&&transferSafetyVerified===true&&atomicExitVerified===true&&gasVerified===true&&forkVerified===true}
async function main(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');assert(Number.isInteger(CAP)&&CAP>0&&CAP<=70,'ROUTE_LIMIT_INVALID');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const block=await p.getBlockNumber(),pacer=new RpcPacer({gapMs:110,parallel:2,retries:2}),errors=[];
  const pairs=[['USDC','WETH'],['USDC','USDT'],['USDC','DAI'],...['cbETH','wstETH','weETH'].flatMap(a=>[['USDC',a],['WETH',a]])];
  const pools=[],seen=new Set();
  for(const factory of FACTORIES){const c=new ethers.Contract(factory.address,F,p);
   for(const [a,b] of pairs)for(const fee of factory.fees){
    try{const addr=await pacer.run(()=>c.getPool(TOK[a],TOK[b],fee,{blockTag:block}));if(addr===ethers.ZeroAddress||seen.has(addr.toLowerCase()))continue;
     const pool=new ethers.Contract(addr,P,p),[t0,t1,f,l,slot]=await Promise.all([pool.token0({blockTag:block}),pool.token1({blockTag:block}),pool.fee({blockTag:block}),pool.liquidity({blockTag:block}),pool.slot0({blockTag:block})]);
     if(Number(f)!==fee||l===0n||slot[0]===0n||new Set([t0.toLowerCase(),t1.toLowerCase()]).size!==2||![t0.toLowerCase(),t1.toLowerCase()].includes(TOK[a].toLowerCase())||![t0.toLowerCase(),t1.toLowerCase()].includes(TOK[b].toLowerCase()))continue;
     seen.add(addr.toLowerCase());pools.push({address:addr,dex:factory.dex,a,b,fee});
    }catch(e){errors.push({stage:'DISCOVERY',pair:a+'/'+b,error:String(e?.shortMessage||e?.message||e).slice(0,75)})}
   }
  }
  const decimals={};for(const symbol of ['USDC','WETH','USDT','DAI','cbETH','wstETH','weETH'])try{decimals[symbol]=Number(await new ethers.Contract(TOK[symbol],['function decimals() view returns(uint8)'],p).decimals({blockTag:block}))}catch(e){errors.push({stage:'DECIMALS',symbol,error:String(e?.message||e).slice(0,90)})}
  assert.equal(decimals.USDC,6,'USDC_DECIMALS_INVALID');
  const usdc=new ethers.Contract(TOK.USDC,['function balanceOf(address) view returns(uint256)'],p),bal=BigInt(await usdc.balanceOf(VAULT,{blockTag:block}));
  const collector=await new ethers.Contract(VAULT,['function getProtocolFeesCollector() view returns(address)'],p).getProtocolFeesCollector({blockTag:block});
  const feeWad=BigInt(await new ethers.Contract(collector,['function getFlashLoanFeePercentage() view returns(uint256)'],p).getFlashLoanFeePercentage({blockTag:block}));
  const quoters=Object.fromEntries(Object.entries(QUOTERS).map(([name,addr])=>[name,new ethers.Contract(addr,Q,p)])),cache=new Map();
  async function quote(pool,from,to,amount){const key=pool.address.toLowerCase()+':'+from+':'+amount;
   if(cache.has(key))return cache.get(key);
   const out=BigInt((await pacer.run(()=>quoters[pool.dex].quoteExactInputSingle.staticCall([TOK[from],TOK[to],amount,pool.fee,0],{blockTag:block})))[0]);
   cache.set(key,out);return out;
  }
  const candidates=[];
  for(const asset of Object.keys(GROUP)){
   const usdcAsset=pools.filter(x=>x.a==='USDC'&&x.b===asset),ethAsset=pools.filter(x=>x.a==='WETH'&&x.b===asset),usdcEth=pools.filter(x=>x.a==='USDC'&&x.b==='WETH');
   for(const a of usdcAsset)for(const b of usdcAsset)if(a.address.toLowerCase()!==b.address.toLowerCase())candidates.push({category:GROUP[asset],path:['USDC',asset,'USDC'],legs:[[a,'USDC',asset],[b,asset,'USDC']]});
   for(const a of usdcEth)for(const b of ethAsset)for(const c of usdcAsset)candidates.push({category:GROUP[asset],path:['USDC','WETH',asset,'USDC'],legs:[[a,'USDC','WETH'],[b,'WETH',asset],[c,asset,'USDC']]});
  }
  const chosen=selectBalanced(candidates,CAP),results=[];
  for(const r of chosen){
   const row={category:r.category,path:r.path.join('>'),pools:r.legs.map(x=>x[0].address),sizes:[],tvlUsd:null,tvlVerified:false,transferSafetyVerified:false,atomicExitVerified:false};
   for(const size of SIZES){
    const amount=BigInt(size)*1000000n,entry={sizeUsdc:size,quoteSuccess:false,borrowableByVaultBalance:amount<=bal,qualified:false};
    if(amount>bal){entry.error='INSUFFICIENT_VAULT_BALANCE';row.sizes.push(entry);continue}
    try{let result=amount;for(const [pool,a,b] of r.legs)result=await quote(pool,a,b,result);
     const fee=(amount*feeWad+10n**18n-1n)/10n**18n,margin=result-amount-fee;
     Object.assign(entry,{quoteSuccess:true,returnedUsdc:Number(result)/1e6,grossUsdc:Number(result-amount)/1e6,spreadPct:Number(result-amount)*100/Number(amount),afterBalancerBeforeGasUsdc:Number(margin)/1e6,positiveBeforeGas:margin>0n,spreadGtHalfPercent:(result-amount)*10000n>amount*50n});
     if(result<amount*85n/100n){entry.severePriceImpact=true;row.sizes.push(entry);break}
    }catch(e){entry.error=String(e?.shortMessage||e?.message||e).slice(0,90);errors.push({stage:'QUOTE',route:row.path,size,error:entry.error})}
    row.sizes.push(entry);
   }
   const b=best(row.sizes);row.bestDiagnosticSize=b?b.sizeUsdc:null;row.bestAfterBalancerBeforeGasUsdc=b?b.afterBalancerBeforeGasUsdc:null;
   row.qualificationBlocked=['TVL_NOT_VERIFIED','TRANSFER_SAFETY_NOT_VERIFIED','ATOMIC_EXIT_NOT_VERIFIED','GAS_NOT_VERIFIED','HARDHAT_FORK_NOT_RUN'];
   results.push(row);
  }
  const summary={};for(const kind of ['LST','LRT','BLUE_CHIP']){const rows=results.filter(x=>x.category===kind),tests=rows.flatMap(x=>x.sizes.filter(s=>s.quoteSuccess));summary[kind]={routes:rows.length,quoteSizeEvaluations:tests.length,positiveAfterBalancerBeforeGas:tests.filter(x=>x.positiveBeforeGas).length,bestCandidates:rows.filter(x=>x.bestDiagnosticSize!=null).sort((a,b)=>b.bestAfterBalancerBeforeGasUsdc-a.bestAfterBalancerBeforeGasUsdc).slice(0,3).map(x=>({path:x.path,bestSize:x.bestDiagnosticSize,afterBalancerBeforeGasUsdc:x.bestAfterBalancerBeforeGasUsdc}))}}
  const out={build:'12.9.70',mode:'DYNAMIC_LOAN_SIZE_RESEARCH',block,settings:{minTvlUsd:MIN_TVL,maxTvlUsd:MAX_TVL,volatilityTrigger5mPct:TRIGGER,dynamicSizesUsdc:SIZES},
   observedEthVolatility5mPct:null,volatilityTriggerVerified:false,discoveredPools:pools.length,candidatesDiscovered:candidates.length,candidatesTested:chosen.length,
   balancerV2:{vault:VAULT,availableUsdc:Number(bal)/1e6,feePercentageWad:feeWad.toString()},summary,results,errors:errors.slice(0,80),rpcPacer:pacer.stats,
   limitations:['NO_VERIFIED_TVL_VALUATION','NO_5_MIN_ETH_VOLATILITY_HISTORY_IN_THIS_RUN','NO_TRANSFER_SAFETY_SIMULATION','NO_ATOMIC_FORK_EXECUTION','NO_GAS_L1_COSTS','ROUTE_SAMPLE'],qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
  fs.writeFileSync('arbiflow-lst-sizing-12970.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,results:undefined}));return out;
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(selectBalanced([{category:'LST',path:['A']},{category:'LST',path:['A']},{category:'LRT',path:['B']}],2).length,2);
 assert.equal(best([{quoteSuccess:true,sizeUsdc:500,afterBalancerBeforeGasUsdc:-1},{quoteSuccess:true,sizeUsdc:1000,afterBalancerBeforeGasUsdc:2}]).sizeUsdc,1000);
 assert.equal(gate({tvlUsd:100000,transferSafetyVerified:false,atomicExitVerified:true,gasVerified:true,forkVerified:true}),false);
 console.log(JSON.stringify({build:'12.9.70',unitAssertionsPassed:3}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else main(process.env.BASE_RPC_URL).catch(e=>{console.error('LST_SIZING_FAILED',String(e?.message||e).slice(0,180));process.exitCode=1});
}
module.exports={main,selectBalanced,best,gate};
