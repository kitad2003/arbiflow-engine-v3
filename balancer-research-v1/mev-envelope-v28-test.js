'use strict';
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {prepare,report,IFACE}=require('./mev-envelope-v28');
(async()=>{
 const wallet=new ethers.Wallet('0x'+'1'.repeat(64));
 const first='0x'+'4'.repeat(40),second='0x'+'5'.repeat(40),contract='0x'+'3'.repeat(40),target='0x'+'a'.repeat(64);
 const tx=await wallet.signTransaction({chainId:1,nonce:0,to:contract,gasLimit:400000,gasPrice:1000000000n,
  data:IFACE.encodeFunctionData('makeFlashLoan',[first,second,100n,1n,1n,1n])});
 const base={targetHash:target,backrunContract:contract,backrunSignedTx:tx,
  inclusionBlock:500,operatorAddress:wallet.address,verifiedFirstPool:first,verifiedSecondPool:second};
 const p=prepare(base);
 assert.equal(p.ready,true);
 assert.equal(p.request.method,'mev_simBundle');
 assert.equal(p.request.params.length,1);
 assert.equal(p.request.params[0].version,'beta-1');
 assert.equal(p.request.params[0].body[0].hash,target);
 assert.equal(p.request.params[0].body[1].canRevert,false);
 assert.equal(prepare({...base,targetKind:'BUNDLE'}).ready,false);
 assert.equal(prepare({...base,operatorAddress:second}).reason,'WRONG_OPERATOR_SIGNER');
 assert.equal(prepare({...base,verifiedFirstPool:second}).reason,'BACKRUN_POOL_INPUT_MISMATCH');
 assert.equal(prepare({...base,backrunSignedTx:''}).reason,'SIGNED_BACKRUN_TX_REQUIRED');
 const legacyIface=new ethers.Interface(['function makeFlashLoan(address,address,uint256,uint256)']);
 const legacy=await wallet.signTransaction({chainId:1,nonce:1,to:contract,gasLimit:400000,gasPrice:1000000000n,
  data:legacyIface.encodeFunctionData('makeFlashLoan',[first,second,100n,1n])});
 assert.equal(prepare({...base,backrunSignedTx:legacy}).reason,'V26_SIX_ARGUMENT_CALL_REQUIRED');
 assert.equal(report(base).simulated,false);
 assert.equal(report(base).mainnetBroadcast,false);
 assert.equal(report(base).unmatchedTargetSimulationMayBeRejected,true);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V28',unitAssertionsPassed:14,
  sixArgumentCompatibilityValidated:true,realSimulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
