'use strict';
// Process-local bounded pending transaction observation store; never stores private data.
const observations=new Map();
const MAX=5000,TTL=15*60*1000;
function prune(now=Date.now()){
 for(const [hash,row] of observations){if(now-row.firstSeenAtMs>TTL)observations.delete(hash);}
 while(observations.size>MAX)observations.delete(observations.keys().next().value);
}
function record(tx,now=Date.now()){
 const hash=String(tx?.hash||'').toLowerCase();
 if(!/^0x[0-9a-f]{64}$/.test(hash))return false;
 prune(now);
 if(observations.has(hash))return false;
 observations.set(hash,{hash,firstSeenAtMs:now,to:String(tx.to||'').toLowerCase(),selector:String(tx.input||tx.data||'0x').slice(0,10).toLowerCase()});
 prune(now);
 return true;
}
function match(hash){prune();return observations.get(String(hash||'').toLowerCase())||null;}
function stats(){prune();return {stored:observations.size,max:MAX,ttlMs:TTL,processLocal:true};}
module.exports={record,match,stats};
