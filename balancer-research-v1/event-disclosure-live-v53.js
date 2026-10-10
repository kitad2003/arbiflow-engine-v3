'use strict';
const {ethers}=require('ethers');
const {run:monitor}=require('./persistent-monitor-v34');
const {VerifiedPoolCache}=require('./dynamic-pair-cache-v51');
const {createDiagnostics}=require('./event-disclosure-v53');
async function run({provider,runtimeMs=60000}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const cache=new VerifiedPoolCache();
 const d=createDiagnostics({resolvePool:pool=>cache.resolve(provider,pool)});
 const monitorStats=await monitor({runtimeMs,onEvent:d.observe});
 return {...d.snapshot(),monitor:monitorStats,limitations:['BUNDLE_HINTS_ARE_NOT_EXECUTABLE_TARGETS','MEV_SHARE_DISCLOSURES_ARE_PARTIAL','V2_VENUES_ONLY','NO_PROFIT_OR_TARGET_FIRST_SIMULATION']};
}
module.exports={run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider,runtimeMs:60000}).then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V53_FAILED',String(e.message).slice(0,180));process.exitCode=1})
 .finally(()=>provider.destroy());
}
