'use strict';
const assert=require('node:assert/strict');
const {mount}=require('./phase87-indexed-discovery');
const routes={};const app={get:(path,fn)=>{routes[path]=fn}};
let geckoCalls=0,dexCalls=0;
const fetchFn=async url=>{
 if(url.includes('geckoterminal')){geckoCalls++;return {status:429,ok:false,headers:{get:()=> '120'}};}
 dexCalls++;return {status:200,ok:true,text:async()=>JSON.stringify([{chainId:'base',dexId:'uniswap',pairAddress:'0x'+'1'.repeat(40),baseToken:{address:'0x'+'2'.repeat(40),symbol:'A'},quoteToken:{address:'0x'+'3'.repeat(40),symbol:'B'},liquidity:{usd:500}}])};
};
mount(app,{fetchFn});
const get=path=>new Promise(resolve=>routes[path]({query:{}},{json:resolve,status:()=>({json:resolve})}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function runOnce(){await get('/api/liquidity87/run');for(let i=0;i<100;i++){const s=await get('/api/liquidity87/status');if(!s.running)return s;await sleep(10);}throw Error('timeout');}
(async()=>{let s=await runOnce();assert.equal(s.lastResult.scanStatus,'INCOMPLETE');assert.equal(s.uniquePoolsInMemory,1);assert.equal(geckoCalls,1);assert.equal(dexCalls,1);assert.ok(s.geckoCooldownUntil);assert.equal(s.lastResult.sourcesFailed.length,3);s=await runOnce();assert.equal(geckoCalls,1);assert.equal(dexCalls,2);assert.equal(s.uniquePoolsInMemory,1);assert.equal(s.safety.mainnetBroadcast,false);console.log('Rate-limit tests passed: one 429, cooldown skips remaining Gecko calls, DEX results preserved, repeat scan respects cooldown, safety intact');})().catch(e=>{console.error(e);process.exitCode=1});
