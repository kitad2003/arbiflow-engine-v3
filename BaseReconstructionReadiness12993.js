'use strict';
function readiness(r){
 if(!r||r.readOnly!==true||r.mainnetBroadcast!==false||r.executionEligible!==false)return {ready:false,code:'SAFETY_GATE'};
 if(!Number.isInteger(r.targetIndex)||r.targetIndex<0)return {ready:false,code:'INVALID_INDEX'};
 if(!Array.isArray(r.transactions)||r.transactions.length!==r.targetIndex+1)return {ready:false,code:'PREFIX_METADATA_MISSING'};
 if(!Array.isArray(r.prefixTraces)||r.prefixTraces.length!==r.targetIndex)return {ready:false,code:'PREFIX_TRACES_MISSING'};
 for(let i=0;i<r.targetIndex;i++){
  const t=r.prefixTraces[i];
  if(t?.index!==i||t?.hash?.toLowerCase()!==r.transactions[i]?.hash?.toLowerCase()||t?.traceShapeValid!==true)return {ready:false,code:'PREFIX_TRACE_INVALID',index:i};
 }
 if(Array.isArray(r.traceContinuity)&&r.traceContinuity.some(x=>x?.status==='INCONSISTENT'||(Array.isArray(x?.mismatches)&&x.mismatches.length>0)))return {ready:false,code:'TRACE_CONTINUITY_CONTRADICTION'};
 if(r.traceTargetSuccessful!==true)return {ready:false,code:'TARGET_TRACE_MISSING'};
 return {ready:false,code:'TRACE_EVIDENCE_ONLY_CHECKPOINT_UNVERIFIED'};
}
module.exports={readiness};
