'use strict';
// Read-only integration test for real discovered Base liquidity pools.
// No transaction construction, signing, broadcasting, or trade execution.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {discover}=require('./PoolUniverse12939');
const {enumerate}=require('./CryptoArbitrageRoutes12959');
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 const d=await discover(rpc);
 assert(d.success,'DISCOVERY_FAILED');
 const g=enumerate(d.pools,{anchors:['USDC','WETH','USDT','DAI','cbBTC'],maxRoutes:50000});
 const selected=Object.fromEntries(['crossDex','sameDex','triangular'].map(type=>[type,g.routes.filter(r=>r.type===type).slice(0,5).map(r=>({path:r.tokenPath,venues:r.legs.map(x=>x.dex),pools:r.legs.map(x=>x.pool)}))]));
 const result={build:'12.9.60',mode:'LIVE_POOL_ROUTE_GRAPH_DIAGNOSTIC',block:d.confirmedBlock,discoveredPools:d.uniqueActivePools,generatedRoutes:g.generated,storedRoutes:g.routes.length,truncated:g.truncated,counts:g.counts,samples:selected,readOnly:true,quotesExecuted:false,executionEligible:false,mainnetBroadcast:false};
 fs.writeFileSync('arbiflow-crypto-live-graph.json',JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('GRAPH_FAILED',String(e?.message||e).slice(0,140));process.exitCode=1});
}
module.exports={run};
