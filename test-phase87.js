'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeGecko,normalizeDex,merge,mount}=require('./phase87-indexed-discovery');
const fixtures=process.env.ARBIFLOW87_FIXTURES;
if(fixtures){const paths=JSON.parse(fixtures);const gecko=paths.slice(0,3).flatMap((p,i)=>normalizeGecko(JSON.parse(fs.readFileSync(p,'utf8').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')),`gecko-${i}`));const dex=normalizeDex(JSON.parse(fs.readFileSync(paths[3],'utf8').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')),'dex');const merged=merge([...gecko,...dex]);assert(merged.length>0);assert(merged.length<=(gecko.length+dex.length));assert(merged.every(x=>x.chainId===8453&&x.executionEligible===false&&!x.identityVerified));console.log(JSON.stringify({raw:gecko.length+dex.length,unique:merged.length,sourceCounts:{gecko:gecko.length,dex:dex.length}}));}
const endpoints=new Map();const app={get:(p,handler)=>endpoints.set(p,handler)};const mounted=mount(app);assert.equal(endpoints.size,5);assert.equal(mounted.state.running,false);for(const p of ['/api/liquidity87/status','/api/liquidity87/sources','/api/liquidity87/pools','/api/liquidity87/tokens','/api/liquidity87/run'])assert(endpoints.has(p));
console.log('Phase 8.7 tests passed');
