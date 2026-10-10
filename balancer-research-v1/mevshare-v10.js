'use strict';
// Flashbots MEV-Share tutorial: transaction vs bundle events, shared log address/topic hints.
// Read-only; do not interpret visibility of a bundle as eligibility for backrunning.
const {SWAP_TOPIC,verifiedPairIndex,screenEvent}=require('./bot');
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
function logsFrom(raw) {
 const sources=[{source:'EVENT',logs:raw?.logs}];
 if(Array.isArray(raw?.txs))for(let i=0;i<Math.min(raw.txs.length,50);i++){
  sources.push({source:'BUNDLE_TX_HINT',logs:raw.txs[i]?.logs});
 }
 const hints=[];let invalid=0;
 for(const source of sources){
  if(!Array.isArray(source.logs))continue;
  for(const log of source.logs.slice(0,100)){
   if(!ADDR.test(log?.address||'')||!Array.isArray(log.topics)||!log.topics.length||
      !log.topics.every(t=>HASH.test(t))){invalid++;continue}
   if(log.topics[0].toLowerCase()===SWAP_TOPIC)hints.push({source:source.source,address:log.address.toLowerCase(),topics:log.topics});
  }
 }
 return {hints,invalid};
}
function inspect(raw,index=new Map()) {
 if(!raw||!HASH.test(raw.hash||''))return {accepted:false,reason:'INVALID_EVENT_HASH',kind:'INVALID',swapHints:0,candidates:[]};
 const kind=Array.isArray(raw.txs)&&raw.txs.length>0?'BUNDLE':'TRANSACTION';
 const result=logsFrom(raw);
 const screened=screenEvent({hash:raw.hash,logs:result.hints},index);
 return {accepted:true,kind,eventHash:raw.hash,txEntries:Array.isArray(raw.txs)?raw.txs.length:0,
  swapHints:result.hints.length,invalidLogHints:result.invalid,
  hintsByLocation:{event:result.hints.filter(h=>h.source==='EVENT').length,
   bundleTransaction:result.hints.filter(h=>h.source==='BUNDLE_TX_HINT').length},
  candidates:screened.candidates,candidateCount:screened.candidates.length,
  transactionsAvailableInFull:false,backrunOrderingVerified:false,
  executableQuotesVerified:false,executionEligible:false};
}
function analyze(events,pairs=[]){
 const index=verifiedPairIndex(pairs),seen=new Set();let duplicate=0,invalid=0;
 const reports=[];
 for(const item of events||[]){
  const eventHash=typeof item?.hash==='string'?item.hash.toLowerCase():'';
  const kind=Array.isArray(item?.txs)&&item.txs.length>0?'BUNDLE':'TRANSACTION';
  if(HASH.test(eventHash)&&seen.has(kind+':'+eventHash)){duplicate++;continue}
  if(HASH.test(eventHash))seen.add(kind+':'+eventHash);
  const report=inspect(item,index);
  if(!report.accepted)invalid++;
  reports.push(report);
 }
 return {build:'BALANCER_RESEARCH_V10',mode:'MEV_SHARE_TRANSACTION_AND_BUNDLE_HINT_AUDIT',
  received:(events||[]).length,uniqueEvents:reports.length,duplicates:duplicate,invalidEvents:invalid,
  transactions:reports.filter(r=>r.kind==='TRANSACTION').length,
  bundles:reports.filter(r=>r.kind==='BUNDLE').length,
  swapsInEventHints:reports.reduce((n,r)=>n+(r.hintsByLocation?.event||0),0),
  swapsInBundleTxHints:reports.reduce((n,r)=>n+(r.hintsByLocation?.bundleTransaction||0),0),
  verifiedPairRecords:index.size,verifiedVenueCandidates:reports.reduce((n,r)=>n+(r.candidateCount||0),0),
  reports:reports.slice(0,20),backrunOrderingVerified:false,bundleSubmissionEnabled:false,
  alerts:[],mainnetBroadcast:false,executionEligible:false,
  limitations:['ETHEREUM_MEV_SHARE_ONLY','BUNDLE_HINTS_ARE_NOT_COMPLETE_TRANSACTION_BODIES',
   'NO_AUTHORITY_TO_BACKRUN_BUNDLE','NO_REAL_QUOTES_OR_SIMULATION','NO_SUBMISSION']};
}
module.exports={logsFrom,inspect,analyze};
