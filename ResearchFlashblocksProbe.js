'use strict';
// Base Flashblocks research-only pendingLogs probe. Explicitly detects provider capability.
// No routing, simulated profit, signing or broadcast.
const fs=require('node:fs'),WebSocket=require('ws'),{ethers}=require('ethers'),{assess}=require('./ResearchTransactionImpact'),{decode}=require('./ResearchSwapDecoder'),{identify,enrich}=require('./ResearchPoolIdentity');
const {spot}=require('./ResearchV3Spot');
const {summarize}=require('./ResearchSpotComparison');
const {inspect}=require('./ResearchOrderingEvidence');
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
 const stats={acknowledged:false,providerError:null,notifications:0,invalid:0,duplicates:0,decodedSwaps:0,unsupportedLogs:0,subscriptionType:'pendingLogs'};
 const observations=[],decoded=[],seen=new Set();let sub=null,done=false;
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
   const k=x.txHash+':'+x.pool.toLowerCase()+':'+String(m.params.result.logIndex??'');
   if(seen.has(k)){stats.duplicates++;return}
   seen.add(k);const decodedEvent=decode(m.params.result);if(decodedEvent.recognized)stats.decodedSwaps++;else stats.unsupportedLogs++;decoded.push({txHash:x.txHash,pool:x.pool,phase:x.phase,logIndex:m.params.result.logIndex??null,blockHash:m.params.result.blockHash??null,blockNumber:m.params.result.blockNumber??null,transactionIndex:m.params.result.transactionIndex??null,decoded:decodedEvent});observations.push(x);
  })
 });
 if(stats.acknowledged)await new Promise(resolve=>setTimeout(resolve,seconds*1000));
 ws.close();
 const metadata={};let metadataProvider=null;
 const rpc=process.env.BASE_RPC_URL||'';
 if(/^https:\/\//.test(rpc)&&decoded.some(x=>x.decoded.recognized)){
  metadataProvider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
  try{for(const pool of [...new Set(decoded.filter(x=>x.decoded.recognized).map(x=>x.pool))])metadata[pool.toLowerCase()]=await identify(metadataProvider,pool)}
  finally{metadataProvider.destroy()}
 }
 const decodedWithTokens=decoded.map(x=>{const enriched=enrich(x,metadata[x.pool.toLowerCase()]);return {...enriched,postSwapSpot:spot(enriched)}});
 const spotComparison=summarize(decodedWithTokens);
 const orderingEvidence=inspect(decodedWithTokens);
 const assessment=assess(observations);
 return {build:'RESEARCH_ONLY_9',mode:'BASE_FLASHBLOCKS_ORDERING_EVIDENCE_DIAGNOSTIC',providerSupportsPendingLogs:stats.acknowledged,
  stats,observedEvents:observations.length,decodedEvents:decodedWithTokens.slice(0,25),verifiedPoolMetadata:Object.values(metadata).filter(x=>x.verified).length,spotComparison,orderingEvidence,assessment,
  limitations:['PROVIDER_ACK_DOES_NOT_GUARANTEE_EVENT_DELIVERY','PENDING_LOGS_ARE_PRECONFIRMED_NOT_MEMPOOL_WIDE','NO_TRANSACTION_ORDERING_PROOF','CONFIRMED_STATE_TOKEN_METADATA_NOT_PENDING_STATE','POST_SWAP_SPOT_IS_NOT_PRICE_IMPACT_SIMULATION','SWAP_DECODING_IS_NOT_PRICE_IMPACT_SIMULATION','NO_SIMULATION_OR_PROFIT_VERIFICATION'],
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
