"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {phase6Config,phase6Probe}=require('./phase6-network-probe');
(async()=>{
 const targets=phase6Config();assert.equal(targets.length,4);
 assert.deepEqual(targets.map(t=>t.key),['ronin','monad','solana','sui']);
 for(const target of targets){delete process.env[target.environmentVariable];assert.equal((await phase6Probe(target.key)).status,'NOT_CONFIGURED');}
 const server=fs.readFileSync('server.js','utf8');
 for(const endpoint of ['phase3-probe','phase4-probe','phase5-probe','phase6-probe'])assert(server.includes(endpoint));
 assert(server.includes('phase6Busy=true'));
 console.log('PASS Phase 6 registry, unconfigured safeguards, and retained Phase 3–5 routes');
})().catch(e=>{console.error(e);process.exitCode=1});
