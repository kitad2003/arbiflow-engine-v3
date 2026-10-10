'use strict';
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {SWAP_TOPIC}=require('./bot');
const {inspect,run,ORIGIN,ALTERNATE}=require('./live-v26-gate-v29');
const {IFACE}=require('./mev-envelope-v28');
(async()=>{
 const hash='0x'+'a'.repeat(64),bundleHash='0x'+'b'.repeat(64);
 const logs=[{address:ORIGIN,topics:[SWAP_TOPIC]}];
 const events=[{hash,txs:null,logs},{hash,txs:null,logs},{hash:bundleHash,txs:[{hash}],logs}];
 const wallet=new ethers.Wallet('0x'+'1'.repeat(64));
 const contract='0x'+'3'.repeat(40);
 const raw=await wallet.signTransaction({chainId:1,nonce:0,to:contract,
  gasLimit:400000,gasPrice:1000000000n,
  data:IFACE.encodeFunctionData('makeFlashLoan',[ORIGIN,ALTERNATE,100n,1n,1n,1n])});
 const input={operatorAddress:wallet.address,backrunContract:contract,
  backrunSignedTx:raw,inclusionBlock:123};
 const x=inspect(events,input);
 assert.equal(x.selectedTargetHash,hash);
 assert.equal(x.validationStatus,'STRUCTURE_VALID_NOT_SIMULATED');
 assert.equal(x.backrunSignedTxValidated,true);
 assert.equal(x.bundlesExcluded,1);
 assert.equal(x.duplicates,1);
 assert.equal(x.simulationAttempted,false);
 assert.equal(x.mainnetBroadcast,false);
 assert.equal(x.fullyMatchedSimulationInputVerified,false);
 assert.equal(inspect(events).validationReason,'DEPLOYED_V26_CONTRACT_REQUIRED');
 assert.equal(inspect([{hash:bundleHash,txs:[{hash}],logs}],input).selectedTargetHash,null);
 assert.equal(inspect([{hash,txs:null,logs:[{address:ALTERNATE,topics:[SWAP_TOPIC]}]}],input).selectedTargetHash,null);
 const mocked=await run({listenImpl:async()=>({connected:true,malformed:0,events}),...input});
 assert.equal(mocked.connected,true);
 assert.equal(mocked.validationStatus,'STRUCTURE_VALID_NOT_SIMULATED');
 assert.equal(mocked.executionEligible,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V29',unitAssertionsPassed:13,
  mockedEventSelection:true,signedTxFormatValidated:true,
  realSimulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
