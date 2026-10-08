'use strict';
// Shared in-process Phase 9.2 event -> targeted read-only quote scheduling.
let handler=null;
const state={received:0,accepted:0,coalesced:0,skipped:0,lastEventAt:null,lastTriggeredAt:null,lastError:null};
let pending=false,lastRun=0;
const cooldownMs=15000;
function register(fn){handler=fn}
function notify(event){
 state.received++;state.lastEventAt=new Date().toISOString();
 if(!handler){state.skipped++;return false}
 if(pending||Date.now()-lastRun<cooldownMs){state.coalesced++;return false}
 pending=true;lastRun=Date.now();state.accepted++;state.lastTriggeredAt=new Date().toISOString();
 setImmediate(async()=>{try{await handler(event)}catch(e){state.lastError=String(e?.message||e).slice(0,160)}finally{pending=false}});
 return true;
}
function status(){return {...state,pending,cooldownMs,handlerRegistered:!!handler}}
module.exports={register,notify,status};
