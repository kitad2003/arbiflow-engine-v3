'use strict';
// Research-only Base WebSocket log ingestion; no transactions signed or sent.
// A log subscription delivers preconfirmed evidence ONLY if the provider documents that behavior.
const fs=require('node:fs'),WebSocket=require('ws'),{assess}=require('./ResearchTransactionImpact');
const isAddress=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x);
async function collect({url,addresses,seconds=25,connectTimeoutMs=10000}){
 if(!/^wss:\/\//.test(url||''))throw Error('WSS_URL_REQUIRED');
 if(!Array.isArray(addresses)||!addresses.length||addresses.length>100||!addresses.every(isAddress))throw Error('VALID_POOL_ADDRESSES_REQUIRED');
 if(!Number.isInteger(seconds)||seconds<1||seconds>120)throw Error('BAD_CAPTURE_WINDOW');
 const ws=new WebSocket(url,{handshakeTimeout:connectTimeoutMs}),events=[],seen=new Set();
 const stats={subscriptionAcknowledged:false,notifications:0,malformed:0,duplicate:0,accepted:0,providerPhaseVerified:false};
 await new Promise((resolve,reject)=>{
  let settled=false;const timer=setTimeout(()=>finish(new Error('WSS_CONNECTION_TIMEOUT')),connectTimeoutMs);
  function finish(err){if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve()}
  ws.once('open',()=>{ws.send(JSON.stringify({jsonrpc:'2.0',id:79139,method:'eth_subscribe',params:['logs',{address:addresses}]}));finish()});
  ws.once('error',finish);
 });
 ws.on('message',raw=>{
  let m;try{m=JSON.parse(String(raw))}catch{stats.malformed++;return}
  if(m.id===79139){stats.subscriptionAcknowledged=typeof m.result==='string';return}
  if(m.method!=='eth_subscription')return;
  stats.notifications++;const log=m.params?.result;
  if(!log||!isAddress(log.address)||typeof log.transactionHash!=='string'||!/^(0x)[0-9a-f]{64}$/i.test(log.transactionHash)){stats.malformed++;return}
  const key=log.transactionHash.toLowerCase()+':'+log.address.toLowerCase()+':'+String(log.logIndex??'');
  if(seen.has(key)){stats.duplicate++;return}seen.add(key);
  // Never infer pending/preconfirmed phase from subscription name or low block number.
  const phase=log.blockNumber==null?'PENDING':'CONFIRMED';
  if(phase!=='PENDING')return;
  events.push({txHash:log.transactionHash,pool:log.address,phase});stats.accepted++;
 });
 await new Promise(resolve=>setTimeout(resolve,seconds*1000));
 ws.close();
 const evaluated=assess(events);
 return {build:'RESEARCH_ONLY_2',mode:'BASE_WSS_POOL_LOG_OBSERVATION',source:'PROVIDER_ETH_SUBSCRIBE_LOGS',
  stats,observedEvents:events.length,assessment:evaluated,limitations:['CONFIRMED_LOGS_NOT_TREATED_AS_PRECONFIRMED','PENDING_LOGS_REQUIRE_PROVIDER_SEMANTICS_VERIFICATION','NOT_MEMPOOL_WIDE','NO_TRADE_EXECUTION'],
  mainnetBroadcast:false,executionEligible:false};
}
if(require.main===module){
 const url=process.env.BASE_RESEARCH_WSS_URL||'';
 const addresses=(process.env.BASE_RESEARCH_POOL_ADDRESSES||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!url||!addresses.length){console.error('RESEARCH_WSS_AND_POOL_ADDRESSES_REQUIRED');process.exitCode=1}
 else collect({url,addresses,seconds:Number(process.env.RESEARCH_WATCH_SECONDS||25)})
  .then(x=>{fs.writeFileSync('arbiflow-research-feed.json',JSON.stringify(x,null,2)+'\n');console.log(JSON.stringify(x))})
  .catch(e=>{console.error('RESEARCH_FEED_FAILED',String(e.message).replace(/wss:\/\/[^\s]+/g,'[REDACTED]').slice(0,160));process.exitCode=1});
}
module.exports={collect};
