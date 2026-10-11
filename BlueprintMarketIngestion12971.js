'use strict';
// ArbiFlow blueprint phase 1: truthful multi-source market ingestion.
// No synthetic quotes, no token whitelist, no trade execution.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const SOURCE_TYPES=new Set(['DEX_POOL','DEX_AGGREGATOR','CEX_ORDERBOOK']);
function normalize(raw){
 assert(raw&&typeof raw==='object','INVALID_SOURCE_RECORD');
 assert(SOURCE_TYPES.has(raw.sourceType),'INVALID_SOURCE_TYPE');
 assert(typeof raw.venue==='string'&&raw.venue.length>0,'VENUE_REQUIRED');
 assert(Number.isSafeInteger(raw.observedAt)&&raw.observedAt>0,'OBSERVATION_TIMESTAMP_REQUIRED');
 const base={sourceType:raw.sourceType,venue:raw.venue,observedAt:raw.observedAt,verified:false,executionEligible:false};
 if(raw.sourceType==='DEX_POOL'){
  assert(Number.isSafeInteger(raw.chainId)&&raw.chainId>0,'CHAIN_REQUIRED');
  const pool=ethers.getAddress(raw.pool),token0=ethers.getAddress(raw.token0),token1=ethers.getAddress(raw.token1);
  assert(token0!==token1,'IDENTICAL_TOKENS');
  return {...base,chainId:raw.chainId,pool,token0,token1,kind:raw.kind||'unknown',fee:raw.fee??null,createdBlock:raw.createdBlock??null,liquidityVerified:false};
 }
 if(raw.sourceType==='DEX_AGGREGATOR'){
  assert(Number.isSafeInteger(raw.chainId)&&raw.chainId>0,'CHAIN_REQUIRED');
  const tokenIn=ethers.getAddress(raw.tokenIn),tokenOut=ethers.getAddress(raw.tokenOut);
  assert(tokenIn!==tokenOut,'IDENTICAL_TOKENS');
  assert(/^\\d+$/.test(String(raw.amountIn))&&/^\\d+$/.test(String(raw.amountOut)),'RAW_QUOTE_REQUIRED');
  assert(raw.blockNumber!==undefined&&Number.isSafeInteger(raw.blockNumber),'QUOTE_BLOCK_REQUIRED');
  return {...base,chainId:raw.chainId,tokenIn,tokenOut,amountIn:String(raw.amountIn),amountOut:String(raw.amountOut),blockNumber:raw.blockNumber,quoteOnly:true};
 }
 assert(typeof raw.symbol==='string'&&raw.symbol.includes('/'),'CEX_MARKET_REQUIRED');
 assert(typeof raw.bid==='string'&&Number(raw.bid)>0&&typeof raw.ask==='string'&&Number(raw.ask)>0,'CEX_BID_ASK_REQUIRED');
 return {...base,symbol:raw.symbol,bid:raw.bid,ask:raw.ask,inventoryRequired:true,atomicWithOnchainLoan:false};
}
function ingest(records){
 const accepted=[],rejected=[],keys=new Set();
 for(let i=0;i<records.length;i++){
  try{
   const row=normalize(records[i]);
   const key=row.sourceType==='DEX_POOL'?['POOL',row.chainId,row.pool.toLowerCase()].join(':'):JSON.stringify(row);
   if(keys.has(key))continue;
   keys.add(key);accepted.push(row);
  }catch(e){rejected.push({index:i,reason:String(e.message).slice(0,120)})}
 }
 const counts={DEX_POOL:0,DEX_AGGREGATOR:0,CEX_ORDERBOOK:0};
 for(const r of accepted)counts[r.sourceType]++;
 return {build:'12.9.71',mode:'BLUEPRINT_MARKET_INGESTION',counts,accepted,rejected,readOnly:true,executionEligible:false};
}
function main(){
 const records=[];
 const file='arbiflow-market-inventory-12967.json';
 if(fs.existsSync(file)){
  const inventory=JSON.parse(fs.readFileSync(file,'utf8'));
  assert(inventory.chainId===8453&&Array.isArray(inventory.pools),'INVALID_INVENTORY');
  for(const p of inventory.pools)records.push({sourceType:'DEX_POOL',venue:p.dex,chainId:8453,pool:p.pool,token0:p.token0,token1:p.token1,kind:p.kind,fee:p.fee,createdBlock:p.createdBlock,observedAt:Date.now()});
 }
 // Other feeds must be real connector snapshots; never invent quotes.
 for(const path of ['arbiflow-aggregator-snapshots.json','arbiflow-cex-orderbooks.json','arbiflow-kraken-orderbooks.json']){
  if(fs.existsSync(path)){
   const rows=JSON.parse(fs.readFileSync(path,'utf8'));
   assert(Array.isArray(rows),'SOURCE_FILE_MUST_BE_ARRAY');
   records.push(...rows);
  }
 }
 const report=ingest(records);
 fs.writeFileSync('arbiflow-blueprint-market-12971.json',JSON.stringify({...report,accepted:report.accepted.slice(0,100),acceptedTotal:report.accepted.length},null,2)+'\n');
 console.log(JSON.stringify({...report,accepted:undefined}));
}
if(require.main===module){
 const a='0x0000000000000000000000000000000000000001',b='0x0000000000000000000000000000000000000002';
 const fixture={sourceType:'DEX_POOL',venue:'TEST',observedAt:1,chainId:8453,pool:'0x0000000000000000000000000000000000000003',token0:a,token1:b};
 const t=ingest([fixture,fixture,{...fixture,token1:a}]);
 assert(t.accepted.length===1&&t.rejected.length===1);
 assert(normalize({sourceType:'CEX_ORDERBOOK',venue:'TEST',observedAt:1,symbol:'BTC/USDT',bid:'100',ask:'101'}).atomicWithOnchainLoan===false);
 console.log(JSON.stringify({build:'12.9.71',unitTests:'PASS',readOnly:true}));
 main();
}
module.exports={normalize,ingest};
