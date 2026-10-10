'use strict';
// V6: event-hint normalization and verified alternative-venue discovery.
// Only Flashbots bot tutorial architecture; Ethereum MEV-Share adapter remains intentionally unconnected.
// Does not equate Base logs or ordinary subscriptions with Ethereum MEV-Share.
const {SWAP_TOPIC,screenEvent,verifiedPairIndex}=require('./bot');
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
function validateHint(raw){
 if(!raw||typeof raw!=='object'||!HASH.test(raw.hash||''))return {valid:false,reason:'MISSING_VALID_TX_HASH'};
 if(!Array.isArray(raw.logs))return {valid:false,reason:'LOG_HINTS_NOT_AVAILABLE'};
 if(raw.logs.length>100)return {valid:false,reason:'TOO_MANY_LOG_HINTS'};
 const logs=[];
 for(const log of raw.logs){
  if(!ADDR.test(log?.address||'')||!Array.isArray(log.topics)||log.topics.length>4||!log.topics.every(t=>HASH.test(t))){
   return {valid:false,reason:'INVALID_LOG_HINT'};
  }
  logs.push({address:log.address,topics:log.topics});
 }
 return {valid:true,event:{hash:raw.hash,logs,txs:Array.isArray(raw.txs)?raw.txs:undefined}};
}
function examineHint(raw,pairIndex){
 const checked=validateHint(raw);
 if(!checked.valid)return {build:'BALANCER_RESEARCH_V6',accepted:false,reason:checked.reason,candidates:[],alerts:[],
  executionEligible:false,transactionPositionProven:false,mainnetBroadcast:false};
 const screened=screenEvent(checked.event,pairIndex);
 return {build:'BALANCER_RESEARCH_V6',accepted:true,eventHash:checked.event.hash,
  swapHints:checked.event.logs.filter(l=>l.topics[0]?.toLowerCase()===SWAP_TOPIC).length,
  candidates:screened.candidates,ignored:screened.ignored,
  txContentsVerified:false,transactionPositionProven:false,executableQuotesVerified:false,
  alerts:[],executionEligible:false,bundleSubmissionEnabled:false,mainnetBroadcast:false};
}
function evaluateBatch(events,verifiedPairs){
 const index=verifiedPairIndex(verifiedPairs);
 const unique=new Set(),reports=[];
 for(const e of events||[]){
  const h=typeof e?.hash==='string'?e.hash.toLowerCase():null;
  if(h&&unique.has(h))continue;
  if(h)unique.add(h);
  reports.push(examineHint(e,index));
 }
 return {build:'BALANCER_RESEARCH_V6',mode:'OFFLINE_PENDING_EVENT_HINT_INSPECTION',
  received:(events||[]).length,processed:reports.length,distinctVerifiedPools:index.size,
  candidates:reports.flatMap(r=>r.candidates),reports,
  eventProviderConnected:false,livePendingFeedVerified:false,realQuotesExecuted:0,
  alerts:[],executionEligible:false,bundleSubmissionEnabled:false,mainnetBroadcast:false,
  limitations:['HINT_IS_NOT_TRANSACTION_BODY','NO_ORDERING_RIGHTS','NO_BASE_MEV_SHARE_ASSUMPTION',
   'NO_QUOTE_OR_SIMULATION','NO_TRANSACTION_SUBMISSION']};
}
module.exports={validateHint,examineHint,evaluateBatch};
