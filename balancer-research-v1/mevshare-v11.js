'use strict';
// Research-only connection of V9's documented Ethereum MEV-Share SSE stream to V10 hint analysis.
// Not Base, not an order-placement system. Live hints do not prove executable transactions.
const {ENDPOINT,parseSSE}=require('./mevshare-v9');
const {analyze}=require('./mevshare-v10');
async function observe({network='ethereum-mainnet',durationMs=10000,maxEvents=100,fetchImpl=fetch,verifiedPairs=[]}={}){
 if(network!=='ethereum-mainnet')throw Error('ETHEREUM_MEV_SHARE_ONLY');
 if(!Number.isInteger(durationMs)||durationMs<1000||durationMs>30000)throw Error('BAD_DURATION');
 if(!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>500)throw Error('BAD_MAX_EVENTS');
 const controller=new AbortController();let reader,connected=false;
 const events=[];let malformed=0,buffer='';
 const timeout=setTimeout(()=>controller.abort(),durationMs);
 try{
  const response=await fetchImpl(ENDPOINT,{headers:{accept:'text/event-stream'},signal:controller.signal});
  if(!response.ok||!response.body)throw Error('SSE_HTTP_'+response.status);
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw Error('NOT_SSE_RESPONSE');
  connected=true;reader=response.body.getReader();
  const decoder=new TextDecoder();
  while(events.length<maxEvents){
   let chunk;
   try{chunk=await reader.read()}catch(e){if(controller.signal.aborted)break;throw e}
   if(chunk.done)break;
   buffer+=decoder.decode(chunk.value,{stream:true});
   if(buffer.length>250000)throw Error('SSE_BUFFER_TOO_LARGE');
   let match;
   while((match=/\r?\n\r?\n/.exec(buffer))!==null){
    const section=buffer.slice(0,match.index);
    buffer=buffer.slice(match.index+match[0].length);
    for(const event of parseSSE(section+'\n\n')){
     if(event.invalidJSON){malformed++;continue}
     events.push(event);
     if(events.length>=maxEvents)break;
    }
    if(events.length>=maxEvents)break;
   }
  }
 }catch(e){if(!controller.signal.aborted)throw e}
 finally{clearTimeout(timeout);controller.abort();if(reader)try{await reader.cancel()}catch{}}
 const report=analyze(events,verifiedPairs);
 // Do not expose full hinted transaction/bundle bodies or pretend token identities are verified.
 return {...report,build:'BALANCER_RESEARCH_V11',mode:'LIVE_ETHEREUM_MEV_SHARE_HINT_AUDIT',
  network,endpoint:ENDPOINT,connected,malformedSSE:malformed,
  livePendingEventFeedConfirmed:connected&&events.length>0,
  baseIntegrationVerified:false,profitVerified:false,
  executionEligible:false,mainnetBroadcast:false,
  limitations:[...report.limitations,'LIVE_EVENT_RECEIPT_NOT_BACKRUN_EXECUTION_PROOF']};
}
if(require.main===module)observe({network:process.env.MEV_SHARE_RESEARCH_NETWORK||'ethereum-mainnet'})
 .then(x=>{console.log(JSON.stringify(x));if(!x.connected)process.exitCode=2})
 .catch(e=>{console.error('V11_STREAM_FAILED',String(e.message).slice(0,200));process.exitCode=1});
module.exports={observe};
