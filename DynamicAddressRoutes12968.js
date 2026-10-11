'use strict';
// 12.9.68: Address-native market graph. No hardcoded token universe or USDC anchor.
// READ ONLY. PoolCreated events alone are not proof of liquidity or executable quotes.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const FILE='arbiflow-market-inventory-12967.json';
function graph(pools){
 const adjacency=new Map(),rejected=[];
 const add=(token,edge)=>{if(!adjacency.has(token))adjacency.set(token,[]);adjacency.get(token).push(edge)};
 for(const p of pools){
  try{
   const a=ethers.getAddress(p.token0).toLowerCase(),b=ethers.getAddress(p.token1).toLowerCase();
   const pool=ethers.getAddress(p.pool).toLowerCase();
   if(a===b||!Number.isInteger(p.fee)||p.fee<0)throw Error('INVALID_POOL_FIELDS');
   for(const [from,to] of [[a,b],[b,a]])add(from,{from,to,pool,dex:p.dex,fee:p.fee,kind:p.kind});
  }catch(e){rejected.push({pool:p.pool||null,reason:String(e.message).slice(0,90)})}
 }
 return {adjacency,rejected};
}
function routes(pools,{maxHops=3}={}){
 assert(maxHops===2||maxHops===3,'SUPPORTED_HOPS_2_OR_3');
 const {adjacency,rejected}=graph(pools),result=[],seen=new Set(),counts={crossDex:0,sameDex:0,triangular:0};
 const add=(legs)=>{
  if(new Set(legs.map(l=>l.pool)).size!==legs.length)return;
  const type=legs.length===3?'triangular':legs[0].dex===legs[1].dex?'sameDex':'crossDex';
  const key=legs.map(l=>l.pool+':'+l.from+'>'+l.to).join('|');
  if(seen.has(key))return;seen.add(key);counts[type]++;
  result.push({type,start:legs[0].from,tokenPath:[legs[0].from,...legs.map(l=>l.to)],legs});
 };
 for(const [start,firsts] of adjacency){
  for(const first of firsts){
   for(const second of adjacency.get(first.to)||[]){
    if(second.to===start)add([first,second]);
    if(maxHops===2||second.to===start)continue;
    for(const third of adjacency.get(second.to)||[]){
     if(third.to===start)add([first,second,third]);
    }
   }
  }
 }
 return {routes:result,counts,rejected,uniqueTokens:adjacency.size,uniquePools:pools.length};
}
function load(file=FILE){
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 assert(data.chainId===8453&&Array.isArray(data.pools),'INVALID_BASE_INVENTORY');
 return data;
}
function main(){
 const inventory=load(),out=routes(inventory.pools);
 const report={build:'12.9.68',mode:'ADDRESS_NATIVE_DISCOVERED_ROUTE_GRAPH',network:'BASE',lastCompleteBlock:inventory.lastCompleteBlock,inventoryPools:inventory.pools.length,uniqueTokens:out.uniqueTokens,generatedRoutes:out.routes.length,routeCounts:out.counts,rejectedPools:out.rejected,routeExamples:out.routes.slice(0,20),quotesExecuted:false,liquidityVerified:false,profitabilityVerified:false,readOnly:true,executionEligible:false};
 fs.writeFileSync('arbiflow-address-route-graph-12968.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
if(require.main===module){
 const a='0x0000000000000000000000000000000000000001',b='0x0000000000000000000000000000000000000002',c='0x0000000000000000000000000000000000000003';
 const mock=[{token0:a,token1:b,pool:'0x0000000000000000000000000000000000000011',fee:500,dex:'U',kind:'v3'},{token0:a,token1:b,pool:'0x0000000000000000000000000000000000000012',fee:500,dex:'P',kind:'v3'},{token0:b,token1:c,pool:'0x0000000000000000000000000000000000000013',fee:500,dex:'U',kind:'v3'},{token0:c,token1:a,pool:'0x0000000000000000000000000000000000000014',fee:500,dex:'P',kind:'v3'}];
 const test=routes(mock);
 assert(test.counts.crossDex>=2&&test.counts.triangular>=1);
 assert(test.routes.some(r=>r.start===c.toLowerCase()),'NO_HARDCODED_ANCHOR');
 console.log(JSON.stringify({build:'12.9.68',unitTests:'PASS',readOnly:true}));
 if(fs.existsSync(FILE))main();
 else console.log(JSON.stringify({status:'INVENTORY_MISSING',hint:'Restore the discovery inventory artifact before running live route graph'}));
}
module.exports={graph,routes,load};
