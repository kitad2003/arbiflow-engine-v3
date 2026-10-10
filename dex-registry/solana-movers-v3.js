'use strict';
// V3: GeckoTerminal trending -> targeted same-mint pool discovery. READ ONLY.
// Public API ~10 calls/min. Never interpret momentum as executable arbitrage.
const {normalize}=require('./solana-movers-v2');
const BASE='https://api.geckoterminal.com/api/v2';
const WSOL='So11111111111111111111111111111111111111112';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function candidate(p){const n=normalize(p);return n&&n.liquidityUsd>=20000?n:null}
function prioritize(rows){return [...rows].sort((a,b)=>Math.max(b.change5m,b.change1h)-Math.max(a.change5m,a.change1h))}
function group(rows){
 const unique=new Map();for(const p of rows){const n=candidate(p);if(n)unique.set(n.poolAddress,n)}
 const buckets=new Map();
 for(const p of unique.values()){const key=[p.baseMint,p.quoteMint].sort().join(':');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p)}
 const matched=[...buckets.values()].filter(v=>new Set(v.map(p=>p.dexLabel)).size>1);
 return {qualifiedPools:unique.size,crossDexPairs:matched.length,crossDexPools:prioritize(matched.flat()),unmatchedPools:unique.size-matched.flat().length};
}
async function run({fetchImpl=fetch,delayMs=6500,maxTokens=12,trendingPages=1,periods=['5m','1h'],maxRequests=22}={}){
 const calls=[],errors=[],seen=new Map(),tokens=new Set();
 async function get(path){
  if(calls.length>=maxRequests)return null;
  if(calls.length)await wait(delayMs);
  calls.push(path);
  for(let attempt=0;attempt<2;attempt++){
   try{
    const res=await fetchImpl(BASE+path,{headers:{accept:'application/json;version=20230203'}});
    if(!res.ok){if((res.status===429||res.status>=500)&&attempt===0){await wait(Math.max(delayMs,6500));continue}throw Error('HTTP_'+res.status)}
    const body=await res.json();if(!Array.isArray(body.data))throw Error('INVALID_DATA');
    return body.data;
   }catch(e){if(attempt===1)errors.push({endpoint:path,error:String(e.message).slice(0,100)});else await wait(Math.max(delayMs,6500))}
  }
  return null;
 }
 for(const period of periods){
  for(let page=1;page<=trendingPages;page++){
   const data=await get('/networks/solana/trending_pools?duration='+encodeURIComponent(period)+'&page='+page);
   for(const p of data||[]){const n=candidate(p);if(!n)continue;seen.set(n.poolAddress,p);if(n.baseMint!==WSOL&&n.baseMint!==USDC)tokens.add(n.baseMint)}
  }
 }
 const ranked=prioritize([...seen.values()].map(candidate).filter(Boolean));
 const selected=[...new Set(ranked.map(p=>p.baseMint).filter(m=>tokens.has(m)))].slice(0,maxTokens);
 for(const mint of selected){
  const data=await get('/networks/solana/tokens/'+mint+'/pools?page=1');
  for(const p of data||[]){const n=candidate(p);if(n&&[n.baseMint,n.quoteMint].includes(mint))seen.set(n.poolAddress,p)}
 }
 const result=group([...seen.values()]);
 return {build:'ARBIFLOW_SOLANA_MOVERS_V3',mode:'READ_ONLY_TRENDING_TARGETED_TOKEN_POOLS',periods,trendingPages,tokenLookupCount:selected.length,requestsMade:calls.length,discoveryErrors:errors,uniquePoolRecords:seen.size,...result,verifiedSafePools:0,verifiedProfitableRoutes:0,alerts:[],executionEligible:false,mainnetBroadcast:false,bundlesSubmitted:0,limitations:['TRENDING_IS_NOT_GLOBAL_PRICE_GAINER_SORT','GECKOTERMINAL_TVL_UNVERIFIED','NO_SOLANA_MINT_AUTHORITY_OR_TOKEN_2022_AUDIT','NO_EXECUTABLE_QUOTES_OR_NET_PROFIT']};
}
if(require.main===module)run({maxTokens:Math.max(0,Math.min(30,Number(process.env.MAX_TOKENS)||12)),trendingPages:Math.max(1,Math.min(3,Number(process.env.TRENDING_PAGES)||1))}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={candidate,prioritize,group,run};
