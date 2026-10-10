'use strict';
const assert=require('node:assert/strict');
const {quote,roundTrip,PAIRS}=require('./reserve-quotes-v33');
assert.equal(quote(0n,100n,100n),0n);
assert.equal(quote(100n,0n,100n),0n);
assert.equal(quote(100n,100n,0n),0n);
assert.equal(quote(100n,1000n,1000n),90n);
assert.equal(quote(1000n,1000n,1000n),499n);
assert.equal(quote(100n,1000n,2000n),181n);
const p={weth:1000n,other:2000n};
const r=roundTrip(100n,p,{weth:1000n,other:2000n});
assert.equal(r.borrowedWei,'100');
assert.equal(r.intermediateRaw,'181');
assert.equal(BigInt(r.returnedWei)<100n,true);
assert.equal(r.grossPositive,false);
assert.equal(PAIRS.length,2);
assert.equal(PAIRS.every(x=>x.origin!==x.alternate),true);
console.log(JSON.stringify({build:'BALANCER_RESEARCH_V33',unitAssertionsPassed:12,
 staticMathTests:true,onChainReservesNotMockedAsProfit:true,mainnetBroadcast:false}));
