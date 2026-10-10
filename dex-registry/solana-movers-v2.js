'use strict';
// Read-only Solana top-mover discovery. Indexer fields are NOT on-chain safety attestations.
const BASE='https://api.geckoterminal.com/api/v2';
const MIN_TVL=20000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function address(id){const x=String(id||'');const v=x.startsWith('solana_')?x.slice(7):x;return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)?v:null}
function normalize(pool){
 const a=pool?.attributes||{},r=pool?.relationships||{};
 const token0=address(r.base_token?.data?.id),token1=address(r.quote_token?.data?.id);
 const poolAddress=address(a.address),dexLabel=String(r.dex?.data?.id||'');
 const liquidityUsd=Number(a.reserve_in_usd);
 const change=a.price_change_percentage||{};
 if(!poolAddress||!token0||!token1||!dexLabel||!Number.isFinite(liquidityUsd))return null;
 return {symbol:String(a.name||''),network:'solana',poolAddress,dexLabel,baseMint:token0,quoteMint:token1,liquidityUsd,change5m:Number(change.m5)||0,change1h:Number(change.h1)||0,source:'GECKOTERMINAL_UNVERIFIED',safetyVerified:false,quoteVerified:false,executionEligible:false};
}
function select(pools,{minLiquidityUsd=MIN_TVL}={}){
 const valid=pools.map(normalize).filter(x=>x&&x.liquidityUsd>=minLiquidityUsd);
 const groups=new Map();
 for(const p of valid){const k=[p.baseMint,p.quoteMint].sort().join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
 const matches=[...groups.values()].filter(g=>new Set(g.map(p=>p.dexLabel)).size>=2);
 const sorted=matches.flat().sort((a,b)=>Math.max(Math.abs(b.change5m),Math.abs(b.change1h))-Math.max(Math.abs(a.change5m),Math.abs(a.change1h)));
 return {allLiquidityQualified:valid.length,crossDexPairs:matches.length,crossDexPools:sorted};
}
async function discover({fetchImpl=fetch,pages=3,delayMs=2200,retries=2}={}){
 const pools=[],errors=[];
 for(let page=1;page<=pages;page++){
  if(page>1)await sleep(delayMs);
  const url=`${BASE}/networks/solana/pools?page=${page}`;
  let success=false;
  for(let attempt=0;attempt<=retries;attempt++){
   try{
    const res=await fetchImpl(url,{headers:{accept:'application/json'}});
    if(!res.ok){if((res.status===429||res.status>=500)&&attempt<retries){await sleep(delayMs*(attempt+1));continue}throw Error('HTTP_'+res.status)}
    const body=await res.json();if(!Array.isArray(body.data))throw Error('INVALID_API_DATA');
    pools.push(...body.data);success=true;break;
   }catch(e){if(attempt===retries){errors.push({page,reason:String(e.message).slice(0,100)})}else await sleep(delayMs*(attempt+1))}
  }
  if(!success)continue;
 }
 const result=select(pools);
 return {build:'ARBIFLOW_SOLANA_MOVERS_V2',mode:'READ_ONLY_UNVERIFIED_INDEXER_DISCOVERY',pagesRequested:pages,poolsFetched:pools.length,discoveryErrors:errors,...result,verifiedSafePools:0,verifiedProfitableRoutes:0,alerts:[],mainnetBroadcast:false,bundlesSubmitted:0,limitations:['NOT_A_COMPLETE_TOP_MOVERS_RANKING','TOKEN_AUTHORITIES_AND_TAXES_NOT_VERIFIED','NO_ONCHAIN_LIQUIDITY_OR_EXECUTABLE_QUOTES','NO_PROFITABILITY_CLAIMS']};
}
if(require.main===module){discover({pages:Math.min(10,Math.max(1,Number(process.env.SOLANA_PAGES)||3))}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})}
module.exports={normalize,select,discover};
