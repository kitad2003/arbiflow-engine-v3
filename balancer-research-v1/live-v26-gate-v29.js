'use strict';
// Flashbots documented transaction SSE -> verified swap log -> V26 signed backrun
// validation. Read-only, no signature generation, RPC simulation, or bundle submission.
const {listen,select}=require('./live-target-v20');
const {prepare}=require('./mev-envelope-v28');
const ORIGIN='0x15ab0333985fd1e289adf4fbbe19261454776642';
const ALTERNATE='0x2F8AC927aa94293461C75406e90Ec0cCFb2748d9';
function inspect(events,inputs={}){
 const selection=select(events,{verifiedPools:[ORIGIN]});
 const target=selection.candidates[0];
 const gate=target?prepare({
  targetHash:target.targetHash,targetKind:'TRANSACTION',
  verifiedFirstPool:ORIGIN,verifiedSecondPool:ALTERNATE,
  backrunContract:inputs.backrunContract,operatorAddress:inputs.operatorAddress,
  backrunSignedTx:inputs.backrunSignedTx,inclusionBlock:inputs.inclusionBlock
 }):{ready:false,reason:'NO_MATCHING_TRANSACTION_SWAP_HINT'};
 return {build:'BALANCER_RESEARCH_V29',mode:'MEV_SHARE_LIVE_HINT_TO_V26_VALIDATION',
  ...selection,selectedTargetHash:target?.targetHash||null,
  verifiedOriginPool:ORIGIN,verifiedAlternativePool:ALTERNATE,
  validationStatus:gate.ready?'STRUCTURE_VALID_NOT_SIMULATED':'BLOCKED',
  validationReason:gate.reason||null,backrunSignedTxValidated:gate.ready,
  targetBytesAvailable:false,fullyMatchedSimulationInputVerified:false,
  simulationAttempted:false,signingPerformed:false,
  bundlesSubmitted:0,mainnetBroadcast:false,profitVerified:false,executionEligible:false,
  limitations:['LOG_HINT_DOES_NOT_PROVE_PROFIT','HASH_ONLY_NOT_FULLY_MATCHED_SIMULATION',
   'V28_FORMAT_VALIDATION_NOT_ONCHAIN_CONTRACT_VERIFICATION',
   'NO_SIGNING_SIMULATION_OR_MAINNET_SUBMISSION']};
}
async function run({listenImpl=listen,...inputs}={}){
 const feed=await listenImpl({durationMs:10000,maxEvents:80});
 return {connected:feed.connected,malformedSSE:feed.malformed,...inspect(feed.events,inputs)};
}
module.exports={inspect,run,ORIGIN,ALTERNATE};
if(require.main===module)run({
 backrunContract:process.env.V29_CONTRACT_ADDRESS,
 operatorAddress:process.env.V29_OPERATOR_ADDRESS,
 backrunSignedTx:process.env.V29_SIGNED_BACKRUN_TX,
 inclusionBlock:process.env.V29_INCLUSION_BLOCK?Number(process.env.V29_INCLUSION_BLOCK):undefined
}).then(result=>console.log(JSON.stringify(result))).catch(e=>{
 console.error('V29_FAILED',String(e.message).slice(0,160));process.exitCode=1;
});
