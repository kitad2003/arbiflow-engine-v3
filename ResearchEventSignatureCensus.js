'use strict';
// Read-only event-signature census; unknown topics are not labelled swaps.
const {id}=require('ethers');
const names=[
 ['Transfer(address,address,uint256)','ERC20_TRANSFER'],
 ['Approval(address,address,uint256)','ERC20_APPROVAL'],
 ['Mint(address,address,uint128,uint256,uint256)','V3_MINT'],
 ['Burn(address,int24,int24,uint128,uint256,uint256)','V3_BURN'],
 ['Collect(address,address,int24,int24,uint128,uint128)','V3_COLLECT'],
 ['Flash(address,address,uint256,uint256,uint256,uint256)','V3_FLASH'],
 ['Sync(uint112,uint112)','V2_SYNC'],
 ['Swap(address,uint256,uint256,uint256,uint256,address)','V2_SWAP'],
 ['Swap(address,address,int256,int256,uint160,uint128,int24)','V3_SWAP']
];
const known=new Map(names.map(([s,n])=>[id(s).toLowerCase(),n]));
function census(logs){
 const counts=new Map();let valid=0,unknown=0;
 for(const l of logs||[]){
  const topic=l?.topics?.[0];
  if(typeof topic!=='string'||!/^0x[0-9a-f]{64}$/i.test(topic))continue;
  valid++;const sig=topic.toLowerCase(),kind=known.get(sig)||'UNIDENTIFIED_SIGNATURE';
  if(kind==='UNIDENTIFIED_SIGNATURE')unknown++;
  const k=(String(l.address||'').toLowerCase())+':'+sig;
  if(!counts.has(k))counts.set(k,{pool:l.address,topic0:sig,knownKind:kind,count:0});
  counts.get(k).count++;
 }
 return {build:'RESEARCH_ONLY_13',mode:'PRECONFIRMED_EVENT_SIGNATURE_INVENTORY',validSignatureEvents:valid,
  unidentifiedSignatureEvents:unknown,signatureGroups:[...counts.values()].sort((a,b)=>b.count-a.count).slice(0,30),
  noUnverifiedSwapClassification:true,alerts:[],executionEligible:false};
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const a=census([{address:'0x'+'1'.repeat(40),topics:[id('Transfer(address,address,uint256)')]},
 {address:'0x'+'1'.repeat(40),topics:['0x'+'f'.repeat(64)]}]);
 assert.equal(a.validSignatureEvents,2);assert.equal(a.unidentifiedSignatureEvents,1);
 assert.equal(a.signatureGroups.some(x=>x.knownKind==='ERC20_TRANSFER'),true);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_13',unitAssertionsPassed:3}));
}
module.exports={census};
