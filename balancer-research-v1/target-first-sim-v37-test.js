'use strict';
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {IFACE}=require('./mev-envelope-v28');
const {build,simulate}=require('./target-first-sim-v37');
(async()=>{
 const operator=new ethers.Wallet('0x'+'1'.repeat(64));
 const target=new ethers.Wallet('0x'+'2'.repeat(64));
 const contract='0x'+'3'.repeat(40),first='0x'+'4'.repeat(40),second='0x'+'5'.repeat(40);
 const signedTarget=await target.signTransaction({chainId:1,nonce:0,to:first,gasLimit:21000,gasPrice:1000000000n});
 const signedBackrun=await operator.signTransaction({chainId:1,nonce:0,to:contract,gasLimit:300000,
  gasPrice:1000000000n,data:IFACE.encodeFunctionData('makeFlashLoan',[first,second,100n,1n,1n,1n])});
 const input={targetHash:ethers.Transaction.from(signedTarget).hash,targetSignedTx:signedTarget,
  backrunContract:contract,backrunSignedTx:signedBackrun,operatorAddress:operator.address,
  verifiedFirstPool:first,verifiedSecondPool:second,inclusionBlock:123};
 const p=build(input);
 assert.equal(p.ready,true);
 assert.equal(p.request.method,'mev_simBundle');
 assert.equal(p.request.params[0].body.length,2);
 assert.equal(p.request.params[0].body[0].tx,signedTarget);
 assert.equal(p.request.params[0].body[1].tx,signedBackrun);
 assert.equal(p.targetFirst,true);
 assert.equal(p.fullyMatchedBodies,true);
 assert.equal(build({...input,targetSignedTx:null}).reason,'TARGET_SIGNED_TRANSACTION_REQUIRED');
 assert.equal(build({...input,targetHash:'0x'+'a'.repeat(64)}).reason,'TARGET_SIGNED_BYTES_HASH_MISMATCH');
 const offline=await simulate(input);
 assert.equal(offline.simulationAttempted,false);
 assert.equal(offline.bundlesSubmitted,0);
 assert.equal(offline.mainnetBroadcast,false);
 let calls=0;
 const mocked=await simulate(input,{allowSimulation:true,fetchImpl:async(url,req)=>{
  calls++;assert.equal(url,'https://relay.flashbots.net');
  assert.equal(JSON.parse(req.body).method,'mev_simBundle');
  return {json:async()=>({result:{success:true,gasUsed:100000}})};
 }});
 assert.equal(calls,1);
 assert.equal(mocked.simulationAttempted,true);
 assert.equal(mocked.mainnetBroadcast,false);
 assert.equal(mocked.profitVerified,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V37',unitAssertionsPassed:16,
  signedTargetValidation:true,mockedMevSimBundle:true,realSimulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});