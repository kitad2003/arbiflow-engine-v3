'use strict';
const assert=require('node:assert/strict');
const {SWAP_TOPIC}=require('./bot');
const {logsFrom,inspect,analyze}=require('./mevshare-v10');
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),factory='0x'+'f'.repeat(40);
const token0='0x'+'1'.repeat(40),token1='0x'+'2'.repeat(40),hash='0x'+'c'.repeat(64);
const log=addr=>({address:addr,topics:[SWAP_TOPIC]});
const pairs=[{pool:a,token0,token1,factory,venue:'DEX_A',verified:true},
 {pool:b,token0:token1,token1:token0,factory:'0x'+'e'.repeat(40),venue:'DEX_B',verified:true}];
const transaction={hash,txs:null,logs:[log(a)]};
const bundle={hash:'0x'+'d'.repeat(64),txs:[{logs:[log(a)]}],logs:[]};
assert.equal(inspect(transaction).kind,'TRANSACTION');
assert.equal(inspect(bundle).kind,'BUNDLE');
assert.equal(inspect(bundle).swapHints,1);
assert.equal(logsFrom(bundle).hints[0].source,'BUNDLE_TX_HINT');
assert.equal(inspect(bundle,new Map()).candidateCount,0);
const x=analyze([transaction,transaction,bundle,bundle],pairs);
assert.equal(x.duplicates,2);
assert.equal(x.transactions,1);
assert.equal(x.bundles,1);
assert.equal(x.verifiedVenueCandidates,2);
assert.equal(x.swapsInBundleTxHints,1);
assert.equal(x.executionEligible,false);
assert.equal(inspect({hash:'broken',txs:[]}).accepted,false);
console.log(JSON.stringify({build:'BALANCER_RESEARCH_V10',unitAssertionsPassed:11,
 liveStreamConnected:false,executionEligible:false,mainnetBroadcast:false}));
