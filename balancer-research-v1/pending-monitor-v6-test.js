'use strict';
const assert=require('node:assert/strict');
const {SWAP_TOPIC}=require('./bot');
const {validateHint,examineHint,evaluateBatch}=require('./pending-monitor-v6');
const addr=i=>'0x'+i.toString(16).padStart(40,'0');
const hash='0x'+'a'.repeat(64);
const entries=[
 {pool:addr(1),token0:addr(10),token1:addr(11),factory:addr(20),venue:'DEX_A',verified:true},
 {pool:addr(2),token0:addr(11),token1:addr(10),factory:addr(21),venue:'DEX_B',verified:true},
 {pool:addr(3),token0:addr(10),token1:addr(11),factory:addr(22),venue:'DEX_C',verified:false}
];
const event={hash,logs:[{address:addr(1),topics:[SWAP_TOPIC]}]};
assert.equal(validateHint(event).valid,true);
assert.equal(validateHint({hash}).reason,'LOG_HINTS_NOT_AVAILABLE');
assert.equal(validateHint({...event,logs:[{address:'wrong',topics:[SWAP_TOPIC]}]}).valid,false);
const result=evaluateBatch([event,event],entries);
assert.equal(result.processed,1);
assert.equal(result.candidates.length,1);
assert.equal(result.candidates[0].alternatives.length,1);
assert.equal(result.candidates[0].alternatives[0].venue,'DEX_B');
assert.equal(result.livePendingFeedVerified,false);
assert.equal(result.executionEligible,false);
assert.equal(result.mainnetBroadcast,false);
assert.equal(examineHint({...event,logs:[{address:addr(3),topics:[SWAP_TOPIC]}]},new Map()).candidates.length,0);
assert.equal(evaluateBatch([{hash,logs:[]}],entries).candidates.length,0);
console.log(JSON.stringify({build:'BALANCER_RESEARCH_V6',unitAssertionsPassed:11,
 mode:'OFFLINE_EVENT_HINT_VALIDATION',liveFeedConnected:false,executionEligible:false}));
