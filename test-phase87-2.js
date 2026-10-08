'use strict';
const assert=require('node:assert/strict');
const {mount}=require('./phase87-indexed-discovery');
const routes={};const app={get:(p,fn)=>routes[p]=fn};
let gecko=0,dex=0;
const fetchFn=async url=>{
 if(url.includes('geckoterminal')){gecko++;return {status:429,ok:false,headers:{get:()=> '1'}};}
 dex++;return {status:429,ok:false,headers:{get:()=> '1'}};
};
mount(app,{fetchFn});
const get=p=>new Promise(resolve=>routes[p]({query:{}},{json:resolve,status:code=>({json:data=>resolve({...data,httpStatus:code})})}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await get('/api/liquidity87/run');let s;
 for(let i=0;i<100;i++){s=await get('/api/liquidity87/status');if(!s.running)break;await sleep(10)}
 assert.equal(s.running,false);assert.equal(s.runs,1);assert.equal(gecko,1);assert.equal(dex,1);
 assert.ok(Date.parse(s.geckoCooldownUntil)-Date.now()>55000);
 assert.ok(Date.parse(s.dexCooldownUntil)-Date.now()>55000);
 const blocked=await get('/api/liquidity87/run');assert.equal(blocked.error,'SCAN_COOLDOWN');assert.equal(blocked.httpStatus,429);
 assert.equal(s.uniquePoolsInMemory,0);assert.equal(s.safety.mainnetBroadcast,false);
 console.log('PASS: independent provider cooldowns >=60 seconds, scan cooldown, no extra API calls, execution disabled');
})().catch(e=>{console.error(e);process.exitCode=1});
