"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');
const registry=require('./registry');
const {probeEvmChain,rpcEnvironmentNames}=require('./manual-rpc-probe');
const server=fs.readFileSync('./server.js','utf8');
assert.equal(registry.chains.length,25);assert.equal(registry.exchanges.length,25);
for(const phase of [3,4,5])assert.ok(server.includes('/api/expansion-25x25/phase'+phase+'-probe'));
for(const key of ['cronos','hyperevm','berachain','sei','abstract']){
 const chain=registry.chains.find(c=>c.key===key);assert.ok(chain&&Number.isInteger(chain.chainId));
 assert.equal(rpcEnvironmentNames(key)[0],key.toUpperCase()+'_RPC_URL');
}
assert.ok(server.includes('automaticScanning:false,mainnetBroadcast:false'));
(async()=>{const blocked=await probeEvmChain({url:'http://127.0.0.1:3000',expectedChainId:1});assert.equal(blocked.status,'INVALID_RPC_URL');console.log('PASS Phase 5: 25 chains, 25 exchanges, 3/4/5 routes, chain metadata, HTTPS restriction');})().catch(e=>{console.error(e);process.exitCode=1});
