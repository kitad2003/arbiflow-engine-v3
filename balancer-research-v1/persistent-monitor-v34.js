'use strict';
// V34 read-only MEV-Share stream worker, suitable for a persistent host.
// Never interprets event-level logs as proof of a profitable transaction.
const {ENDPOINT,parseSSE}=require('./mevshare-v9');
const {SWAP_TOPIC}=require('./bot');
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
function classify(e){
 if(!HASH.test(e?.hash||''))return null;
 const txs=Array.isArray(e.txs)?e.txs:null;
 // txs null => single pending transaction stream event; txs array => bundle.
 const kind=txs===null?'PENDING_TRANSACTION':'BUNDLE';
 const explicit=txs?.filter(x=>HASH.test(x?.hash||'')).map(x=>x.hash.toLowerCase())||[];
 const pools=[...new Set((Array.isArray(e.logs)?e.logs:[]).filter(l=>ADDR.test(l?.address||'')&&
 String(l?.topics?.[0]||'').toLowerCase()===SWAP_TOPIC).map(l=>l.address.toLowerCase()))];
 return {eventHash:e.hash.toLowerCase(),kind,
  // Event hash on pending transaction only, never on bundles.
  pendingHash:kind==='PENDING_TRANSACTION'?e.hash.toLowerCase():null,
  disclosedBundleTxHashes:kind==='BUNDLE'?explicit:[],
  swapPools:pools,profitable:false,simulationReady:false};
}
async function run({fetchImpl=fetch,onEvent=()=>{},runtimeMs=240000,
 backoffMs=1500,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const end=Date.now()+runtimeMs,seen=new Map();
 const totals={build:'BALANCER_RESEARCH_V34',mode:'READ_ONLY_RECONNECTING_MEV_SHARE_MONITOR',
  connectedSessions:0,reconnects:0,uniqueEvents:0,duplicateEvents:0,
  pendingTransactions:0,bundles:0,eventsWithSwapHints:0,
  simulationAttempted:false,bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 while(Date.now()<end){
  const controller=new AbortController(),remaining=end-Date.now();
  const alarm=setTimeout(()=>controller.abort(),Math.min(remaining,60000));
  let reader;
  try{
   const response=await fetchImpl(ENDPOINT,{headers:{accept:'text/event-stream'},signal:controller.signal});
   if(!response.ok||!response.body)throw Error('SSE_HTTP_'+response.status);
   if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw Error('NOT_SSE_RESPONSE');
   totals.connectedSessions++;
   reader=response.body.getReader();const decoder=new TextDecoder();
   let buffer='';
   while(Date.now()<end&&!controller.signal.aborted){
    const part=await reader.read();if(part.done)break;
    buffer+=decoder.decode(part.value,{stream:true});
    if(buffer.length>250000)throw Error('SSE_BUFFER_TOO_LARGE');
    let m;
    while((m=/\r?\n\r?\n/.exec(buffer))!==null){
     const section=buffer.slice(0,m.index);buffer=buffer.slice(m.index+m[0].length);
     for(const raw of parseSSE(section+'\n\n')){
      const event=classify(raw);if(!event)continue;
      if(seen.has(event.eventHash)){totals.duplicateEvents++;continue}
      seen.set(event.eventHash,Date.now());totals.uniqueEvents++;
      if(event.kind==='BUNDLE')totals.bundles++;else totals.pendingTransactions++;
      if(event.swapPools.length)totals.eventsWithSwapHints++;
      await onEvent(event);
     }
    }
    // Sliding dedup window bounded in memory.
    if(seen.size>10000){const earliest=[...seen.keys()].slice(0,3000);for(const key of earliest)seen.delete(key)}
   }
  }catch(e){if(!controller.signal.aborted)totals.lastError=String(e.message).slice(0,110)}
  finally{clearTimeout(alarm);controller.abort();if(reader)try{await reader.cancel()}catch{}}
  if(Date.now()>=end)break;
  totals.reconnects++;
  await sleep(Math.min(backoffMs,Math.max(0,end-Date.now())));
 }
 return totals;
}
module.exports={classify,run};
if(require.main===module){
 const duration=Number(process.env.V34_DURATION_MS||240000);
 if(!Number.isSafeInteger(duration)||duration<1000||duration>86400000)throw Error('INVALID_DURATION');
 run({runtimeMs:duration,onEvent:e=>{if(e.swapPools.length)console.log(JSON.stringify({type:'SWAP_HINT',...e}))}})
 .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e);process.exitCode=1});
}
