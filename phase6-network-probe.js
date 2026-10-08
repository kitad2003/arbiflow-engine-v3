"use strict";
// Isolated Phase 6 manual probes. Never log RPC URLs or perform transaction methods.
const CONFIG=Object.freeze({
 ronin:{vm:'evm',env:'RONIN_RPC_URL',expected:'0x7e4'},
 monad:{vm:'evm',env:'MONAD_RPC_URL',expected:null},
 solana:{vm:'solana',env:'SOLANA_RPC_URL',expected:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'},
 sui:{vm:'sui',env:'SUI_RPC_URL',expected:null}
});
const expectedFor=(key)=>key==='monad' ? (process.env.MONAD_CHAIN_ID||null) : key==='solana' ? (process.env.SOLANA_GENESIS_HASH||CONFIG.solana.expected) : key==='sui' ? (process.env.SUI_CHAIN_IDENTIFIER||null) : CONFIG[key].expected;
function phase6Config(){return Object.entries(CONFIG).map(([key,c])=>({key,vm:c.vm,environmentVariable:c.env,configured:Boolean(process.env[c.env]),expectedIdentifierConfigured:Boolean(expectedFor(key))}));}
async function request(url,method,params=[]){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:' && !(process.env.NODE_ENV==='test' && parsed.hostname==='localhost')) throw Error('HTTPS_REQUIRED');
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),8500);
 try{
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:ctl.signal});
  if(!response.ok)throw Error('HTTP_'+response.status);
  const data=await response.json();
  if(data.error || data.result===undefined || data.result===null)throw Error('RPC_RESPONSE_INVALID');
  return data.result;
 }finally{clearTimeout(timer);}
}
async function phase6Probe(key){
 const c=CONFIG[key];if(!c)return {key,status:'UNKNOWN_CHAIN'};
 const url=process.env[c.env];if(!url)return {key,configured:false,reachable:false,status:'NOT_CONFIGURED'};
 const method=c.vm==='evm'?'eth_chainId':c.vm==='solana'?'getGenesisHash':'sui_getChainIdentifier';
 try{
  const reported=String(await request(url,method));
  const expected=expectedFor(key);
  let match=false;
  if(expected){
   if(c.vm==='evm'){
    const reportedNum=Number(reported);const expectedNum=Number(expected);
    match=Number.isSafeInteger(reportedNum)&&Number.isSafeInteger(expectedNum)&&reportedNum===expectedNum;
   }else match=reported===String(expected);
  }
  return {key,configured:true,reachable:true,reportedIdentifier:reported,expectedIdentifier:expected,identifierMatches:expected?match:null,status:!expected?'REACHABLE_UNVERIFIED':match?'VERIFIED':'IDENTIFIER_MISMATCH'};
 }catch(e){return {key,configured:true,reachable:false,status:'PROBE_FAILED',error:String(e.message||e).slice(0,70)};}
}
module.exports={phase6Config,phase6Probe};
