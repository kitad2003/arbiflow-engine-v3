'use strict';
// 12.9.4 fork preflight inventory only. Does not run Hardhat or produce fake gas numbers.
const safety=Object.freeze({readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false});
function mount(app){
 app.get('/api/phase12/fork/status',(_req,res)=>{
  const fs=require('node:fs');const path=require('node:path');
  const files=['hardhat.config.js','ControlledAtomicForkTest4300.js','ProductionBoundForkTest4380.js','ArbiFlowExecutor414.sol','phase127-routes.js'];
  const inventory=files.map(name=>({file:name,present:fs.existsSync(path.join(__dirname,name))}));
  const rpcConfigured=!!(process.env.BASE_RPC_URL||'').trim();
  const allFilesPresent=inventory.every(x=>x.present);
  res.json({success:true,build:'12.9.4',mode:'FORK_TEST_READINESS_INVENTORY',inventory,baseRpcConfigured:rpcConfigured,executorKind:'EXISTING_LEGACY_LIQUIDATION_HARNESSES_NOT_USDC_WETH_CROSS_VENUE_ARBITRAGE',crossVenueFlashLoanExecutorReady:false,atomicCrossVenueForkTestPassed:false,actualArbitrageGasUnits:null,actualArbitrageL1FeeWei:null,gasAndNetProfitVerified:false,blockers:[...(allFilesPresent?[]:['REQUIRED_REPOSITORY_FILES_MISSING']),...(rpcConfigured?[]:['BASE_RPC_URL_NOT_CONFIGURED']),'MISSING_CROSS_VENUE_AAVE_FLASHLOAN_EXECUTOR_AND_FORK_TEST','MISSING_EXECUTOR_TRANSACTION_CALldata_FOR_GAS_MEASUREMENT'],alerts:[],qualified:0,safety});
 });
}
module.exports={mount};
