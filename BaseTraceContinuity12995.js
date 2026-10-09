'use strict';
// Checks only overlapping storage slots across consecutive prestateTracer diffMode
// traces. This is partial consistency evidence, never a fork checkpoint.
const word=v=>typeof v==='string'&&/^0x[0-9a-f]+$/i.test(v)?BigInt(v):null;
function continuity(a,b){
 if(!a?.post||!b?.pre)return {checked:0,mismatches:[],status:'TRACE_PAIR_MISSING',stateReconstructed:false};
 let checked=0;const mismatches=[];
 const next=new Map(Object.entries(b.pre).map(([k,v])=>[k.toLowerCase(),v]));
 for(const [address,after] of Object.entries(a.post)){
  const before=next.get(address.toLowerCase());if(!before)continue;
  for(const field of ['balance','nonce']){
   const left=word(after[field]),right=word(before[field]);
   if(left===null||right===null)continue;
   checked++;if(left!==right)mismatches.push({address,field});
  }
  const slots=new Map(Object.entries(before.storage||{}).map(([k,v])=>[k.toLowerCase(),v]));
  for(const [slot,value] of Object.entries(after.storage||{})){
   if(!slots.has(slot.toLowerCase()))continue;
   const left=word(value),right=word(slots.get(slot.toLowerCase()));
   if(left===null||right===null)continue;
   checked++;if(left!==right)mismatches.push({address,field:'storage',slot});
  }
 }
 return {checked,mismatches,status:mismatches.length?'INCONSISTENT':checked?'PARTIAL_CONSISTENCY':'NO_OVERLAPPING_FIELDS',stateReconstructed:false};
}
module.exports={continuity};
