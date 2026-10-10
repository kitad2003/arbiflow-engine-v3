'use strict';
const assert=require('node:assert/strict');
const {diagnose,run}=require('./event-disclosure-v31');
const {SWAP_TOPIC}=require('./bot');
(async()=>{
 const dh='0x'+'a'.repeat(64),real='0x'+'b'.repeat(64),multi='0x'+'c'.repeat(64),pool='0x'+'d'.repeat(40);
 const events=[
  {hash:dh,txs:[{hash:real,functionSelector:'0x12345678',callData:'0x12345678'}],
   logs:[{address:pool,topics:[SWAP_TOPIC]}]},
  {hash:dh,txs:[{hash:real}],logs:[]},
  {hash:multi,txs:[{},{}],logs:[]},
  {hash:'0x'+'e'.repeat(64),txs:[{to:pool}],logs:[]}
 ];
 const x=diagnose(events);
 assert.equal(x.eventsReceived,4);
 assert.equal(x.uniqueEvents,3);
 assert.equal(x.duplicates,1);
 assert.equal(x.eventsWithOneTxEntry,2);
 assert.equal(x.eventsWithMultipleTxEntries,1);
 assert.equal(x.underlyingTxHashesDisclosed,1);
 assert.equal(x.calldataEntriesDisclosed,1);
 assert.equal(x.uniswapV2SwapLogs,1);
 assert.equal(x.samples[0].rawTargetHash,real);
 assert.notEqual(x.samples[0].eventHash,x.samples[0].rawTargetHash);
 assert.equal(x.samples[2].rawTargetHash,null);
 const output=await run({listenImpl:async()=>({connected:true,malformed:0,events})});
 assert.equal(output.connected,true);
 assert.equal(output.targetSelectionPerformed,false);
 assert.equal(output.mainnetBroadcast,false);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V31',unitAssertionsPassed:14,
  doubleHashDistinctionTested:true,mockedEvents:true,simulationAttempted:false,mainnetBroadcast:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
