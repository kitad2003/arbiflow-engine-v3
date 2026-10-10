'use strict';
// Bounded, read-only classification of real Ethereum pending and Base preconfirmed txs.
const WebSocket=require('ws');
const {MODES,normalize}=require('./multichain-feed-verification-v2');
const {classify}=require('./multichain-transaction-intelligence-v3-classifier');
const {CHAINS}=require('./multichain-monitor-registry-v1');
function inspect({chain,url,durationMs=30000,maxLookups=75,WebSocketImpl=WebSocket}={}){
 if(!MODES[chain]||!/^wss:\/\//i.test(url||''))throw Error('INVALID_CHAIN_OR_WSS');
 durationMs=Math.min(60000,Math.max(5000,durationMs));maxLookups=Math.min(150,Math.max(1,maxLookups));
 return new Promise((resolve,reject)=>{
  const started=Date.now(),stats={chain,expectedChainId:MODES[chain].chainId,observedChainId:null,chainIdVerified:false,subscriptionAcknowledged:false,events:0,uniqueEvents:0,lookupsSent:0,lookupsResolved:0,lookupsNull:0,lookupErrors:0,classificationCounts:{},swapSelectorCandidates:[],durationMs:0,stopReason:null,readOnly:true,mainnetBroadcast:false,profitVerified:0};
  let ws,done=false,sub=null,id=91000,chainChecked=false,stop,ack,interval,last=0,inFlight=0;const seen=new Set(),queue=[],pending=new Map();
  function finish(reason,error){if(done)return;done=true;clearTimeout(stop);clearTimeout(ack);clearInterval(interval);stats.durationMs=Date.now()-started;stats.stopReason=reason;try{ws?.close()}catch{};if(error)reject(error);else resolve(stats)}
  function pump(){if(done||!chainChecked||!sub||!queue.length||stats.lookupsSent>=maxLookups||inFlight>=3||Date.now()-last<350)return;
   const hash=queue.shift(),req=++id;last=Date.now();inFlight++;stats.lookupsSent++;
   const timeout=setTimeout(()=>{if(!pending.has(req))return;pending.delete(req);inFlight--;stats.lookupErrors++},7000);
   pending.set(req,timeout);ws.send(JSON.stringify({jsonrpc:'2.0',id:req,method:'eth_getTransactionByHash',params:[hash]}));
  }
  try{ws=new WebSocketImpl(url,{handshakeTimeout:12000,maxPayload:1024*1024})}catch(e){reject(e);return}
  stop=setTimeout(()=>finish('DURATION_REACHED'),durationMs);
  ack=setTimeout(()=>finish('CHAIN_OR_SUBSCRIPTION_TIMEOUT',Error('CHAIN_OR_SUBSCRIPTION_TIMEOUT')),15000);
  interval=setInterval(pump,100);
  ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:91000,method:'eth_chainId',params:[]})));
  ws.on('message',raw=>{
   let m;try{m=JSON.parse(String(raw))}catch{return}
   if(m.id===91000){const n=typeof m.result==='string'?Number.parseInt(m.result,16):NaN;stats.observedChainId=Number.isFinite(n)?n:null;
    if(n!==MODES[chain].chainId)return finish('CHAIN_ID_MISMATCH',Error('CHAIN_ID_MISMATCH_EXPECTED_'+MODES[chain].chainId+'_GOT_'+m.result));
    stats.chainIdVerified=true;chainChecked=true;
    ws.send(JSON.stringify({jsonrpc:'2.0',id:91001,method:'eth_subscribe',params:MODES[chain].subscription}));return}
   if(m.id===91001){if(m.error)return finish('SUBSCRIPTION_REJECTED',Error('SUBSCRIPTION_REJECTED'));if(typeof m.result==='string'){sub=m.result;stats.subscriptionAcknowledged=true;clearTimeout(ack)}return}
   if(pending.has(m.id)){clearTimeout(pending.get(m.id));pending.delete(m.id);inFlight--;
    if(m.error)stats.lookupErrors++;else if(!m.result)stats.lookupsNull++;else{
     stats.lookupsResolved++;const c=classify(chain,m.result);stats.classificationCounts[c.kind]=(stats.classificationCounts[c.kind]||0)+1;
     if(c.kind.includes('SWAP_SELECTOR')&&stats.swapSelectorCandidates.length<12)stats.swapSelectorCandidates.push(c);
    }return}
   if(m.method==='eth_subscription'&&m.params?.subscription===sub){
    const hash=normalize(chain,m.params?.result);if(!hash)return;stats.events++;
    if(seen.has(hash))return;seen.add(hash);stats.uniqueEvents++;
    if(stats.lookupsSent+queue.length<maxLookups)queue.push(hash);
   }
  });
  ws.on('error',e=>finish('WEBSOCKET_ERROR',Error(String(e.message).slice(0,100))));
  ws.on('close',()=>finish('WEBSOCKET_CLOSED'));
 });
}
async function run(env=process.env){
 const results=[];
 for(const chain of ['ethereum','base']){
  const key=MODES[chain].secret;
  if(!env[key]){results.push({chain,status:'NOT_CONFIGURED',secretName:key});continue}
  try{const r=await inspect({chain,url:env[key],durationMs:Number(env.INTELLIGENCE_DURATION_MS||30000)});results.push({...r,status:r.chainIdVerified&&r.subscriptionAcknowledged&&r.events>0?'EVENTS_OBSERVED':'NO_EVENTS_OBSERVED'})}
  catch(e){results.push({chain,status:'FAILED',error:String(e.message).slice(0,130)})}
 }
 return {build:'ARBIFLOW_MULTICHAIN_TRANSACTION_INTELLIGENCE_V3',chainCount:CHAINS.length,results,readOnly:true,executionEnabled:false,limitations:['Ethereum router labels are a small provisional list; Base destinations remain unverified','Selector match alone is not ABI decoding or proof of a swap','Base preconfirmation is not an Ethereum public mempool','No executable pricing or net profit verified']};
}
if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(!r.results.some(x=>x.status==='EVENTS_OBSERVED'))process.exitCode=2}).catch(e=>{console.error(e);process.exitCode=1});
module.exports={inspect,run};
