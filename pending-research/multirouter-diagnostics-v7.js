'use strict';
// Read-only live V5: chain-verified pending/preconfirmation observation, bounded transaction lookups,
// V4 ABI decoding and eth_getCode checks. Contract code presence is NOT identity verification.
const WebSocket=require('ws');
const {MODES,normalize}=require('./multichain-feed-verification-v2');
const {decode}=require('./swap-decoder-v4');
const {decodeUniversalIntent}=require('./universal-router-intent-v7');
const {classify}=require('./multichain-transaction-intelligence-v3-classifier');
const {CHAINS}=require('./multichain-monitor-registry-v1');
const {ROUTERS,CANDIDATES}=require('./verified-router-registry-v4');
function inspect({chain,url,WebSocketImpl=WebSocket,durationMs=45000,maxLookups=Number(process.env.V7_MAX_LOOKUPS||300)}={}){
 if(!MODES[chain]||!/^wss:\/\//i.test(url||''))throw Error('INVALID_CHAIN_OR_ENDPOINT');
 durationMs=Math.min(90000,Math.max(5000,durationMs));maxLookups=Math.min(2000,Math.max(1,Math.floor(maxLookups)));
 return new Promise((resolve,reject)=>{
  const s={chain,chainIdExpected:MODES[chain].chainId,chainIdObserved:null,chainIdVerified:false,subscriptionAcknowledged:false,events:0,uniqueEvents:0,lookupsSkippedAtCap:0,queueHighWatermark:0,lookupCap:maxLookups,lookupPacingMs:250,queuedAtFinish:0,lookupsSent:0,lookupsResolved:0,lookupsNull:0,lookupErrors:0,lookupTimeouts:0,codeChecks:0,codePresent:0,codeMissing:0,codeErrors:0,decodedSwaps:0,universalSwapIntents:0,universalCompleteIntents:0,universalPartialIntents:0,unverifiedUniversalSelectors:0,classificationCounts:{},selectorCounts:{},destinationCounts:{},topSelectors:[],topDestinations:[],sampleUnknown:[],decodedExamples:[],unverifiedCandidates:[],poolAddressesVerified:0,profitVerified:0,executionEligible:false,mainnetBroadcast:false,readOnly:true};
  let ws,done=false,sub=null,seq=56000,stop,ack,tick,last=0,inFlight=0;
  const seen=new Set(),queue=[],pending=new Map(),codeChecked=new Set();
  const started=Date.now();
  function finish(reason,error){if(done)return;done=true;clearTimeout(stop);clearTimeout(ack);clearInterval(tick);for(const v of pending.values())clearTimeout(v.timeout);pending.clear();s.durationMs=Date.now()-started;s.stopReason=reason;s.queuedAtFinish=queue.length;const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([value,count])=>({value,count}));s.topSelectors=top(s.selectorCounts);s.topDestinations=top(s.destinationCounts);delete s.selectorCounts;delete s.destinationCounts;try{ws?.close()}catch{};if(error)reject(error);else resolve(s)}
  function send(method,params,kind,context){const id=++seq;inFlight++;const timeout=setTimeout(()=>{if(!pending.has(id))return;pending.delete(id);inFlight--;if(kind==='tx')s.lookupTimeouts++;else s.codeErrors++},7000);pending.set(id,{kind,context,timeout});ws.send(JSON.stringify({jsonrpc:'2.0',id,method,params}));}
  function pump(){if(done||!sub||!s.chainIdVerified||inFlight>=3||Date.now()-last<250)return;
   if(queue.length&&s.lookupsSent<maxLookups){last=Date.now();s.lookupsSent++;send('eth_getTransactionByHash',[queue.shift()],'tx');}
  }
  try{ws=new WebSocketImpl(url,{handshakeTimeout:12000,maxPayload:1024*1024})}catch(e){reject(e);return}
  stop=setTimeout(()=>finish('DURATION_REACHED'),durationMs);
  ack=setTimeout(()=>finish('CHAIN_OR_SUBSCRIPTION_TIMEOUT',Error('CHAIN_OR_SUBSCRIPTION_TIMEOUT')),15000);
  tick=setInterval(pump,100);
  ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:55000,method:'eth_chainId',params:[]})));
  ws.on('message',raw=>{
   if(done)return;
   let m;try{m=JSON.parse(String(raw))}catch{return}
   if(m.id===55000){const n=typeof m.result==='string'?Number.parseInt(m.result,16):NaN;s.chainIdObserved=Number.isFinite(n)?n:null;
    if(n!==MODES[chain].chainId)return finish('CHAIN_ID_MISMATCH',Error('CHAIN_ID_MISMATCH'));
    s.chainIdVerified=true;ws.send(JSON.stringify({jsonrpc:'2.0',id:55001,method:'eth_subscribe',params:MODES[chain].subscription}));return}
   if(m.id===55001){if(m.error)return finish('SUBSCRIPTION_REJECTED',Error('SUBSCRIPTION_REJECTED'));if(typeof m.result==='string'){sub=m.result;s.subscriptionAcknowledged=true;clearTimeout(ack)}return}
   if(pending.has(m.id)){
    const p=pending.get(m.id);clearTimeout(p.timeout);pending.delete(m.id);inFlight--;
    if(p.kind==='code'){
     if(m.error||typeof m.result!=='string')s.codeErrors++;
     else if(m.result==='0x')s.codeMissing++;
     else s.codePresent++;
     return;
    }
    if(m.error){s.lookupErrors++;return}
    if(!m.result){s.lookupsNull++;return}
    s.lookupsResolved++;const d=decode(chain,m.result),raw=classify(chain,m.result);
    const verifiedUniversalAddresses=Object.entries(ROUTERS[chain]||{}).filter(([,meta])=>meta.family==='UNISWAP_UNIVERSAL').map(([address])=>address);
    const universal=decodeUniversalIntent(m.result,{allowlistedAddresses:verifiedUniversalAddresses});
    if(universal.decoded){s.universalSwapIntents++;if(universal.completeIntent)s.universalCompleteIntents++;else s.universalPartialIntents++;if(s.decodedExamples.length<8)s.decodedExamples.push(universal)}
    s.classificationCounts[raw.kind]=(s.classificationCounts[raw.kind]||0)+1;
    if(raw.selector)s.selectorCounts[raw.selector]=(s.selectorCounts[raw.selector]||0)+1;
    if(raw.to)s.destinationCounts[raw.to]=(s.destinationCounts[raw.to]||0)+1;
    if(raw.kind==='UNKNOWN_CONTRACT_CALL'&&s.sampleUnknown.length<12)s.sampleUnknown.push({hash:raw.hash,to:raw.to,selector:raw.selector});
    if(d.decoded){s.decodedSwaps++;if(s.decodedExamples.length<8)s.decodedExamples.push(d)}
    if(d.kind==='UNIVERSAL_ROUTER_SELECTOR_UNVERIFIED_DESTINATION'){s.unverifiedUniversalSelectors++;if(s.unverifiedCandidates.length<8)s.unverifiedCandidates.push({hash:d.hash,to:d.to,selector:d.selector,candidateForContractVerification:d.candidateForContractVerification})}
    const address=d.to;
    if(address&&(ROUTERS[chain]?.[address]||CANDIDATES[chain]?.includes(address))&&!codeChecked.has(address)&&s.codeChecks<12){
     codeChecked.add(address);s.codeChecks++;send('eth_getCode',[address,'latest'],'code',address);
    }
    return;
   }
   if(m.method==='eth_subscription'&&m.params?.subscription===sub){const h=normalize(chain,m.params?.result);if(!h)return;s.events++;if(seen.has(h))return;seen.add(h);s.uniqueEvents++;if(s.lookupsSent+queue.length<maxLookups){queue.push(h);s.queueHighWatermark=Math.max(s.queueHighWatermark,queue.length)}else s.lookupsSkippedAtCap++}
  });
  ws.on('error',e=>finish('WEBSOCKET_ERROR',Error(String(e.message).slice(0,100))));
  ws.on('close',()=>finish('WEBSOCKET_CLOSED'));
 });
}
async function run(env=process.env){
 const results=[];
 for(const {name:chain} of CHAINS){
  if(!MODES[chain]){results.push({chain,status:'FEED_NOT_IMPLEMENTED',active:false,reason:'No verified subscription mode for this chain'});continue}
  const secret=MODES[chain].secret;
  if(!env[secret]){results.push({chain,status:'NOT_CONFIGURED',secret});continue}
  try{const r=await inspect({chain,url:env[secret],durationMs:Number(env.LIVE_DECODING_DURATION_MS||45000),maxLookups:Number(env.V7_MAX_LOOKUPS||300)});results.push({...r,status:r.chainIdVerified&&r.subscriptionAcknowledged&&r.events>0?'EVENTS_OBSERVED':'NO_EVENTS_OBSERVED'})}
  catch(e){results.push({chain,status:'FAILED',error:String(e.message)})}
 }
 return {build:'ARBIFLOW_MULTIROUTER_DIAGNOSTICS_V7',chainCount:CHAINS.length,results,readOnly:true,executionEnabled:false,transactionsSigned:0,bundlesSubmitted:0,limitations:['Selectors and destinations are observational, not verified contract identities','Canonical Ethereum Uniswap V2 decoding is enabled; Universal Router structural decoding requires a separately verified router allowlist, currently empty','eth_getCode proves code presence only, not contract identity or correctness','Base Flashblocks are sequencer preconfirmations, not a public mempool; 13 additional chain feeds remain unimplemented','No pool state, simulation, executable quotes, gas-adjusted net profits or trade execution']};
}
if(require.main===module)run().then(x=>{console.log(JSON.stringify(x,null,2));if(!x.results.some(r=>r.status==='EVENTS_OBSERVED'))process.exitCode=2}).catch(e=>{console.error(e);process.exitCode=1});
module.exports={inspect,run};
