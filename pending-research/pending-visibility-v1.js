'use strict';
// Broad, read-only Ethereum pending-hash visibility diagnostic.
// Counts provider-visible hashes; never signs, broadcasts, or fetches every transaction.
const WebSocket=require('ws');
const HASH=/^0x[0-9a-f]{64}$/i;
function run({url=process.env.ETHEREUM_WSS_URL,durationMs=Number(process.env.PENDING_DURATION_MS||60000),maxEvents=Number(process.env.PENDING_MAX_EVENTS||10000),WebSocketImpl=WebSocket}={}){
 if(!url||!/^wss:\/\//.test(url))throw Error('ETHEREUM_WSS_URL_MUST_BE_WSS');
 durationMs=Math.min(120000,Math.max(5000,durationMs));
 maxEvents=Math.min(50000,Math.max(1,maxEvents));
 return new Promise((resolve,reject)=>{
  const start=Date.now(),stats={build:'ARBIFLOW_PENDING_VISIBILITY_V1',mode:'READ_ONLY_UNFILTERED_HASHES',subscription:'newPendingTransactions',acknowledged:false,events:0,uniqueHashes:0,duplicates:0,invalidMessages:0,rpcErrors:0,firstEventMs:null,lastEventMs:null,examples:[],durationMs:0,stoppedBy:null,transactionDetailsFetched:0,transactionsSigned:0,bundlesSubmitted:0,mainnetBroadcast:false,limitations:['Provider-visible mempool only; private transactions may be absent','No DEX decoding, target simulation or profitability verification','A successful subscription acknowledgement alone does not prove events are flowing']};
  const seen=new Set();let finished=false,ackTimer,stopTimer,ws;
  function finish(reason,error){if(finished)return;finished=true;clearTimeout(ackTimer);clearTimeout(stopTimer);stats.durationMs=Date.now()-start;stats.stoppedBy=reason;try{ws?.close()}catch{};if(error)reject(error);else resolve(stats)}
  try{ws=new WebSocketImpl(url,{handshakeTimeout:12000,maxPayload:1024*1024})}catch(e){reject(e);return}
  ackTimer=setTimeout(()=>finish('SUBSCRIPTION_ACK_TIMEOUT',Error('SUBSCRIPTION_ACK_TIMEOUT')),15000);
  stopTimer=setTimeout(()=>finish('DURATION_REACHED'),durationMs);
  ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:61001,method:'eth_subscribe',params:['newPendingTransactions']})));
  ws.on('message',raw=>{
   let msg;try{msg=JSON.parse(String(raw))}catch{stats.invalidMessages++;return}
   if(msg.id===61001){if(msg.error){stats.rpcErrors++;finish('SUBSCRIPTION_REJECTED',Error('SUBSCRIPTION_REJECTED_'+String(msg.error.code||'UNKNOWN')));return}if(typeof msg.result==='string'){stats.acknowledged=true;clearTimeout(ackTimer)}return}
   if(msg.method!=='eth_subscription')return;
   const hash=typeof msg.params?.result==='string'?msg.params.result:msg.params?.result?.hash;
   if(!HASH.test(hash||'')){stats.invalidMessages++;return}
   stats.events++;const now=Date.now()-start;if(stats.firstEventMs===null)stats.firstEventMs=now;stats.lastEventMs=now;
   const normalized=hash.toLowerCase();if(seen.has(normalized))stats.duplicates++;else{seen.add(normalized);stats.uniqueHashes++;if(stats.examples.length<3)stats.examples.push(normalized)}
   if(stats.events>=maxEvents)finish('EVENT_LIMIT_REACHED');
  });
  ws.on('error',e=>finish('WEBSOCKET_ERROR',Error('WEBSOCKET_ERROR_'+String(e.message).slice(0,100))));
  ws.on('close',()=>finish('WEBSOCKET_CLOSED'));
 });
}
if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(!r.acknowledged||!r.events)process.exitCode=2}).catch(e=>{console.error('PENDING_DIAGNOSTIC_FAILED',e.message);process.exitCode=1});
module.exports={run};
