'use strict';
// 12.9.4 fork preflight inventory only. Does not run Hardhat or produce fake gas numbers.
const safety=Object.freeze({readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false});
function mount(app){
 app.get('/api/phase12/fork/status',(_req,res)=>{
  const fs=require('node:fs');const path=require('node:path');
  const files=['ArbiFlowCrossVenueForkPrototype1295.sol','CrossVenuePreflight1295.js','hardhat.config.js','ControlledAtomicForkTest4300.js','ProductionBoundForkTest4380.js','ArbiFlowExecutor414.sol','phase127-routes.js'];
  const inventory=files.map(name=>({file:name,present:fs.existsSync(path.join(__dirname,name))}));
  const rpcConfigured=!!(process.env.BASE_RPC_URL||'').trim();
  const allFilesPresent=inventory.every(x=>x.present);
  res.json({success:true,build:'12.9.5',mode:'FORK_TEST_READINESS_INVENTORY',inventory,baseRpcConfigured:rpcConfigured,executorKind:'CROSS_VENUE_FORK_PROTOTYPE_FAIL_CLOSED_NOT_ATOMIC_EXECUTOR',crossVenueFlashLoanExecutorReady:false,atomicCrossVenueForkTestPassed:false,actualArbitrageGasUnits:null,actualArbitrageL1FeeWei:null,gasAndNetProfitVerified:false,blockers:[...(allFilesPresent?[]:['REQUIRED_REPOSITORY_FILES_MISSING']),...(rpcConfigured?[]:['BASE_RPC_URL_NOT_CONFIGURED']),'PROTOTYPE_REVERTS_EXECUTION_ATOMIC_SWAP_CALLBACK_AND_FORK_TEST_NOT_IMPLEMENTED','MISSING_EXECUTOR_TRANSACTION_CALldata_FOR_GAS_MEASUREMENT'],alerts:[],qualified:0,safety});
 });
}
module.exports={mount};
