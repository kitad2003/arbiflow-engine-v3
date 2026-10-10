'use strict';
// Standalone Base pendingLogs provider adapter. Not Ethereum MEV-Share and not a mempool-wide feed.
// Uses the Flashbots bot tutorial's event-monitoring architecture, NOT its Ethereum endpoint.
const WebSocket=require('ws');
const {examineHint}=require('./pending-monitor-v6');
const {verifiedPairIndex}=require('./bot');
const {classifyHint}=require('./event-signatures-v8');
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
function makeSubscription(addresses,id=7007){
 if(!Array.isArray(addresses)||!addresses.length||addresses.length>100||!addresses.every(a=>ADDR.test(a)))throw Error('VALID_WATCH_ADDRESSES_REQUIRED');
 return {jsonrpc:'2.0',id,method:'eth_subscribe',params:['pendingLogs',{address:[...new Set(addresses.map(a=>a.toLowerCase()))]}]};
}
function normalizeNotification(msg,subscription,allowed){
 if(msg?.method!=='eth_subscription'||msg.params?.subscription!==subscription)return null;
 const l=msg.params?.result;
 if(!l||!ADDR.test(l.address||'')||!allowed.has(l.address.toLowerCase())||!HASH.test(l.transactionHash||''))return null;
 if(!Array.isArray(l.topics)||!l.topics.length||!l.topics.every(t=>HASH.test(t)))return null;
 return {hash:l.transactionHash,logs:[{address:l.address,topics:l.topics.slice(0,4)}],
  blockNumber:l.blockNumber??null,blockHash:l.blockHash??null,transactionIndex:l.transactionIndex??null,logIndex:l.logIndex??null};
}
async function monitor({url,addresses,verifiedPairs=[],seconds=20,Socket=WebSocket}){
 if(!/^wss:\/\//.test(url||'')&&!Socket.__localTest)throw Error('WSS_URL_REQUIRED');
 if(!Number.isInteger(seconds)||seconds<1||seconds>90)throw Error('BAD_SECONDS');
 const req=makeSubscription(addresses),allowed=new Set(req.params[1].address);
 const index=verifiedPairIndex(verifiedPairs);
 const ws=new Socket(url);
 const state={build:'BALANCER_RESEARCH_V7',mode:'BASE_PROVIDER_PRECONFIRMED_LOGS_RESEARCH',
  subscriptionAcknowledged:false,subscriptionError:null,notifications:0,invalid:0,duplicateLogs:0,
  recognizedSwapHints:0,verifiedVenueCandidates:0,eventKindCounts:{},observations:[],verifiedPairRecords:index.size,
  providerIsEthereumMEVShare:false,fullPendingTransactionFeedProven:false,
  transactionOrderingProven:false,realExecutableQuotes:0,alerts:[],
  mainnetBroadcast:false,executionEligible:false};
 const seen=new Set();
 let subscription=null,settled=false;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{if(!settled){settled=true;ws.terminate();reject(Error('SUBSCRIPTION_ACK_TIMEOUT'))}},15000);
  ws.once('error',e=>{if(!settled){settled=true;clearTimeout(timer);reject(e)}});
  ws.once('open',()=>ws.send(JSON.stringify(req)));
  ws.on('message',raw=>{
   let msg;try{msg=JSON.parse(String(raw))}catch{state.invalid++;return}
   if(msg.id===req.id&&!settled){
    settled=true;clearTimeout(timer);
    if(msg.error){state.subscriptionError=String(msg.error.message||'REJECTED').slice(0,160);resolve();return}
    if(typeof msg.result!=='string'){state.subscriptionError='MISSING_SUBSCRIPTION_ID';resolve();return}
    subscription=msg.result;state.subscriptionAcknowledged=true;resolve();return;
   }
   if(!state.subscriptionAcknowledged||msg.method!=='eth_subscription'||msg.params?.subscription!==subscription)return;
   state.notifications++;
   const e=normalizeNotification(msg,subscription,allowed);
   if(!e){state.invalid++;return}
   const key=e.hash.toLowerCase()+':'+e.logs[0].address.toLowerCase()+':'+String(e.logIndex);
   if(seen.has(key)){state.duplicateLogs++;return}
   seen.add(key);
   const classification=classifyHint(e);
   state.eventKindCounts[classification.kind]=(state.eventKindCounts[classification.kind]||0)+1;
   const evaluation=examineHint(e,index);
   state.recognizedSwapHints+=classification.swapHint?1:0;
   state.verifiedVenueCandidates+=evaluation.candidates?.length||0;
   if(state.observations.length<25)state.observations.push({txHash:e.hash,pool:e.logs[0].address,
    blockNumber:e.blockNumber,blockHash:e.blockHash,transactionIndex:e.transactionIndex,logIndex:e.logIndex,
    topic0:e.logs[0].topics[0],eventKind:classification.kind,swapHint:classification.swapHint,candidateCount:evaluation.candidates.length,
    candidateRoutes:evaluation.candidates,transactionBodyAvailable:false,executionEligible:false});
  });
 });
 if(state.subscriptionAcknowledged)await new Promise(resolve=>setTimeout(resolve,seconds*1000));
 ws.close();
 return {...state,limitations:['SUBSCRIPTION_ACK_NOT_PROOF_OF_DELIVERY',
  'PRECONFIRMED_LOG_NOT_COMPLETE_PENDING_TRANSACTION',
  'EVENT_SIGNATURE_NOT_POOL_IDENTITY','V3_SWAP_HINTS_NOT_YET_IN_V1_VENUE_SCREEN','NO_MEASURED_TX_ORDERING','VERIFIED_PAIR_METADATA_REQUIRED_FOR_CANDIDATES',
  'NO_REAL_QUOTES_OR_ATOMIC_SIMULATION','NO_BUNDLE_SUBMISSION']};
}
if(require.main===module){
 const addresses=(process.env.BALANCER_V7_WATCH_POOLS||'').split(',').map(s=>s.trim()).filter(Boolean);
 monitor({url:process.env.BALANCER_V7_WSS_URL,addresses,seconds:Number(process.env.BALANCER_V7_SECONDS||20)})
 .then(r=>{console.log(JSON.stringify(r));if(!r.subscriptionAcknowledged)process.exitCode=2})
 .catch(e=>{console.error('BALANCER_V7_MONITOR_FAILED',String(e.message).replace(/wss:\/\/\S+/g,'[REDACTED]').slice(0,200));process.exitCode=1});
}
module.exports={makeSubscription,normalizeNotification,monitor};
