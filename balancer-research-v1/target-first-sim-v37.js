'use strict';
// V37 Flashbots mev_simBundle beta-1 fully matched target-first diagnostic.
// Offline default. Optional explicit simulation RPC only: NEVER mev_sendBundle.
const {ethers}=require('ethers');
const {prepare}=require('./mev-envelope-v28');
const RELAY='https://relay.flashbots.net';
function build(input={}){
 const v=prepare(input);
 if(!v.ready)return {ready:false,reason:v.reason,simulationAttempted:false,mainnetBroadcast:false};
 if(typeof input.targetSignedTx!=='string'||!/^0x[0-9a-f]+$/i.test(input.targetSignedTx))
  return {ready:false,reason:'TARGET_SIGNED_TRANSACTION_REQUIRED',simulationAttempted:false,mainnetBroadcast:false};
 let target;
 try{target=ethers.Transaction.from(input.targetSignedTx)}catch{return {ready:false,reason:'INVALID_TARGET_SIGNED_TRANSACTION'}};
 if(!target.hash||target.chainId!==1n||!target.from)
  return {ready:false,reason:'SIGNED_ETHEREUM_TARGET_REQUIRED'};
 if(target.hash.toLowerCase()!==input.targetHash.toLowerCase())
  return {ready:false,reason:'TARGET_SIGNED_BYTES_HASH_MISMATCH'};
 if(target.hash.toLowerCase()===v.backrunHash.toLowerCase())
  return {ready:false,reason:'TARGET_CANNOT_EQUAL_BACKRUN'};
 const bundle=v.request.params[0];
 // Simulation API accepts fully matched signed transaction bodies.
 const matched={...bundle,body:[
  {tx:input.targetSignedTx,canRevert:false},
  {tx:input.backrunSignedTx,canRevert:false}
 ]};
 return {ready:true,reason:null,targetHash:target.hash,backrunHash:v.backrunHash,
  targetFirst:true,fullyMatchedBodies:true,
  request:{jsonrpc:'2.0',id:1,method:'mev_simBundle',params:[matched]},
  simulationAttempted:false,mainnetBroadcast:false,bundlesSubmitted:0,
  caution:'STRUCTURE_ONLY: full signed transactions required, not a profitability result'};
}
async function simulate(input,{fetchImpl=fetch,allowSimulation=false}={}){
 const p=build(input);
 if(!p.ready)return {build:'BALANCER_RESEARCH_V37',status:'BLOCKED',reason:p.reason,
  simulationAttempted:false,mainnetBroadcast:false,bundlesSubmitted:0};
 if(!allowSimulation)return {build:'BALANCER_RESEARCH_V37',
  status:'MATCHED_ENVELOPE_VALID_OFFLINE',targetFirst:true,
  fullyMatchedBodies:true,simulationAttempted:false,mainnetBroadcast:false,
  bundlesSubmitted:0,profitVerified:false,executionEligible:false};
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetchImpl(RELAY,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(p.request),signal:controller.signal});
  const rpc=await response.json();
  return {build:'BALANCER_RESEARCH_V37',status:rpc.error?'SIMULATION_RPC_ERROR':'SIMULATION_RESPONSE_RECEIVED',
   simulationAttempted:true,simulationSuccess:!rpc.error&&!!rpc.result?.success,
   simulationError:rpc.error?.message||null,
   result:rpc.result?{success:rpc.result.success??null,gasUsed:rpc.result.gasUsed??null,
    profit:rpc.result.profit??null,mevGasPrice:rpc.result.mevGasPrice??null}:null,
   mainnetBroadcast:false,bundlesSubmitted:0,profitVerified:false,executionEligible:false};
 }catch(e){return {build:'BALANCER_RESEARCH_V37',status:'SIMULATION_TRANSPORT_ERROR',
  simulationAttempted:true,reason:String(e.message).slice(0,100),mainnetBroadcast:false,bundlesSubmitted:0}}
 finally{clearTimeout(timeout)}
}
module.exports={build,simulate};
if(require.main===module)simulate({
 targetHash:process.env.V37_TARGET_HASH,targetSignedTx:process.env.V37_TARGET_SIGNED_TX,
 backrunContract:process.env.V37_CONTRACT_ADDRESS,backrunSignedTx:process.env.V37_BACKRUN_SIGNED_TX,
 operatorAddress:process.env.V37_OPERATOR_ADDRESS,verifiedFirstPool:process.env.V37_FIRST_POOL,
 verifiedSecondPool:process.env.V37_SECOND_POOL,
 inclusionBlock:process.env.V37_INCLUSION_BLOCK?Number(process.env.V37_INCLUSION_BLOCK):undefined
},{allowSimulation:process.env.V37_ALLOW_SIMULATION==='1'})
 .then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V37_FAILED',String(e.message).slice(0,160));process.exitCode=1});
