'use strict';
// Phase 8.2: bounded external candidate discovery and direct bridge to existing DEX evidence.
// No trade execution, no automatic polling, no assertions of on-chain verification.
const NETWORKS=Object.freeze({ethereum:'eth',arbitrum:'arbitrum',optimism:'optimism',base:'base',polygon:'polygon_pos',bsc:'bsc',avalanche:'avax',gnosis:'xdai',celo:'celo',linea:'linea',scroll:'scroll',mantle:'mantle',zksync:'zksync',sonic:'sonic',unichain:'unichain'});
function mount(app, deps){
 const cache=new Map();const state={running:false,lastRunAt:null,lastError:null,requests:0,lastRemoteAt:0,rateLimited:0};
 const safe={readOnly:true,automaticScanning:false,mainnetBroadcast:false,executionEligible:false};
 const summary=()=>{
  const d=deps.getEvidence();const chains=Object.values(d.chains||{}).map(c=>{
   const venues=Array.isArray(c.venues)?c.venues:[];
   const live=venues.filter(v=>v.status==='POOL_LIVE'&&v.pool&&v.liquidityEvidence?.nonzero);
   const pools=new Set(live.map(v=>`${c.chainId}:${String(v.pool).toLowerCase()}`));
   const factories=new Set(live.filter(v=>v.factory).map(v=>`${c.chainId}:${String(v.factory).toLowerCase()}`));
   const statuses={};for(const v of venues)statuses[v.status||'UNKNOWN']=(statuses[v.status||'UNKNOWN']||0)+1;
   return {chainId:c.chainId,name:c.name||null,status:c.status||null,venueEntries:venues.length,verifiedPoolEvidence:pools.size,verifiedFactoryEvidence:factories.size,venueStatuses:statuses,lastCompletedAt:c.lastCompletedAt||null};
  });
  const candidates=[...cache.values()].flatMap(v=>v.pools.map(p=>({...p,network:v.network})));
  const uniqueCandidates=new Set(candidates.map(p=>`${p.network}:${p.address}`));
  return {success:true,build:'8.2.0',stage:'DEX_DISCOVERY_BRIDGE_AND_INDEXED_CANDIDATES',existingDiscovery:{running:d.running,runs:d.runs||0,lastRunAt:d.lastRunAt||null,lastCompletedAt:d.lastCompletedAt||null,chains,verifiedPoolEvidence:chains.reduce((n,c)=>n+c.verifiedPoolEvidence,0)},indexedDiscovery:{networksCached:cache.size,candidatePools:uniqueCandidates.size,verifiedOnChain:0,notice:'Indexed candidates are NOT independently verified on-chain; do not count them as operational DEX sources'},rateLimit:{requests:state.requests,rateLimited:state.rateLimited,lastRemoteAt:state.lastRemoteAt},running:state.running,lastRunAt:state.lastRunAt,lastError:state.lastError,targets:{liquiditySources:500,verified500:false},limitations:['IN_MEMORY_CANDIDATE_CACHE_ONLY','NO_PERSISTENT_DATABASE','NO_ATOMIC_FORK_SIMULATION','NO_NEW_ONCHAIN_VERIFICATION_IN_INDEXED_DISCOVERY'],...safe};
 };
 app.get('/api/phase82/status',(_req,res)=>res.json(summary()));
 app.get('/api/phase82/candidates', (req,res)=>{const network=String(req.query.network||'').toLowerCase();const rows=[...cache.values()].filter(x=>!network||x.network===network).flatMap(x=>x.pools.map(p=>({...p,network:x.network})));res.json({success:true,count:rows.length,candidates:rows.slice(0,200),note:'Candidate discovery only, no on-chain validation or quote',...safe});});
 app.get('/api/phase82/discover',async(req,res)=>{
  const network=String(req.query.network||'base').toLowerCase();if(!Object.hasOwn(NETWORKS,network))return res.status(400).json({success:false,error:'UNSUPPORTED_INDEXED_NETWORK',supported:Object.keys(NETWORKS)});
  if(state.running)return res.status(409).json({success:false,error:'DISCOVERY_ALREADY_RUNNING'});
  if(Date.now()-state.lastRemoteAt<7000)return res.status(429).json({success:false,error:'REMOTE_RATE_LIMIT_GUARD',retryAfterMs:7000-(Date.now()-state.lastRemoteAt)});
  state.running=true;state.lastRunAt=new Date().toISOString();state.lastError=null;
  try{
   state.lastRemoteAt=Date.now();state.requests++;
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
   let response;try{response=await fetch(`https://api.geckoterminal.com/api/v2/networks/${NETWORKS[network]}/pools?page=1`,{headers:{accept:'application/json'},signal:controller.signal});}finally{clearTimeout(timeout)}
   if(response.status===429){state.rateLimited++;throw new Error('GECKOTERMINAL_RATE_LIMITED')}
   if(!response.ok)throw new Error(`GECKOTERMINAL_HTTP_${response.status}`);
   const body=await response.json();if(!Array.isArray(body.data))throw new Error('INVALID_INDEX_RESPONSE');
   const pools=body.data.slice(0,30).map(p=>({address:String(p.attributes?.address||'').toLowerCase(),name:String(p.attributes?.name||'').slice(0,120),dexId:String(p.relationships?.dex?.data?.id||''),reserveUSD:p.attributes?.reserve_in_usd??null,observedAt:new Date().toISOString(),source:'GECKOTERMINAL_INDEXED_UNVERIFIED'})).filter(p=>/^0x[a-f0-9]{40}$/.test(p.address));
   cache.set(network,{network,pools,observedAt:new Date().toISOString()});
   res.json({success:true,network,discoveredCandidates:pools.length,verifiedOnChain:0,cacheOnly:true,source:'GeckoTerminal',statusRoute:'/api/phase82/status',candidatesRoute:`/api/phase82/candidates?network=${network}`,...safe});
  }catch(err){state.lastError=String(err.message||err);res.status(502).json({success:false,error:state.lastError,...safe});}
  finally{state.running=false}
 });
 app.get('/api/phase82/diagnostics',(_req,res)=>{const d=deps.getEvidence();res.json({success:true,build:'8.2.0',existingDiscoveryRuns:d.runs||0,existingDiscoveryRunning:!!d.running,existingDiscoveryChains:Object.keys(d.chains||{}),existingDiscoveryRoute:'/api/dex-independent/run',existingDiscoveryStatusRoute:'/api/dex-independent/status',indexedCandidateRoute:'/api/phase82/discover?network=base',notes:['Manual existing scanner populates on-chain evidence; indexed API does not','The previous zero count can mean no manual scan was run or no evidence was populated','Indexed results remain in process memory and disappear on restart'],...safe})});
 return {summary};
}
module.exports={mount};
