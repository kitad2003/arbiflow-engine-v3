'use strict';
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {prepare,simulate,METHOD}=require('./mev-simulation-v19');
const contract='0x'+'3'.repeat(40),target='0x'+'a'.repeat(64);
const iface=new ethers.Interface(['function makeFlashLoan(address firstPair,address secondPair,uint256 amount,uint256 minProfit)']);
const wallet=new ethers.Wallet('0x'+'1'.repeat(64));
(async()=>{
 const tx=await wallet.signTransaction({chainId:1,nonce:0,to:contract,gasLimit:350000,gasPrice:1000000000n,
  data:iface.encodeFunctionData('makeFlashLoan',['0x'+'4'.repeat(40),'0x'+'5'.repeat(40),100n,1n])});
 const args={targetHash:target,backrunContract:contract,backrunSignedTx:tx,blockNumber:500};
 assert.equal(prepare().reason,'TARGET_TRANSACTION_HASH_REQUIRED');
 assert.equal(prepare({...args,targetKind:'BUNDLE'}).reason,'BUNDLE_EVENT_HASH_NOT_TRANSACTION_HASH');
 assert.equal(prepare({...args,backrunSignedTx:''}).reason,'SIGNED_BACKRUN_TRANSACTION_REQUIRED');
 assert.equal(prepare({...args,backrunContract:'0x0'}).ready,false);
 const good=prepare(args);
 assert.equal(good.ready,true);
 assert.equal(good.request.method,METHOD);
 assert.equal(good.request.params[0].body[0].hash,target);
 assert.equal(good.request.params[0].body[1].canRevert,false);
 const blocked=await simulate(args);
 assert.equal(blocked.simulationAttempted,false);
 let calls=0;
 const mocked=await simulate(args,{allowRequest:true,fetchImpl:async(url,req)=>{
  calls++;assert.equal(req.method,'POST');assert.equal(JSON.parse(req.body).method,METHOD);
  return {ok:true,json:async()=>({result:{success:true,profit:'0x20',gasUsed:'0x30'}})};
 }});
 assert.equal(calls,1);
 assert.equal(mocked.simulationSucceeded,true);
 assert.equal(mocked.profitVerified,false);
 assert.equal(mocked.bundlesSubmitted,0);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V19',unitAssertionsPassed:14,
  mockedProtocolSimulation:true,liveSimulationConfirmed:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
