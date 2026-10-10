'use strict';
// Flashbots MEV-Share bot tutorial: read SSE swap-event addresses, query pair token0/token1,
// verify the pair's factory, query opposite Uniswap V2/Sushiswap factory.getPair.
// No pricing, signing or submission. Confirmed-chain identity != pending execution state.
const {ethers}=require('ethers');
const {ENDPOINT,parseSSE}=require('./mevshare-v9');
const {SWAP_TOPIC}=require('./bot');
const {discover}=require('./verified-pairs-v12');
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
function swapPoolAddresses(raw){
 if(!raw||!HASH.test(raw.hash||''))return [];
 // The Flashbots tutorial looks at top-level log address and topics.
 return [...new Set((Array.isArray(raw.logs)?raw.logs:[])
  .filter(log=>ADDR.test(log?.address||'')&&String(log?.topics?.[0]||'').toLowerCase()===SWAP_TOPIC)
  .map(log=>log.address.toLowerCase()))];
}
async function investigate(events,provider,{maxPools=12,discoverImpl=discover}={}){
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const seenEvents=new Set(),cache=new Map(),results=[];
 let duplicates=0,swapHintEvents=0,poolsDeferred=0,transactionEvents=0,bundleEvents=0;
 for(const event of events){
  if(!HASH.test(event?.hash||''))continue;
  const kind=Array.isArray(event.txs)&&event.txs.length?'BUNDLE':'TRANSACTION';
  const key=kind+':'+event.hash.toLowerCase();
  if(seenEvents.has(key)){duplicates++;continue}
  seenEvents.add(key);
  if(kind==='BUNDLE')bundleEvents++;else transactionEvents++;
  const pools=swapPoolAddresses(event);
  if(pools.length)swapHintEvents++;
  for(const pool of pools){
   if(!cache.has(pool)){
    if(cache.size>=maxPools){poolsDeferred++;continue}
    try{cache.set(pool,await discoverImpl(provider,{address:pool,topics:[SWAP_TOPIC]}))}
    catch(e){cache.set(pool,{recognized:true,verifiedCrossVenuePair:false,reason:'DISCOVERY_ERROR',detail:String(e.message).slice(0,120)})}
   }
   const outcome=cache.get(pool);
   if(results.length<30)results.push({eventKind:kind,eventHash:event.hash,pool,
    recognized:outcome.recognized===true,triggerVenue:outcome.identity?.venue||null,
    triggerVerified:outcome.identity?.verified===true,
    alternativeVenue:outcome.alternative?.venue||null,
    alternativePool:outcome.alternative?.pool||null,
    verifiedCrossVenuePair:outcome.verifiedCrossVenuePair===true,
    reason:outcome.identity?.reason||outcome.alternative?.reason||outcome.reason||null,
    executionEligible:false});
  }
 }
 const verified=[...cache.values()].filter(x=>x.verifiedCrossVenuePair).length;
 return {build:'BALANCER_RESEARCH_V13',mode:'FLASHBOTS_LIVE_ETHEREUM_V2_PAIR_DISCOVERY',
  eventsReceived:events.length,uniqueEvents:seenEvents.size,duplicates,transactionEvents,bundleEvents,
  swapHintEvents,uniquePoolsInvestigated:cache.size,poolsDeferred,
  verifiedCrossVenuePools:verified,discoveredPoolEvents:results,
  realQuotes:0,profitVerified:false,ethereumBalancerFlashLoanVerified:false,
  bundleSubmissionEnabled:false,executionEligible:false,mainnetBroadcast:false,
  limitations:['ETHEREUM_MAINNET_ONLY','ONLY_FLASHBOTS_TUTORIAL_UNISWAP_V2_SWAP_TOPIC',
   'CONFIRMED_CHAIN_IDENTITY_NOT_PENDING_STATE','PAIRS_NOT_QUOTES_OR_PROFIT',
   'NO_BALANCER_ETHEREUM_FLASH_LOAN_EXECUTION_OR_BACKRUN_SUBMISSION']};
}
async function observe({network='ethereum-mainnet',rpcUrl=process.env.ETHEREUM_RPC_URL,
 durationMs=10000,maxEvents=60,fetchImpl=fetch,provider,discoverImpl=discover}={}){
 if(network!=='ethereum-mainnet')throw Error('ETHEREUM_MEV_SHARE_ONLY');
 if(!provider&&!rpcUrl)throw Error('ETHEREUM_RPC_URL_REQUIRED');
 const chain=provider||new ethers.JsonRpcProvider(rpcUrl,1,{staticNetwork:true});
 if((await chain.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const controller=new AbortController(),events=[];let reader,connected=false,malformed=0,buffer='';
 const timer=setTimeout(()=>controller.abort(),durationMs);
 try{
  const response=await fetchImpl(ENDPOINT,{headers:{accept:'text/event-stream'},signal:controller.signal});
  if(!response.ok||!response.body)throw Error('SSE_HTTP_'+response.status);
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw Error('NOT_SSE');
  reader=response.body.getReader();connected=true;
  const decoder=new TextDecoder();
  while(events.length<maxEvents){
   let part;
   try{part=await reader.read()}catch(e){if(controller.signal.aborted)break;throw e}
   if(part.done)break;
   buffer+=decoder.decode(part.value,{stream:true});
   if(buffer.length>250000)throw Error('SSE_BUFFER_TOO_LARGE');
   let match;
   while((match=/\r?\n\r?\n/.exec(buffer))!==null){
    const chunk=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
    for(const event of parseSSE(chunk+'\n\n')){
     if(event.invalidJSON){malformed++;continue}
     events.push(event);if(events.length>=maxEvents)break;
    }
    if(events.length>=maxEvents)break;
   }
  }
 }catch(e){if(!controller.signal.aborted)throw e}
 finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel()}catch{}}
 const report=await investigate(events,chain,{discoverImpl});
 return {...report,connected,malformedSSE:malformed,endpoint:ENDPOINT,liveFeedConfirmed:connected&&events.length>0};
}
module.exports={swapPoolAddresses,investigate,observe};
if(require.main===module)observe().then(r=>console.log(JSON.stringify(r)))
 .catch(e=>{console.error('V13_FAILED',String(e.message).slice(0,250));process.exitCode=1});
