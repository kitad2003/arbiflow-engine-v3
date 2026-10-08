'use strict';
const assert=require('node:assert/strict');const {probe,VENUES}=require('./phase7-cex');
(async()=>{
 assert.equal(Object.keys(VENUES).length,5);
 const fixtures={binance:{bidPrice:'10',askPrice:'11'},coinbase:{bid:'10',ask:'11'},kraken:{error:[],result:{XXBTZUSD:{b:['10'],a:['11']}}},okx:{data:[{bidPx:'10',askPx:'11'}]},bybit:{result:{list:[{bid1Price:'10',ask1Price:'11'}]}}};
 for(const venue of Object.keys(VENUES)){
  const r=await probe(venue,async()=>({ok:true,json:async()=>fixtures[venue]}));assert.equal(r.success,true,venue);assert.equal(r.readOnly,true);assert.equal(r.executable,false);
 }
 const limited=await probe('binance',async()=>({ok:false,status:429}));assert.equal(limited.error,'RATE_LIMITED');
 console.log('PASS: 5 mocked quote parsers, read-only flags, and 429 handling');
})().catch(e=>{console.error(e);process.exitCode=1});
