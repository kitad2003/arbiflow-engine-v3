'use strict';
// Diverse, deterministic round-robin sampling across token paths and venues.
// Pure route selection: does not place trades or make RPC calls.
const assert=require('node:assert/strict');
function selectDiversified(routes,perType=5){
 assert(Number.isInteger(perType)&&perType>=1&&perType<=100,'INVALID_PER_TYPE');
 const result=[];
 for(const type of ['crossDex','sameDex','triangular']){
  const groups=new Map();
  for(const r of routes){
   if(r.type!==type||r.start!=='USDC')continue;
   const key=r.tokenPath.join('>')+'|'+r.legs.map(e=>e.dex).join('>');
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(r);
  }
  const keys=[...groups.keys()].sort(),selected=[];
  while(selected.length<perType){
   let progress=false;
   for(const key of keys){
    const group=groups.get(key);
    if(group.length){selected.push(group.shift());progress=true}
    if(selected.length===perType)break;
   }
   if(!progress)break;
  }
  result.push(...selected);
 }
 return result;
}
if(require.main===module){
 const route=(type,path,venues,id)=>({type,start:'USDC',tokenPath:path,legs:venues.map((dex,i)=>({dex,pool:id+'-'+i}))});
 const sample=[
  ...Array.from({length:8},(_,i)=>route('crossDex',['USDC','AERO','USDC'],['A','B'],String(i))),
  route('crossDex',['USDC','WETH','USDC'],['A','B'],'w'),
  route('crossDex',['USDC','DAI','USDC'],['B','A'],'d'),
  route('sameDex',['USDC','WETH','USDC'],['A','A'],'s'),
  route('triangular',['USDC','WETH','DAI','USDC'],['A','B','A'],'t')
 ];
 const selected=selectDiversified(sample,3);
 assert.equal(selected.filter(x=>x.type==='crossDex').length,3);
 assert.equal(new Set(selected.filter(x=>x.type==='crossDex').map(x=>x.tokenPath.join('>'))).size,3);
 assert.equal(selected.length,5);
 console.log(JSON.stringify({build:'12.9.62',mode:'DIVERSIFIED_ROUTE_SELECTION_TEST',unitAssertionsPassed:3,readOnly:true}));
}
module.exports={selectDiversified};
