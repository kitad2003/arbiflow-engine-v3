'use strict';
// Flashbots MEV-Share research: disclose event log addresses/topics and
// distinguish hinted swaps from complete transactions. No new trading strategy.
const {SWAP_TOPIC}=require('./bot');
const {observe:observeV13}=require('./live-pair-v13');
const HASH=/^0x[0-9a-f]{64}$/i;
function audit(events){
 const seen=new Set(),topicCounts=new Map(),addressCounts=new Map();
 const stats={received:0,uniqueEvents:0,duplicates:0,invalidHashes:0,
  transactions:0,bundles:0,eventsWithLogs:0,eventsWithAddresses:0,
  eventsWithTopics:0,swapHintEvents:0,swapHints:0,nonSwapTopicHints:0,
  eventsWithNoLogs:0,logsWithoutValidAddress:0,logsWithoutTopics:0,
  uniqueSwapPoolAddresses:[],topTopic0:[],observations:[]};
 const pools=new Set();
 for(const e of events){
  stats.received++;
  if(!HASH.test(e?.hash||'')){stats.invalidHashes++;continue}
  const kind=Array.isArray(e.txs)&&e.txs.length?'BUNDLE':'TRANSACTION';
  const key=kind+':'+e.hash.toLowerCase();
  if(seen.has(key)){stats.duplicates++;continue}
  seen.add(key);stats.uniqueEvents++;
  if(kind==='BUNDLE')stats.bundles++;else stats.transactions++;
  const logs=Array.isArray(e.logs)?e.logs:[], validAddresses=new Set();
  let topicLogs=0,swapLogs=0;
  if(logs.length)stats.eventsWithLogs++;else stats.eventsWithNoLogs++;
  for(const log of logs.slice(0,100)){
   const address=String(log?.address||'').toLowerCase();
   const validAddr=/^0x[0-9a-f]{40}$/.test(address);
   if(validAddr){validAddresses.add(address);addressCounts.set(address,(addressCounts.get(address)||0)+1)}
   else stats.logsWithoutValidAddress++;
   const topic0=String(log?.topics?.[0]||'').toLowerCase();
   if(!HASH.test(topic0)){stats.logsWithoutTopics++;continue}
   topicLogs++;topicCounts.set(topic0,(topicCounts.get(topic0)||0)+1);
   if(topic0===SWAP_TOPIC&&validAddr){swapLogs++;pools.add(address);stats.swapHints++}
   else stats.nonSwapTopicHints++;
  }
  if(validAddresses.size)stats.eventsWithAddresses++;
  if(topicLogs)stats.eventsWithTopics++;
  if(swapLogs)stats.swapHintEvents++;
  if(stats.observations.length<20)stats.observations.push({
   kind,eventHash:e.hash,logCount:logs.length,addressCount:validAddresses.size,
   topicCount:topicLogs,matchingSwapHints:swapLogs,eligibleForFactoryVerification:swapLogs>0});
 }
 stats.uniqueSwapPoolAddresses=[...pools].slice(0,20);
 stats.topTopic0=[...topicCounts].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([topic0,count])=>({
  topic0,count,uniswapV2Swap:topic0===SWAP_TOPIC}));
 return {build:'BALANCER_RESEARCH_V14',mode:'ETHEREUM_MEV_SHARE_DISCLOSED_HINT_AUDIT',
  ...stats,verifiedTradingPairs:0,profitVerified:false,executionEligible:false,
  mainnetBroadcast:false,limitations:['TOPIC_COUNTS_DESCRIBE_DISCLOSED_EVENT_HINTS_ONLY',
   'UNKNOWN_TOPICS_NOT_AUTOMATICALLY_SUPPORTED_SWAPS','NO_PRIVATE_TRANSACTION_BODIES',
   'NO_ETHEREUM_BALANCER_LOAN_VERIFICATION','NO_EXECUTION']};
}
// Receive events from the same Flashbots SSE endpoint. Uses the V13 reader callback
// only for networking; no Ethereum RPC is needed merely to audit hints.
const {ENDPOINT,parseSSE}=require('./mevshare-v9');
async function observe({network='ethereum-mainnet',durationMs=10000,maxEvents=80,fetchImpl=fetch}={}){
 if(network!=='ethereum-mainnet')throw Error('ETHEREUM_MEV_SHARE_ONLY');
 if(!Number.isInteger(durationMs)||durationMs<1000||durationMs>30000)throw Error('BAD_DURATION');
 if(!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>200)throw Error('BAD_MAX_EVENTS');
 const controller=new AbortController(),events=[];let reader,connected=false,malformed=0,buffer='';
 const timer=setTimeout(()=>controller.abort(),durationMs);
 try{
  const response=await fetchImpl(ENDPOINT,{headers:{accept:'text/event-stream'},signal:controller.signal});
  if(!response.ok||!response.body)throw Error('SSE_HTTP_'+response.status);
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw Error('NOT_SSE_RESPONSE');
  reader=response.body.getReader();connected=true;const decoder=new TextDecoder();
  while(events.length<maxEvents){
   let part;
   try{part=await reader.read()}catch(e){if(controller.signal.aborted)break;throw e}
   if(part.done)break;
   buffer+=decoder.decode(part.value,{stream:true});
   if(buffer.length>250000)throw Error('SSE_BUFFER_TOO_LARGE');
   let match;
   while((match=/\r?\n\r?\n/.exec(buffer))!==null){
    const section=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
    for(const event of parseSSE(section+'\n\n')){
     if(event.invalidJSON){malformed++;continue}
     events.push(event);if(events.length>=maxEvents)break;
    }
    if(events.length>=maxEvents)break;
   }
  }
 }catch(e){if(!controller.signal.aborted)throw e}
 finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel()}catch{}}
 return {...audit(events),network,endpoint:ENDPOINT,connected,malformedSSE:malformed,
  livePendingEventFeedConfirmed:connected&&events.length>0};
}
module.exports={audit,observe};
if(require.main===module)observe().then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V14_FAILED',String(e.message).slice(0,200));process.exitCode=1});
