'use strict';
// Bounded, read-only Ethereum and Base subscription verification.
// Base Flashblocks transactions are sequencer-preconfirmed, NOT public mempool pending transactions.
const WebSocket=require('ws');
const {CHAINS}=require('./multichain-monitor-registry-v1');
const HASH=/^0x[0-9a-f]{64}$/i;
const MODES=Object.freeze({
 ethereum:{chainId:1,secret:'ETHEREUM_WSS_URL',subscription:['newPendingTransactions'],eventMeaning:'NODE_VISIBLE_PENDING_HASH'},
 base:{chainId:8453,secret:'BASE_FLASHBLOCKS_WSS_URL',subscription:['newFlashblockTransactions'],eventMeaning:'SEQUENCER_PRECONFIRMED_TRANSACTION'}
});
function normalize(mode,result){const hash=typeof result==='string'?result:result?.hash;return HASH.test(hash||'')?hash.toLowerCase():null}
function probe({mode,url,WebSocketImpl=WebSocket,durationMs=Number(process.env.FEED_DURATION_MS||30000)}={}){
 if(!MODES[mode])throw Error('UNSUPPORTED_FEED');
 if(!url||!/^wss:\/\//i.test(url))throw Error('WSS_ENDPOINT_NOT_CONFIGURED');
 const config=MODES[mode];durationMs=Math.max(5000,Math.min(60000,durationMs));
 return new Promise((resolve,reject)=>{
  const started=Date.now(),stats={chain:mode,chainId:config.chainId,eventMeaning:config.eventMeaning,subscription:config.subscription[0],acknowledged:false,events:0,uniqueEvents:0,duplicates:0,invalidEvents:0,firstEventMs:null,lastEventMs:null,examples:[],durationMs:0,stopReason:null,readOnly:true,executionEnabled:false,mainnetBroadcast:false};
  let ws,done=false,subscriptionId=null,ackTimer,stopTimer;const seen=new Set();
  function finish(reason,error){if(done)return;done=true;clearTimeout(ackTimer);clearTimeout(stopTimer);stats.durationMs=Date.now()-started;stats.stopReason=reason;try{ws?.close()}catch{};if(error)reject(error);else resolve(stats)}
  try{ws=new WebSocketImpl(url,{handshakeTimeout:12000,maxPayload:1024*1024})}catch(e){reject(e);return}
  ackTimer=setTimeout(()=>finish('ACK_TIMEOUT',Error('SUBSCRIPTION_ACK_TIMEOUT')),15000);
  stopTimer=setTimeout(()=>finish('DURATION_REACHED'),durationMs);
  ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:88001,method:'eth_subscribe',params:config.subscription})));
  ws.on('message',raw=>{
   let m;try{m=JSON.parse(String(raw))}catch{stats.invalidEvents++;return}
   if(m.id===88001){if(m.error)return finish('SUBSCRIPTION_REJECTED',Error('SUBSCRIPTION_REJECTED_'+String(m.error.code||'UNKNOWN')));if(typeof m.result==='string'){subscriptionId=m.result;stats.acknowledged=true;clearTimeout(ackTimer)}return}
   if(m.method!=='eth_subscription'||m.params?.subscription!==subscriptionId)return;
   const hash=normalize(mode,m.params?.result);if(!hash){stats.invalidEvents++;return}
   stats.events++;const elapsed=Date.now()-started;if(stats.firstEventMs===null)stats.firstEventMs=elapsed;stats.lastEventMs=elapsed;
   if(seen.has(hash))stats.duplicates++;else{seen.add(hash);stats.uniqueEvents++;if(stats.examples.length<3)stats.examples.push(hash)}
  });
  ws.on('error',e=>finish('WEBSOCKET_ERROR',Error('WEBSOCKET_ERROR_'+String(e.message).slice(0,90))));
  ws.on('close',()=>finish('WEBSOCKET_CLOSED'));
 });
}
async function run({env=process.env,probeImpl=probe}={}){
 const out={build:'ARBIFLOW_MULTICHAIN_FEED_VERIFICATION_V2',readOnly:true,executionEnabled:false,chainCount:CHAINS.length,results:[],summary:{configured:0,acknowledged:0,withEvents:0},limitations:['Only Ethereum pending hashes and Base Flashblocks are implemented','Other 13 chains are registry entries, not live feeds','GitHub Actions bounded tests do not provide 24/7 monitoring','No pool matching, profit simulation, bundles or trades']};
 for(const [mode,config] of Object.entries(MODES)){
  const url=env[config.secret];
  if(!url){out.results.push({chain:mode,status:'NOT_CONFIGURED',secretName:config.secret,active:false,verifiedLive:false});continue}
  out.summary.configured++;
  try{const result=await probeImpl({mode,url});out.summary.acknowledged+=Number(result.acknowledged);out.summary.withEvents+=Number(result.events>0);out.results.push({...result,status:result.acknowledged&&result.events>0?'EVENTS_OBSERVED':'NO_EVENTS_OBSERVED',verifiedLive:result.acknowledged&&result.events>0,active:false})}
  catch(e){out.results.push({chain:mode,status:'PROBE_FAILED',reason:String(e.message).slice(0,100),active:false,verifiedLive:false})}
 }
 return out;
}
if(require.main===module)run().then(x=>{console.log(JSON.stringify(x,null,2));if(x.summary.configured===0||x.summary.withEvents===0)process.exitCode=2}).catch(e=>{console.error('FEED_VERIFICATION_FAILED',e.message);process.exitCode=1});
module.exports={run,probe,normalize,MODES};
