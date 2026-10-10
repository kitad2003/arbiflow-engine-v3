'use strict';
// V2 read-only bounded sampling. Public mempool visibility != executable opportunity.
const WebSocket=require('ws');
const HASH=/^0x[0-9a-f]{64}$/i;
const METHODS=Object.freeze({
 '0x38ed1739':'UNISWAP_V2_SWAP_EXACT_TOKENS_FOR_TOKENS',
 '0x8803dbee':'UNISWAP_V2_SWAP_TOKENS_FOR_EXACT_TOKENS',
 '0x7ff36ab5':'UNISWAP_V2_SWAP_EXACT_ETH_FOR_TOKENS',
 '0x18cbafe5':'UNISWAP_V2_SWAP_EXACT_TOKENS_FOR_ETH',
 '0x414bf389':'UNISWAP_V3_EXACT_INPUT_SINGLE',
 '0xc04b8d59':'UNISWAP_V3_EXACT_INPUT',
 '0xdb3e2198':'UNISWAP_V3_EXACT_OUTPUT_SINGLE',
 '0xf28c0498':'UNISWAP_V3_EXACT_OUTPUT',
 '0x5ae401dc':'UNISWAP_V3_MULTICALL',
 '0xac9650d8':'MULTICALL',
 '0x3593564c':'UNIVERSAL_ROUTER_EXECUTE_WITH_DEADLINE',
 '0x24856bc3':'UNIVERSAL_ROUTER_EXECUTE'
});
const ROUTERS=Object.freeze({
 '0x7a250d5630b4cf539739df2c5dacab4c659f2488':'UNISWAP_V2_ROUTER02',
 '0xe592427a0aece92de3edee1f18e0157c05861564':'UNISWAP_V3_SWAP_ROUTER',
 '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45':'UNISWAP_SWAP_ROUTER02',
 '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad':'UNISWAP_UNIVERSAL_ROUTER'
});
function classify(tx){
 const to=typeof tx?.to==='string'?tx.to.toLowerCase():null;
 const input=typeof tx?.input==='string'?tx.input.toLowerCase():'';
 const selector=/^0x[0-9a-f]{8}/.test(input)?input.slice(0,10):null;
 const router=ROUTERS[to]||null,method=METHODS[selector]||null;
 const classification=!to?'CONTRACT_CREATION':!selector?(input==='0x'||!input?'NO_CALLDATA':'SHORT_OR_INVALID_CALLDATA'):router&&method?'KNOWN_ROUTER_KNOWN_SELECTOR':router?'KNOWN_ROUTER_UNRECOGNIZED_SELECTOR':method?'KNOWN_SELECTOR_UNVERIFIED_DESTINATION':'UNKNOWN_SELECTOR_UNVERIFIED_DESTINATION';
 return {hash:tx?.hash||null,to,router,selector,method,classification,swapVerified:false,decodedPath:false,profitVerified:false};
}
async function run({url=process.env.ETHEREUM_WSS_URL,durationMs=Number(process.env.PENDING_DURATION_MS||60000),maxLookups=Number(process.env.PENDING_MAX_LOOKUPS||120),maxInFlight=Number(process.env.PENDING_MAX_IN_FLIGHT||4),lookupIntervalMs=Number(process.env.PENDING_LOOKUP_INTERVAL_MS||500),WebSocketImpl=WebSocket}={}){
 if(!url||!/^wss:\/\//i.test(url))throw Error('ETHEREUM_WSS_URL_MUST_BE_WSS');
 durationMs=Math.min(120000,Math.max(5000,durationMs));maxLookups=Math.min(600,Math.max(1,maxLookups));maxInFlight=Math.min(8,Math.max(1,maxInFlight));lookupIntervalMs=Math.max(100,lookupIntervalMs);
 return new Promise((resolve,reject)=>{
 const started=Date.now(),stats={build:'ARBIFLOW_PENDING_INVESTIGATION_V3',mode:'READ_ONLY_BOUNDED_SAMPLE',acknowledged:false,pendingHashes:0,uniqueHashes:0,lookupsSent:0,lookupsResolved:0,lookupsNull:0,lookupErrors:0,lookupTimeouts:0,knownRouter:0,knownRouterKnownSelector:0,unknownDestination:0,examples:[],classificationCounts:{},selectorCounts:{},destinationCounts:{},sampleUnmatched:[],durationMs:0,stoppedBy:null,transactionsSigned:0,bundlesSubmitted:0,mainnetBroadcast:false,profitVerified:0,limitations:['Provider-visible mempool only','Selector and destination recognition is not full calldata decoding or verified swap','Sampled selectors and destinations are not verified contract identities; no pool matching, target-first simulation, executable quotes or net-profit gate']};
 let ws,done=false,subscribed=false,sequence=71000,lastLookup=0,inFlight=0;
 const seen=new Set(),pending=new Map(),queue=[];
 let timer,ackTimer,tick;
 function finish(reason,error){if(done)return;done=true;clearTimeout(timer);clearTimeout(ackTimer);clearInterval(tick);stats.durationMs=Date.now()-started;stats.stoppedBy=reason;
 const top=(obj,n)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([value,count])=>({value,count}));
 stats.topSelectors=top(stats.selectorCounts,15);stats.topDestinations=top(stats.destinationCounts,15);delete stats.selectorCounts;delete stats.destinationCounts;for(const item of pending.values())clearTimeout(item);pending.clear();try{ws?.close()}catch{};if(error)reject(error);else resolve(stats)}
 function pump(){if(done||!subscribed)return;while(queue.length&&inFlight<maxInFlight&&stats.lookupsSent<maxLookups&&Date.now()-lastLookup>=lookupIntervalMs){
 const hash=queue.shift(),id=++sequence;lastLookup=Date.now();stats.lookupsSent++;inFlight++;
 const timeout=setTimeout(()=>{if(!pending.has(id))return;pending.delete(id);inFlight--;stats.lookupTimeouts++;pump()},8000);
 pending.set(id,timeout);ws.send(JSON.stringify({jsonrpc:'2.0',id,method:'eth_getTransactionByHash',params:[hash]}));
 }}
 try{ws=new WebSocketImpl(url,{handshakeTimeout:12000,maxPayload:1024*1024})}catch(e){reject(e);return}
 ackTimer=setTimeout(()=>finish('SUBSCRIPTION_ACK_TIMEOUT',Error('SUBSCRIPTION_ACK_TIMEOUT')),15000);
 timer=setTimeout(()=>finish('DURATION_REACHED'),durationMs);tick=setInterval(pump,100);
 ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:71000,method:'eth_subscribe',params:['newPendingTransactions']})));
 ws.on('message',raw=>{
 let m;try{m=JSON.parse(String(raw))}catch{return}
 if(m.id===71000){if(m.error)return finish('SUBSCRIPTION_REJECTED',Error('SUBSCRIPTION_REJECTED'));if(typeof m.result==='string'){subscribed=true;stats.acknowledged=true;clearTimeout(ackTimer)}return}
 if(typeof m.id==='number'&&pending.has(m.id)){clearTimeout(pending.get(m.id));pending.delete(m.id);inFlight--;
 if(m.error)stats.lookupErrors++;else if(!m.result)stats.lookupsNull++;else{stats.lookupsResolved++;const c=classify(m.result);if(c.router)stats.knownRouter++;else stats.unknownDestination++;if(c.router&&c.method)stats.knownRouterKnownSelector++;stats.classificationCounts[c.classification]=(stats.classificationCounts[c.classification]||0)+1;
 if(c.selector)stats.selectorCounts[c.selector]=(stats.selectorCounts[c.selector]||0)+1;
 if(c.to)stats.destinationCounts[c.to]=(stats.destinationCounts[c.to]||0)+1;
 if(!c.router&&stats.sampleUnmatched.length<12)stats.sampleUnmatched.push({hash:c.hash,to:c.to,selector:c.selector,classification:c.classification});
 if(c.router&&stats.examples.length<10)stats.examples.push(c)}
 pump();return}
 if(m.method==='eth_subscription'){
 const hash=typeof m.params?.result==='string'?m.params.result:m.params?.result?.hash;
 if(!HASH.test(hash||''))return;stats.pendingHashes++;const h=hash.toLowerCase();if(seen.has(h))return;seen.add(h);stats.uniqueHashes++;
 if(stats.lookupsSent+queue.length<maxLookups)queue.push(h);pump();
 }
 });
 ws.on('error',e=>finish('WEBSOCKET_ERROR',Error('WEBSOCKET_ERROR_'+String(e.message).slice(0,100))));
 ws.on('close',()=>finish('WEBSOCKET_CLOSED'));
 });
}
if(require.main===module)run().then(s=>{console.log(JSON.stringify(s,null,2));if(!s.acknowledged||!s.pendingHashes)process.exitCode=2}).catch(e=>{console.error('PENDING_V3_FAILED',e.message);process.exitCode=1});
module.exports={run,classify,METHODS,ROUTERS};
