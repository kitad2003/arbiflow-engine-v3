'use strict';
const assert=require('node:assert/strict');
const {group,run}=require('./solana-movers-v3');
const M='SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb',U='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const a='FjuBy7jjf9DXj9d3R7cHpvcnoFW2iQxf7F7P3vqx4Jza',b='4XhCWxdmoRrUX4Kde4RQ2bmWWgNLur5DQJn9Jzt8pN3e';
const pool=(address,dex,tvl)=>({attributes:{address,name:'SPCX / USDC',reserve_in_usd:String(tvl),price_change_percentage:{m5:'3',h1:'4'}},relationships:{base_token:{data:{id:'solana_'+M}},quote_token:{data:{id:'solana_'+U}},dex:{data:{id:dex}}}});
assert.equal(group([pool(a,'raydium-clmm',30000),pool(b,'orca',25000)]).crossDexPairs,1);
assert.equal(group([pool(a,'raydium-clmm',30000),pool(b,'orca',19000)]).crossDexPairs,0);
(async()=>{const paths=[];const out=await run({delayMs:0,maxTokens:1,periods:['5m'],fetchImpl:async url=>{paths.push(url);return {ok:true,json:async()=>({data:url.includes('/tokens/')?[pool(b,'orca',25000)]:[pool(a,'raydium-clmm',30000)]})}}});assert.equal(out.crossDexPairs,1);assert.equal(out.tokenLookupCount,1);assert.equal(out.verifiedSafePools,0);assert.equal(out.mainnetBroadcast,false);assert(paths.some(x=>x.includes('/tokens/'+M+'/pools')));console.log(JSON.stringify({build:out.build,tests:'PASS'}))})().catch(e=>{console.error(e);process.exitCode=1});
