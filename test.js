"use strict";
const assert=require('node:assert/strict');
const registry=require('./registry');
const {probeEvmChain,rpcEnvironmentNames}=require('./manual-rpc-probe');
assert.equal(registry.chains.length,25);
assert.equal(registry.exchanges.length,25);
assert.equal(new Set(registry.chains.map(x=>x.key)).size,25);
assert.equal(new Set(registry.exchanges.map(x=>x.key)).size,25);
assert.equal(rpcEnvironmentNames('base')[0],'BASE_RPC_URL');
assert.equal(rpcEnvironmentNames('bnb')[0],'BNB_RPC_URL');
(async()=>{
  const blocked=await probeEvmChain({url:'http://127.0.0.1:3000',expectedChainId:1});
  assert.equal(blocked.reachable,false);
  assert.equal(blocked.status,'INVALID_RPC_URL');
  assert.equal(registry.safety.mainnetBroadcast,false);
  console.log('PASS: 25 chains, 25 exchanges, manual RPC probe, safe defaults');
})().catch(e=>{console.error(e);process.exitCode=1});
