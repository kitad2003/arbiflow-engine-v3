'use strict';
// ArbiFlow 12.9.63: fair token-path-first sampler, no RPC or trade execution.
const assert=require('node:assert/strict');
const TYPES=['crossDex','sameDex','triangular'];
function select(routes,perType=5){
 assert(Number.isSafeInteger(perType)&&perType>=1&&perType<=100,'INVALID_PER_TYPE');
 const selected=[],coverage={};
 for(const type of TYPES){
  const eligible=routes.filter(r=>r.type===type&&r.start==='USDC');
  const paths=new Map();
  for(const route of eligible){
   const path=route.tokenPath.join('>');
   if(!paths.has(path))paths.set(path,new Map());
   const venues=route.legs.map(e=>e.dex).join('>');
   const groups=paths.get(path);
   if(!groups.has(venues))groups.set(venues,[]);
   groups.get(venues).push(route);
  }
  const pathKeys=[...paths.keys()].sort();
  const pathBuckets=new Map(pathKeys.map(p=>{
   const groups=paths.get(p),venues=[...groups.keys()].sort(),ordered=[];
   while(venues.some(v=>groups.get(v).length)){
    for(const v of venues){const r=groups.get(v).shift();if(r)ordered.push(r)}
   }
   return [p,ordered];
  }));
  const picked=[];
  while(picked.length<perType){
   let progressed=false;
   for(const path of pathKeys){
    const route=pathBuckets.get(path).shift();
    if(route){picked.push(route);progressed=true}
    if(picked.length===perType)break;
   }
   if(!progressed)break;
  }
  selected.push(...picked);
  coverage[type]={eligibleRoutes:eligible.length,availableTokenPaths:paths.size,selectedRoutes:picked.length,selectedTokenPaths:new Set(picked.map(r=>r.tokenPath.join('>'))).size,selectedVenueSequences:new Set(picked.map(r=>r.legs.map(e=>e.dex).join('>'))).size};
 }
 return {routes:selected,coverage,uniqueTokenPaths:new Set(selected.map(r=>r.tokenPath.join('>'))).size};
}
if(require.main===module){
 const mk=(type,path,dex,id)=>({type,start:'USDC',tokenPath:path,legs:dex.map((d,i)=>({dex:d,pool:id+'-'+i}))});
 const input=[...Array.from({length:12},(_,i)=>mk('crossDex',['USDC','AERO','USDC'],['A','B'],'a'+i)),mk('crossDex',['USDC','WETH','USDC'],['A','B'],'w'),mk('crossDex',['USDC','DAI','USDC'],['B','A'],'d'),mk('sameDex',['USDC','WETH','USDC'],['A','A'],'s'),mk('triangular',['USDC','WETH','DAI','USDC'],['A','B','A'],'t')];
 const out=select(input,3);
 assert.equal(out.coverage.crossDex.selectedTokenPaths,3);
 assert.equal(out.coverage.crossDex.availableTokenPaths,3);
 assert.equal(out.routes.length,5);
 assert.deepEqual(out.routes.filter(r=>r.type==='crossDex').map(r=>r.tokenPath[1]),['AERO','DAI','WETH']);
 console.log(JSON.stringify({build:'12.9.63',unitAssertionsPassed:4,coverage:out.coverage,readOnly:true,executionEligible:false}));
}
module.exports={select};
