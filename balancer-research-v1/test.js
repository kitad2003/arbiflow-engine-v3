'use strict';
const assert=require('node:assert/strict');
const {SWAP_TOPIC,verifiedPairIndex,screenEvent}=require('./bot');
const addr=x=>'0x'+x.toString(16).padStart(40,'0');
const entries=[
 {pool:addr(1),token0:addr(21),token1:addr(22),factory:addr(31),venue:'ExchangeOne',verified:true},
 {pool:addr(2),token0:addr(22),token1:addr(21),factory:addr(32),venue:'ExchangeTwo',verified:true},
 {pool:addr(3),token0:addr(21),token1:addr(22),factory:addr(31),venue:'ExchangeOne',verified:true},
 {pool:addr(4),token0:addr(21),token1:addr(22),factory:addr(33),venue:'Unverified',verified:false}
];
const index=verifiedPairIndex(entries);
assert.equal(index.size,3);
const result=screenEvent({hash:'0xabc',logs:[{address:addr(1),topics:[SWAP_TOPIC]}],txs:null},index);
assert.equal(result.candidates.length,1);
assert.equal(result.candidates[0].alternatives.length,1);
assert.equal(result.candidates[0].alternatives[0].venue,'ExchangeTwo');
assert.equal(result.executionEligible,false);
assert.equal(result.bundleSubmissionEnabled,false);
assert.equal(screenEvent({logs:[{address:addr(1),topics:['0x'+ '0'.repeat(64)]}]},index).candidates.length,0);
assert.equal(screenEvent({logs:[{address:addr(4),topics:[SWAP_TOPIC]}]},index).candidates.length,0);
assert.equal(screenEvent({logs:[{address:addr(10),topics:[SWAP_TOPIC]}]},index).candidates.length,0);
console.log(JSON.stringify({build:'BALANCER_RESEARCH_V1',unitAssertionsPassed:9,mainnetBroadcast:false}));
