'use strict';
// Read-only pinned-block exact-quote diagnostic. No signing or execution.
const fs=require('node:fs');
const {ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const {enumerate,quoteRoute}=require('./CryptoArbitrageRoutes12959');
const {selectDiversified}=require('./DiversifiedRouteSelection12962');
const QUOTERS={UNISWAP_V3:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',PANCAKESWAP_V3:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'};
const V3=['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)'];
const V1=['function getAmountOut(uint256,address) view returns(uint256)'];
const SIZES=[100,500,1000,2500,5000,10000,25000,50000];
function select(routes,n){
 return selectDiversified(routes,n);
}
async function run(rpc){
 if(!/^https:\/\//.test(rpc||''))throw Error('BASE_RPC_URL_REQUIRED');
 const d=await discover(rpc);if(!d.success)throw Error('DISCOVERY_FAILED');
 const g=enumerate(d.pools,{anchors:['USDC'],maxRoutes:50000});
 const count=Math.min(30,Math.max(1,Number(process.env.ROUTES_PER_TYPE||5)));
 const routes=select(g.routes,count);
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const v3=Object.fromEntries(Object.entries(QUOTERS).map(([k,a])=>[k,new ethers.Contract(a,V3,provider)]));
  const v1=new Map(),results=[],errors={};
  async function quote(edge,amount){
   if(edge.kind==='v1'){
    if(!v1.has(edge.pool))v1.set(edge.pool,new ethers.Contract(edge.pool,V1,provider));
    return BigInt(await v1.get(edge.pool).getAmountOut(amount,TOKENS[edge.from],{blockTag:d.confirmedBlock}));
   }
   if(!v3[edge.dex])throw Error('UNSUPPORTED_VENUE');
   const result=await v3[edge.dex].quoteExactInputSingle.staticCall([TOKENS[edge.from],TOKENS[edge.to],amount,Number(edge.fee),0],{blockTag:d.confirmedBlock});
   return BigInt(result[0]);
  }
  for(const route of routes)for(const size of SIZES){
   const amount=BigInt(size)*1000000n;
   const item={type:route.type,path:route.tokenPath,venues:route.legs.map(e=>e.dex),pools:route.legs.map(e=>e.pool),sizeUsdc:size};
   try{
    const output=await quoteRoute(route,amount,quote);
    const gross=output-amount;
    Object.assign(item,{success:true,outputRaw:output.toString(),grossUsdc:Number(gross)/1e6,positiveGross:gross>0n,spreadOverHalfPercent:gross*10000n>amount*50n});
   }catch(e){
    const reason=String(e?.shortMessage||e?.message||e).slice(0,100);
    item.success=false;item.reason=reason;errors[reason]=(errors[reason]||0)+1;
   }
   results.push(item);
  }
  const good=results.filter(r=>r.success);
  const report={build:'12.9.62',mode:'READ_ONLY_PINNED_BLOCK_CRYPTO_QUOTES',block:d.confirmedBlock,discoveredPools:d.uniqueActivePools,generatedRoutes:g.generated,routeGraphTruncated:g.truncated,selectedRoutes:routes.length,selectedTokenPaths:[...new Set(routes.map(r=>r.tokenPath.join('>')))],sizesUsdc:SIZES,attempted:results.length,successful:good.length,failed:results.length-good.length,positiveGross:good.filter(r=>r.positiveGross).length,errors,topGross:good.sort((a,b)=>b.grossUsdc-a.grossUsdc).slice(0,15),allResults:results,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,limitations:['NO_FLASH_LOAN_FEE','NO_GAS_COST','NO_ATOMIC_FORK_SETTLEMENT','BOUNDED_ROUTE_SAMPLE','NO_CEX_MARKETS','UNVERIFIED_POOL_DISCOVERY_ERRORS']};
  fs.writeFileSync('arbiflow-crypto-quote-audit.json',JSON.stringify(report,null,2)+'\n');
  return {...report,allResults:undefined};
 }finally{provider.destroy()}
}
if(require.main===module){
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('QUOTE_AUDIT_FAILED',String(e?.message||e).slice(0,150));process.exitCode=1});
}
module.exports={run,select};
