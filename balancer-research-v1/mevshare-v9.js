'use strict';
// New research component, ONLY user supplied Flashbots Automated Arbitrage Bot guide.
// Ethereum MEV-Share event stream, NOT Base pendingLogs, NOT a Base backrun connector.
// Network is explicit: do not infer Base compatibility from this module.
const {examineHint}=require('./pending-monitor-v6');
const {verifiedPairIndex}=require('./bot');
const ENDPOINT='https://mev-share.flashbots.net';
function parseSSE(text){
 const records=[];let buffer='';
 for(const line of String(text).split(/\r?\n/)){
  if(line===''){
   if(buffer){try{records.push(JSON.parse(buffer))}catch{records.push({invalidJSON:true})}buffer=''}
  }else if(line.startsWith('data:'))buffer+=(buffer?'\n':'')+line.slice(5).trimStart();
 }
 return records;
}
function inspectEvent(raw,index=new Map()){
 if(!raw||typeof raw!=='object'||raw.invalidJSON)return {accepted:false,reason:'INVALID_EVENT'};
 const isBundle=Array.isArray(raw.txs)&&raw.txs.length>0;
 if(isBundle)return {accepted:false,type:'BUNDLE',reason:'BUNDLE_HANDLING_NOT_IMPLEMENTED',txHash:raw.hash||null};
 const result=examineHint(raw,index);
 return {type:'TRANSACTION',accepted:result.accepted,txHash:raw.hash||null,
  swapHints:result.swapHints||0,candidateCount:result.candidates?.length||0,
  candidates:result.candidates||[],reason:result.reason||null,
  transactionBodyProven:false,backrunPositionProven:false,profitVerified:false,executionEligible:false};
}
async function observe({network='ethereum-mainnet',durationMs=10000,fetchImpl=fetch,verifiedPairs=[]}={}){
 if(network!=='ethereum-mainnet')throw Error('FLASHBOTS_TUTORIAL_STREAM_ETHEREUM_ONLY');
 if(!Number.isInteger(durationMs)||durationMs<1000||durationMs>30000)throw Error('INVALID_DURATION');
 const controller=new AbortController();const index=verifiedPairIndex(verifiedPairs);
 const summary={build:'BALANCER_RESEARCH_V9',mode:'ETHEREUM_MEV_SHARE_SSE_RESEARCH',
  network:'ethereum-mainnet',endpoint:ENDPOINT,connected:false,events:0,transactions:0,bundles:0,
  swapHints:0,verifiedVenueCandidates:0,malformed:0,observations:[],
  verifiedPairRecords:index.size,baseIntegrationVerified:false,backrunOrderVerified:false,
  bundlesSubmitted:0,alerts:[],executionEligible:false,mainnetBroadcast:false};
 let read;
 try{
  const response=await fetchImpl(ENDPOINT,{headers:{accept:'text/event-stream'},signal:controller.signal});
  if(!response.ok||!response.body)throw Error('SSE_HTTP_'+response.status);
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw Error('NOT_SSE_RESPONSE');
  summary.connected=true;read=response.body.getReader();
  const deadline=Date.now()+durationMs,decoder=new TextDecoder();let buf='';
  while(Date.now()<deadline&&summary.events<60){
   const left=Math.max(1,deadline-Date.now());
   const result=await Promise.race([read.read(),new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),left))]);
   if(result.timeout||result.done)break;
   buf+=decoder.decode(result.value,{stream:true});
   const chunks=buf.split(/\r?\n\r?\n/);buf=chunks.pop();
   if(buf.length>100000)throw Error('SSE_EVENT_TOO_LARGE');
   for(const chunk of chunks){
    for(const parsed of parseSSE(chunk+'\n\n')){
     summary.events++;
     if(parsed.invalidJSON){summary.malformed++;continue}
     const report=inspectEvent(parsed,index);
     if(report.type==='BUNDLE')summary.bundles++;
     else summary.transactions++;
     summary.swapHints+=report.swapHints||0;
     summary.verifiedVenueCandidates+=report.candidateCount||0;
     if(summary.observations.length<15)summary.observations.push(report);
    }
   }
  }
 }finally{
  controller.abort();
  if(read)try{await read.cancel()}catch{}
 }
 return {...summary,limitations:['ETHEREUM_MAINNET_ME V_SHARE_ONLY'.replace('ME V','MEV'),
  'HINTS_CAN_HIDE_TRANSACTION_CONTENTS','NO_VERIFIED_ALTERNATIVE_PAIRS_CONFIGURED_BY_DEFAULT',
  'NO_BASE_BACKRUN_SUBMISSION','NO_TRANSACTION_SIGNING','NO_ATOMIC_SIMULATION']};
}
module.exports={ENDPOINT,parseSSE,inspectEvent,observe};
if(require.main===module){
 observe({network:process.env.MEV_SHARE_RESEARCH_NETWORK||'ethereum-mainnet',durationMs:10000})
 .then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('MEV_SHARE_RESEARCH_FAILED',String(e.message).slice(0,200));process.exitCode=1});
}
