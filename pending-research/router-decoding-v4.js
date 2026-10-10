'use strict';
// Deterministic V4 ABI decoder tests; no live RPC or signing.
const {decode,V2}=require('./swap-decoder-v4');
const path=['0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002'];
const input=V2.encodeFunctionData('swapExactETHForTokens',[100n,path,path[1],999999n]);
const result=decode('ethereum',{to:'0x7a250d5630b4cf539739df2c5dacb4c659f2488d',input,value:'1000000000000000000'});
console.log(JSON.stringify({build:'ARBIFLOW_ROUTER_DECODING_V4',testMode:'DETERMINISTIC_FIXTURE_NOT_LIVE_TRANSACTION',result,readOnly:true,mainnetBroadcast:false,profitVerified:0},null,2));
