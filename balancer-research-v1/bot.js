'use strict';
// Sources: Flashbots MEV-Share Automated Arbitrage Bot tutorial.
// Pure screening logic; it does not subscribe, sign, transact, or submit bundles.
const SWAP_TOPIC='0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x);
const normalized=x=>x.toLowerCase();
function verifiedPairIndex(entries){
 const index=new Map();
 for(const p of entries||[]){
  if(!address(p?.pool)||!address(p?.token0)||!address(p?.token1)||!address(p?.factory))continue;
  if(p.verified!==true||!p.venue||p.token0.toLowerCase()===p.token1.toLowerCase())continue;
  index.set(normalized(p.pool),{...p,pool:normalized(p.pool),token0:normalized(p.token0),token1:normalized(p.token1),factory:normalized(p.factory)});
 }
 return index;
}
function screenEvent(event,index){
 const watched=[],ignored=[];
 for(const log of event?.logs||[]){
  if(!address(log?.address)||normalized(String(log.topics?.[0]||''))!==SWAP_TOPIC)continue;
  const pool=index.get(normalized(log.address));
  if(!pool){ignored.push({pool:normalized(log.address),reason:'IDENTITY_NOT_VERIFIED'});continue}
  const alternatives=[...index.values()].filter(p=>p.pool!==pool.pool&&p.venue!==pool.venue&&
    [p.token0,p.token1].sort().join(':')===[pool.token0,pool.token1].sort().join(':'));
  if(!alternatives.length){ignored.push({pool:pool.pool,reason:'NO_VERIFIED_ALTERNATIVE_VENUE'});continue}
  watched.push({triggerPool:pool.pool,triggerVenue:pool.venue,alternatives:alternatives.map(p=>({pool:p.pool,venue:p.venue})),
   source:'LOG_TOPIC_HINT',transactionContentsKnown:false,backrunPositionProven:false,quoteVerified:false,profitable:false});
 }
 return {build:'BALANCER_RESEARCH_V1',mode:'SWAP_HINT_TO_VERIFIED_ALTERNATIVE_VENUE',
  eventHash:typeof event?.hash==='string'?event.hash:null,candidates:watched,ignored,
  txsKnown:Array.isArray(event?.txs)&&event.txs.length>0,
  alerts:[],executionEligible:false,bundleSubmissionEnabled:false,mainnetBroadcast:false};
}
module.exports={SWAP_TOPIC,verifiedPairIndex,screenEvent};
