'use strict';
// Flashbots MEV-Share bot tutorial: select disclosed transaction-hash swap hints.
// Bundle hashes are never treated as transaction hashes. V19 is simulation-only.
// No signing, no generated transaction, no submission, no profit assertion.
const {ENDPOINT,parseSSE}=require('./mevshare-v9');
const {SWAP_TOPIC}=require('./bot');
const {prepare}=require('./mev-simulation-v19');
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
function select(events,{verifiedPools=[]}={}){
 const pools=new Set(verifiedPools.filter(p=>ADDRESS.test(p)).map(p=>p.toLowerCase()));
 const seen=new Set();let duplicates=0,bundlesExcluded=0,eventsWithSwapHints=0;
 const candidates=[];
 for(const event of events){
  if(!HASH.test(event?.hash||''))continue;
  if(Array.isArray(event.txs)&&event.txs.length>0){bundlesExcluded++;continue}
  const hash=event.hash.toLowerCase();
  if(seen.has(hash)){duplicates++;continue}
  seen.add(hash);
  const matched=[...new Set((Array.isArray(event.logs)?event.logs:[])
   .filter(log=>ADDRESS.test(log?.address||'')&&String(log?.topics?.[0]||'').toLowerCase()===SWAP_TOPIC)
   .map(log=>log.address.toLowerCase()))];
  if(!matched.length)continue;
  eventsWithSwapHints++;
  const qualifying=matched.filter(p=>pools.has(p));
  if(!qualifying.length)continue;
  candidates.push({targetHash:hash,disclosedSwapPools:qualifying,
   targetIsTransactionEvent:true,pairRegistrySource:'OPERATOR_VERIFIED_INPUT',
   targetRawBytesAvailable:false,backrunEligible:false});
 }
 return {eventsReceived:events.length,transactionEventsSeen:seen.size,duplicates,bundlesExcluded,
  eventsWithSwapHints,verifiedPoolCount:pools.size,candidates:candidates.slice(0,15)};
}
async function listen({fetchImpl=fetch,durationMs=10000,maxEvents=80}={}){
 const controller=new AbortController();let reader,connected=false,buffer='',malformed=0;const events=[];
 const deadline=setTimeout(()=>controller.abort(),durationMs);
 try{
  const response=await fetchImpl(ENDPOINT,{headers:{accept:'text/event-stream'},signal:controller.signal});
  if(!response.ok||!response.body)throw Error('SSE_HTTP_'+response.status);
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw Error('NOT_SSE_RESPONSE');
  connected=true;reader=response.body.getReader();const decoder=new TextDecoder();
  while(events.length<maxEvents){
   let chunk;try{chunk=await reader.read()}catch(e){if(controller.signal.aborted)break;throw e}
   if(chunk.done)break;
   buffer+=decoder.decode(chunk.value,{stream:true});
   if(buffer.length>250000)throw Error('SSE_BUFFER_TOO_LARGE');
   let match;
   while((match=/\r?\n\r?\n/.exec(buffer))!==null){
    const section=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
    for(const obj of parseSSE(section+'\n\n')){
     if(obj.invalidJSON){malformed++;continue}
     events.push(obj);if(events.length>=maxEvents)break;
    }
    if(events.length>=maxEvents)break;
   }
  }
 }catch(e){if(!controller.signal.aborted)throw e}
 finally{clearTimeout(deadline);controller.abort();if(reader)try{await reader.cancel()}catch{}}
 return {connected,events,malformed};
}
async function run({fetchImpl=fetch,verifiedPools=[],backrunContract,backrunSignedTx,blockNumber,durationMs=10000}={}){
 const feed=await listen({fetchImpl,durationMs}),data=select(feed.events,{verifiedPools});
 const candidate=data.candidates[0];
 const gate=candidate?prepare({targetHash:candidate.targetHash,backrunContract,backrunSignedTx,blockNumber}):
  {ready:false,reason:'NO_VERIFIED_TRANSACTION_SWAP_CANDIDATE'};
 return {build:'BALANCER_RESEARCH_V20',mode:'LIVE_FLASHBOTS_TRANSACTION_HASH_TO_SIMULATION_GATE',
  connected:feed.connected,malformedSSE:feed.malformed,...data,
  selectedTargetHash:candidate?.targetHash||null,
  simulationGateReady:gate.ready===true,gateReason:gate.ready?'READY_FOR_SEPARATE_V19_SIMULATION':gate.reason,
  simulationAttempted:false,balancerSignedTransactionCreated:false,bundlesSubmitted:0,
  mainnetBroadcast:false,profitVerified:false,executionEligible:false,
  limitations:['VERIFIED_POOLS_INPUT_REQUIRED','ONLY_TRANSACTION_EVENT_HASHES_NOT_BUNDLE_HASHES',
   'NO_SIGNING_OR_DEPLOYMENT','NO_ME V_SIMULATION'.replace('ME V','MEV'),
   'NO_NET_PROFIT_ASSERTION']};
}
module.exports={select,listen,run};
if(require.main===module)run({
 verifiedPools:(process.env.V20_VERIFIED_POOL_ADDRESSES||'').split(',').map(x=>x.trim()),
 backrunContract:process.env.V19_BACKRUN_CONTRACT,
 backrunSignedTx:process.env.V19_SIGNED_BACKRUN_TX,
 blockNumber:process.env.V19_BLOCK_NUMBER?Number(process.env.V19_BLOCK_NUMBER):undefined
}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('V20_FAILED',String(e.message).slice(0,180));process.exitCode=1});
