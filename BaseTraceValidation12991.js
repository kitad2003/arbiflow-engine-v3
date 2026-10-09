'use strict';
// Strictly checks prestateTracer diffMode shape; never asserts actual replay.
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const WORD=/^0x[0-9a-fA-F]{1,64}$/;
function validStateMap(map){
 if(!map||typeof map!=='object'||Array.isArray(map))return false;
 return Object.entries(map).every(([address,account])=>{
  if(!ADDRESS.test(address)||!account||typeof account!=='object'||Array.isArray(account))return false;
  if(account.storage!==undefined && (!account.storage||typeof account.storage!=='object'||Array.isArray(account.storage)||!Object.entries(account.storage).every(([slot,value])=>WORD.test(slot)&&WORD.test(value))))return false;
  return true;
 });
}
function evaluateTrace(trace){
 const base={traceShapeValid:false,accountCountPre:0,accountCountPost:0,hasChanges:false,
  reconstructed:false,reason:'INVALID_PRESTATE_DIFF_TRACE'};
 if(!trace||!validStateMap(trace.pre)||!validStateMap(trace.post))return base;
 const pre=Object.keys(trace.pre),post=Object.keys(trace.post);
 return {...base,traceShapeValid:true,accountCountPre:pre.length,accountCountPost:post.length,
  hasChanges:pre.length>0||post.length>0,reason:'TRACE_DIAGNOSTIC_ONLY_STATE_REPLAY_UNVERIFIED'};
}
module.exports={evaluateTrace};
