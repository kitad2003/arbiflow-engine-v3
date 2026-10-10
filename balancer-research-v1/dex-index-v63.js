'use strict';
// Balancer-only DEX directory research. Entries are discovery evidence, not executable DEX adapters.
const fs=require('node:fs');
const NETWORKS=['eth','base','arbitrum','optimism','polygon_pos','bsc','avax','solana','sui','ton','fantom','celo','linea','scroll','zksync'];
const URL='https://api.geckoterminal.com/api/v2';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function normalize(network,item){
 const id=String(item?.id||'').trim(),name=String(item?.attributes?.name||id).trim();
 return id&&name?{key:network+':'+id,network,id,name,source:'GECKOTERMINAL',verifiedOnChain:false,quoteAdapterAvailable:false,executionEligible:false}:null;
}
async function index({networks=NETWORKS,fetchImpl=global.fetch,pagesPerNetwork=25,delayMs=6500}={}){
 if(!fetchImpl)throw Error('FETCH_REQUIRED');
 const all=new Map(),errors=[],stats=[];
 for(const network of networks){
  let pages=0;
  for(let page=1;page<=pagesPerNetwork;page++){
   try{
    const res=await fetchImpl(URL+'/networks/'+encodeURIComponent(network)+'/dexes?page='+page,{headers:{accept:'application/json'}});
    if(!res.ok)throw Error('HTTP_'+res.status);
    const json=await res.json(),items=Array.isArray(json.data)?json.data:[];
    for(const item of items){const row=normalize(network,item);if(row)all.set(row.key,row)}
    pages++;
    if(items.length<20)break;
   }catch(e){errors.push({network,page,reason:String(e.message||e).slice(0,90)});break}
   if(delayMs)await sleep(delayMs);
  }
  stats.push({network,pages,entries:[...all.values()].filter(x=>x.network===network).length});
 }
 const venues=[...all.values()];
 return {build:'BALANCER_DEX_INDEX_V63',mode:'READ_ONLY_DEX_DIRECTORY',networks:networks.length,networkDexEntries:venues.length,distinctDexIds:new Set(venues.map(x=>x.id)).size,target:500,targetReached:venues.length>=500,venues,stats,errors,verifiedPoolCount:0,qualified:0,alerts:[],netProfitVerified:false,executionEligible:false,mainnetBroadcast:false,limitations:['DIRECTORY_ENTRIES_NOT_VERIFIED_CONTRACTS','NOT_EXECUTABLE_QUOTE_ADAPTERS','NETWORK_ENTRIES_NOT_UNIQUE_PROTOCOLS','NO_AAVE_OR_GHO_INTEGRATION']};
}
module.exports={NETWORKS,normalize,index};
if(require.main===module)index().then(r=>{fs.writeFileSync('balancer-dex-index-v63.json',JSON.stringify(r,null,2));console.log(JSON.stringify({...r,venues:undefined}))}).catch(e=>{console.error('V63_FAILED',e.message);process.exitCode=1});
