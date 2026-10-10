'use strict';
// V31 Flashbots MEV-Share Event Stream: event.hash is a double-hash.
// txs[].hash is optional; never promote event.hash to a raw transaction target.
// Diagnostics only; no signing, simulation or broadcasting.
const {listen}=require('./live-target-v20');
const {SWAP_TOPIC}=require('./bot');
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
function diagnose(events){
 const seen=new Set(),topics=new Map(),selectors=new Map(),samples=[];
 let invalid=0,duplicates=0,oneTx=0,multiTx=0,noTx=0,
  logsPresent=0,swapLogEvents=0,swapLogs=0,disclosedTxHashes=0,
  transactionEntries=0,eventsWithCalldata=0;
 for(const event of events){
  if(!HASH.test(event?.hash||'')){invalid++;continue}
  const eventHash=event.hash.toLowerCase();
  if(seen.has(eventHash)){duplicates++;continue}
  seen.add(eventHash);
  const txs=Array.isArray(event.txs)?event.txs:[];
  if(txs.length===1)oneTx++;else if(txs.length>1)multiTx++;else noTx++;
  transactionEntries+=txs.length;
  let known=0,calldata=0;
  for(const tx of txs){
   if(HASH.test(tx?.hash||'')){known++;disclosedTxHashes++}
   if(typeof tx?.callData==='string'&&/^0x[0-9a-f]+$/i.test(tx.callData)){calldata++;eventsWithCalldata++}
   const selector=String(tx?.functionSelector||'').toLowerCase();
   if(/^0x[0-9a-f]{8}$/.test(selector))selectors.set(selector,(selectors.get(selector)||0)+1);
  }
  const logs=Array.isArray(event.logs)?event.logs:[];
  if(logs.length)logsPresent++;
  let swaps=0;
  for(const log of logs.slice(0,100)){
   const topic=String(log?.topics?.[0]||'').toLowerCase();
   if(!HASH.test(topic))continue;
   topics.set(topic,(topics.get(topic)||0)+1);
   if(topic===SWAP_TOPIC&&ADDR.test(log?.address||'')){swaps++;swapLogs++}
  }
  if(swaps)swapLogEvents++;
  if(samples.length<12)samples.push({eventHash,
   eventHashKind:'FLASHBOTS_DOUBLE_HASH_NOT_RAW_TX_HASH',txEntries:txs.length,
   disclosedUnderlyingTxHashes:known,calldataEntries:calldata,logs:logs.length,
   uniswapV2SwapLogs:swaps,rawTargetEligible:known>0,
   rawTargetHash:txs.length===1&&HASH.test(txs[0]?.hash||'')?txs[0].hash.toLowerCase():null});
 }
 return {eventsReceived:events.length,uniqueEvents:seen.size,invalidEvents:invalid,duplicates,
  eventsWithOneTxEntry:oneTx,eventsWithMultipleTxEntries:multiTx,eventsWithoutTxEntries:noTx,
  totalTxEntries:transactionEntries,underlyingTxHashesDisclosed:disclosedTxHashes,
  calldataEntriesDisclosed:eventsWithCalldata,eventsWithLogs:logsPresent,
  eventsWithUniswapV2SwapHints:swapLogEvents,uniswapV2SwapLogs:swapLogs,
  topicFrequency:[...topics].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([topic,count])=>({topic,count,uniswapV2Swap:topic===SWAP_TOPIC})),
  functionSelectorFrequency:[...selectors].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([selector,count])=>({selector,count})),
  samples};
}
async function run({listenImpl=listen,durationMs=30000}={}){
 const feed=await listenImpl({durationMs,maxEvents:200});
 return {build:'BALANCER_RESEARCH_V31',mode:'FLASHBOTS_MEV_SHARE_DISCLOSURE_AND_HASH_AUDIT',
  connected:feed.connected,malformedSSE:feed.malformed,...diagnose(feed.events),
  targetSelectionPerformed:false,simulationAttempted:false,mainnetBroadcast:false,
  signingPerformed:false,bundlesSubmitted:0,profitVerified:false,executionEligible:false,
  limitations:['EVENT_HASH_IS_DOUBLE_HASH_NOT_UNDERLYING_TRANSACTION_HASH',
   'SINGLE_TX_ENTRY_DOES_NOT_GUARANTEE_UNDERLYING_HASH_DISCLOSURE',
   'TRANSACTION_METADATA_DISCLOSURES_ARE_OPTIONAL','TOPIC_FREQUENCY_NOT_PROFIT',
   'NO_TARGET_FIRST_SIMULATION_OR_BUNDLE_SUBMISSION']};
}
module.exports={diagnose,run};
if(require.main===module)run().then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V31_FAILED',String(e.message).slice(0,150));process.exitCode=1});
