'use strict';
// Pure fail-closed interpretation of Base trace preflight; does not imply execution.
function verdict(report){
 if(!report || report.mode!=='BASE_OP_STACK_TRACE_PREFLIGHT')return {ready:false,code:'INVALID_REPORT'};
 if(report.readOnly!==true||report.mainnetBroadcast!==false||report.executionEligible!==false)return {ready:false,code:'SAFETY_FLAGS_INVALID'};
 if(report.status!=='PREFLIGHT_COMPLETE_REPLAY_NOT_PROVEN')return {ready:false,code:'PREFLIGHT_INCOMPLETE'};
 if(!Array.isArray(report.transactions)||report.transactions.length!==report.targetIndex+1)return {ready:false,code:'TRANSACTION_PREFIX_INCOMPLETE'};
 if(!report.traceProbed)return {ready:false,code:'TRACE_NOT_REQUESTED'};
 if(report.rpcTraceSupported!==true)return {ready:false,code:'TRACE_RPC_UNAVAILABLE'};
 if(report.traceTargetSuccessful!==true||report.traceValidation?.traceShapeValid!==true)return {ready:false,code:'TRACE_MALFORMED'};
 return {ready:false,code:'TRACE_AVAILABLE_REPLAY_UNVERIFIED',next:'PROTOCOL_AWARE_STATE_RECONSTRUCTION'};
}
module.exports={verdict};
