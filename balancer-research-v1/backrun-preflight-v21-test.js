'use strict';
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {preflight}=require('./backrun-preflight-v21');
(async()=>{
 const mocked={getNetwork:async()=>({chainId:1n}),getBlock:async()=>({number:100,hash:'0x'+'a'.repeat(64)}),
  getCode:async()=> '0x'};
 const address='0x'+'1'.repeat(40);
 assert.equal((await preflight({})).reason,'ETHEREUM_RPC_REQUIRED');
 assert.equal((await preflight({provider:{getNetwork:async()=>({chainId:8453n})}})).reason,'ETHEREUM_MAINNET_REQUIRED');
 assert.equal((await preflight({provider:mocked})).reason,'DEPLOYED_BALANCER_CONTRACT_ADDRESS_REQUIRED');
 assert.equal((await preflight({provider:mocked,contractAddress:address})).reason,'BALANCER_CONTRACT_CODE_ABSENT');
 assert.equal((await preflight({provider:{...mocked,getCode:async()=> '0x6000'},contractAddress:address})).reason,'BALANCER_CONTRACT_INTERFACE_NOT_VERIFIED');
 assert.equal(ethers.isAddress(address),true);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V21',unitAssertionsPassed:6,
  mockedEthereumReads:true,liveDeploymentVerified:false,simulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
