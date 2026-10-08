'use strict';
// Phase 8.7: manually triggered, bounded indexed market inventory. No signing, transactions or auto-polling.
const SAFETY=Object.freeze({readOnly:true,automaticScanning:false,mainnetBroadcast:false,executionEligible:false});
const BUILD='8.7.0';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ADDR=/^0x[a-fA-F0-9]{40}$/;
const POOL_ID=/^0x[a-fA-F0-9]{64}$/;
const URLS=Object.freeze([
 {name:'geckoterminal-top',url:'https://api.geckoterminal.com/api/v2/networks/base/pools'},
 {name:'geckoterminal-trending',url:'https://api.geckoterminal.com/api/v2/networks/base/trending_pools'},
 {name:'geckoterminal-new',url:'https://api.geckoterminal.com/api/v2/networks/base/new_pools'},
 {name:'dexscreener-usdc',url:`https://api.dexscreener.com/token-pairs/v1/base/${USDC}`}
]);
const cleanId=v=>typeof v==='string'&&(ADDR.test(v)||POOL_ID.test(v))?v.toLowerCase():null;
const numeric=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
const token=(address,symbol)=>{const a=cleanId(address);return a&&ADDR.test(a)?{address:a,symbol:typeof symbol==='string'?symbol.slice(0,48):null}:null};
const gtTokenId=v=>typeof v==='string'?v.match(/0x[a-fA-F0-9]{40}$/)?.[0]:null;
function normalizeGecko(body,source){
 if(!body||!Array.isArray(body.data))throw Error('INVALID_GECKO_SCHEMA');
 return body.data.slice(0,100).flatMap(p=>{
  const id=cleanId(p?.attributes?.address);if(!id)return [];
  const t0=token(gtTokenId(p?.relationships?.base_token?.data?.id));
  const t1=token(gtTokenId(p?.relationships?.quote_token?.data?.id));
  return [{chain:'base',chainId:8453,pool:id,poolKind:ADDR.test(id)?'contractAddress':'poolId',dexId:String(p?.relationships?.dex?.data?.id||'unknown').slice(0,100),name:String(p?.attributes?.name||'').slice(0,160),token0:t0,token1:t1,reportedLiquidityUSD:numeric(p?.attributes?.reserve_in_usd),reportedVolume24hUSD:numeric(p?.attributes?.volume_usd?.h24),sources:[source],identityVerified:false,quoteVerified:false,depthUSD:null,executionEligible:false}];
 });
}
function normalizeDex(body,source){
 if(!Array.isArray(body))throw Error('INVALID_DEXSCREENER_SCHEMA');
 return body.slice(0,100).flatMap(p=>{
  if(String(p?.chainId||'').toLowerCase()!=='base')return [];
  const id=cleanId(p?.pairAddress);if(!id)return [];
  return [{chain:'base',chainId:8453,pool:id,poolKind:ADDR.test(id)?'contractAddress':'poolId',dexId:String(p?.dexId||'unknown').slice(0,100),name:`${p?.baseToken?.symbol||'?'} / ${p?.quoteToken?.symbol||'?'}`.slice(0,160),token0:token(p?.baseToken?.address,p?.baseToken?.symbol),token1:token(p?.quoteToken?.address,p?.quoteToken?.symbol),reportedLiquidityUSD:numeric(p?.liquidity?.usd),reportedVolume24hUSD:numeric(p?.volume?.h24),sources:[source],identityVerified:false,quoteVerified:false,depthUSD:null,executionEligible:false}];
 });
}
function merge(records){
 const pools=new Map();
 for(const r of records){const key=`${r.chainId}:${r.pool}`;const old=pools.get(key);if(!old){pools.set(key,{...r});continue}
  old.sources=[...new Set([...old.sources,...r.sources])];
  for(const field of ['token0','token1','reportedLiquidityUSD','reportedVolume24hUSD'])if(old[field]===null&&r[field]!==null)old[field]=r[field];
  if(old.dexId==='unknown'&&r.dexId!=='unknown')old.dexId=r.dexId;
 }
 return [...pools.values()];
}
async function retrieve(source,fetchFn=globalThis.fetch){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchFn(source.url,{method:'GET',headers:{accept:'application/json'},signal:controller.signal});
  if(!response.ok)throw Error(`HTTP_${response.status}`);
  const raw=await response.text();if(raw.length>2000000)throw Error('RESPONSE_TOO_LARGE');
  const body=JSON.parse(raw);return source.name.startsWith('gecko')?normalizeGecko(body,source.name):normalizeDex(body,source.name);
 }finally{clearTimeout(timer)}
}
function mount(app,{fetchFn}={}){
 const state={running:false,runs:0,lastStartedAt:null,lastCompletedAt:null,lastResult:null,pools:[],lastSuccessfulAt:null};
 const status=()=>({success:true,build:BUILD,running:state.running,runs:state.runs,lastStartedAt:state.lastStartedAt,lastCompletedAt:state.lastCompletedAt,lastSuccessfulAt:state.lastSuccessfulAt,uniquePoolsInMemory:state.pools.length,lastResult:state.lastResult,safety:SAFETY});
 app.get('/api/liquidity87/status',(_req,res)=>res.json(status()));
 app.get('/api/liquidity87/sources',(_req,res)=>res.json({success:true,build:BUILD,sources:URLS.map(s=>({name:s.name,url:s.url})),safety:SAFETY}));
 app.get('/api/liquidity87/pools',(req,res)=>{const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0),min=Number(req.query.minLiquidityUSD??0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||!Number.isFinite(min)||min<0)return res.status(400).json({success:false,error:'INVALID_PAGINATION_OR_FILTER',safety:SAFETY});
  const rows=state.pools.filter(p=>p.reportedLiquidityUSD!==null&&p.reportedLiquidityUSD>=min);
  res.json({success:true,build:BUILD,total:rows.length,offset,limit,pools:rows.slice(offset,offset+limit),safety:SAFETY});
 });
 app.get('/api/liquidity87/tokens',(_req,res)=>{const tokens=new Map();for(const p of state.pools)for(const t of [p.token0,p.token1])if(t)tokens.set(t.address,{...tokens.get(t.address),...t});res.json({success:true,build:BUILD,total:tokens.size,tokens:[...tokens.values()].slice(0,250),safety:SAFETY})});
 async function run(){const successes=[],failures=[],all=[];
  // Sequential requests limit API pressure; partial results are explicitly marked incomplete.
  for(const source of URLS){try{const rows=await retrieve(source,fetchFn||globalThis.fetch);successes.push({source:source.name,records:rows.length});all.push(...rows)}catch(e){failures.push({source:source.name,error:String(e?.message||e).slice(0,140)})}}
  const deduped=merge(all);if(successes.length){state.pools=deduped;state.lastSuccessfulAt=new Date().toISOString()}
  return {success:failures.length===0,scanStatus:failures.length?'INCOMPLETE':'COMPLETE',build:BUILD,chainId:8453,rawRecords:all.length,uniquePools:deduped.length,contractAddressPools:deduped.filter(x=>x.poolKind==='contractAddress').length,poolIdRecords:deduped.filter(x=>x.poolKind==='poolId').length,sourcesSucceeded:successes,sourcesFailed:failures,limitations:['BASE_ONLY','INDEXED_API_SNAPSHOTS_NOT_ON_CHAIN_VERIFIED','REPORTED_TVL_NOT_EXECUTABLE_DEPTH','NO_ROUTE_QUOTES','NO_PROFIT_VALIDATION','IN_MEMORY_ONLY','NO_AUTOMATIC_SCAN'],safety:SAFETY};
 }
 app.get('/api/liquidity87/run',(_req,res)=>{if(state.running)return res.status(409).json({success:false,error:'RUN_IN_PROGRESS',safety:SAFETY});
  state.running=true;state.runs++;state.lastStartedAt=new Date().toISOString();
  setImmediate(async()=>{try{state.lastResult=await run()}catch(e){state.lastResult={success:false,error:String(e?.message||e).slice(0,140),safety:SAFETY}}finally{state.running=false;state.lastCompletedAt=new Date().toISOString()}});
  res.json({success:true,status:'STARTED_BACKGROUND',build:BUILD,statusRoute:'/api/liquidity87/status',safety:SAFETY});
 });return {state};
}
module.exports={mount,normalizeGecko,normalizeDex,merge,retrieve,SAFETY};
