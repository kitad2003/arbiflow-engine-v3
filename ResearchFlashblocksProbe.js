'use strict';
// Base Flashblocks research-only pendingLogs probe. Explicitly detects provider capability.
// No routing, simulated profit, signing or broadcast.
const fs=require('node:fs'),WebSocket=require('ws'),{assess}=require('./ResearchTransactionImpact');
const validAddress=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x);
function parseNotification(message,subscriptionId,allowed){
 if(message?.method!=='eth_subscription'||message.params?.subscription!==subscriptionId)return null;
 const l=message.params.result;
 if(!l||!validAddress(l.address)||!allowed.has(l.address.toLowerCase())||typeof l.transactionHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(l.transactionHash))return null;
 // Subscription was explicitly acknowledged as pendingLogs, therefore provider labels these as preconfirmed.
 return {txHash:l.transactionHash,pool:l.address,phase:'PRECONFIRMED'};
}
async function run({url,addresses,seconds=25}){
 if(typeof url!=='string'||!url.startsWith('wss://'))throw Error('BASE_RESEARCH_WSS_URL_REQUIRED');
 if(!Array.isArray(addresses)||!addresses.length||addresses.length>100||!addresses.every(validAddress))throw Error('VALID_POOL_ADDRESSES_REQUIRED');
 if(!Number.isInteger(seconds)||seconds<1||seconds>90)throw Error('BAD_SECONDS');
 const allowed=new Set(addresses.map(a=>a.toLowerCase())),ws=new WebSocket(url,{handshakeTimeout:10000});
 const stats={acknowledged:false,providerError:null,notifications:0,invalid:0,duplicates:0,subscriptionType:'pendingLogs'};
 const observations=[],seen=new Set();let sub=null,done=false;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{reject(Error('SUBSCRIPTION_ACK_TIMEOUT'));ws.terminate()},15000);
  ws.once('error',e=>{clearTimeout(timer);reject(e)});
  ws.once('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:20261010,method:'eth_subscribe',params:['pendingLogs',{address:addresses}]})));
  ws.on('message',raw=>{
   let m;try{m=JSON.parse(String(raw))}catch{stats.invalid++;return}
   if(m.id===20261010&&!done){
    done=true;clearTimeout(timer);
    if(m.error){stats.providerError={code:m.error.code??null,message:String(m.error.message||'PROVIDER_REJECTED').slice(0,180)};resolve();return}
    if(typeof m.result!=='string'){stats.providerError={message:'MISSING_SUBSCRIPTION_ID'};resolve();return}
    sub=m.result;stats.acknowledged=true;resolve();return
   }
   if(!stats.acknowledged)return;
   if(m.method!=='eth_subscription'||m.params?.subscription!==sub)return;
   stats.notifications++;
   const x=parseNotification(m,sub,allowed);
   if(!x){stats.invalid++;return}
   const k=x.txHash+':'+x.pool.toLowerCase();
   if(seen.has(k)){stats.duplicates++;return}
   seen.add(k);observations.push(x);
  })
 });
 if(stats.acknowledged)await new Promise(resolve=>setTimeout(resolve,seconds*1000));
 ws.close();
 const assessment=assess(observations);
 return {build:'RESEARCH_ONLY_3',mode:'BASE_FLASHBLOCKS_PENDING_LOGS_PROBE',providerSupportsPendingLogs:stats.acknowledged,
  stats,observedEvents:observations.length,assessment,
  limitations:['PROVIDER_ACK_DOES_NOT_GUARANTEE_EVENT_DELIVERY','PENDING_LOGS_ARE_PRECONFIRMED_NOT_MEMPOOL_WIDE','NO_TRANSACTION_ORDERING_PROOF','NO_SIMULATION_OR_PROFIT_VERIFICATION'],
  mainnetBroadcast:false,executionEligible:false};
}
if(require.main===module){
 const addr=(process.env.BASE_RESEARCH_POOL_ADDRESSES||'').split(',').map(x=>x.trim()).filter(Boolean);
 const url=process.env.BASE_RESEARCH_WSS_URL||'';
 run({url,addresses:addr,seconds:Number(process.env.RESEARCH_WATCH_SECONDS||25)}).then(x=>{
  fs.writeFileSync('arbiflow-flashblocks-capability.json',JSON.stringify(x,null,2)+'\n');
  console.log(JSON.stringify(x));
  if(!x.providerSupportsPendingLogs)process.exitCode=2;
 }).catch(e=>{console.error('FLASHBLOCKS_PROBE_ERROR',String(e.message).replace(/wss:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,parseNotification};
