'use strict';
const assert=require('node:assert/strict');
const {compileTwice,report}=require('./reproducible-v26-v43');
(async()=>{
 const c=compileTwice();
 assert.equal(c.reproducible,true);
 assert.ok(c.solcVersion.startsWith('0.8.24+'));
 assert.ok(c.creationCodeBytes>1000);
 assert.ok(c.sourceHash.startsWith('0x'));
 assert.ok(c.creationCodeHash.startsWith('0x'));
 const absent=await report();
 assert.equal(absent.status,'COMPILED_NOT_DEPLOYED');
 assert.equal(absent.estimatedGasUnits,null);
 assert.equal(absent.transactionSigned,false);
 assert.equal(absent.mainnetBroadcast,false);
 assert.equal(absent.bundlesSubmitted,0);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V43',unitAssertionsPassed:10,reproducibleCompiler:c.solcVersion,
 creationCodeHash:c.creationCodeHash,transactionSigned:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
