'use strict';
const {METHODS,ROUTERS}=require('./pending-investigation-v3');
const ADDR=/^0x[0-9a-f]{40}$/i;
const ERC20=Object.freeze({'0xa9059cbb':'TRANSFER','0x23b872dd':'TRANSFER_FROM','0x095ea7b3':'APPROVE'});
const SWAP=new Set(Object.keys(METHODS).filter(k=>!['0xac9650d8','0x5ae401dc'].includes(k)));
function classify(chain,tx){
 const to=typeof tx?.to==='string'&&ADDR.test(tx.to)?tx.to.toLowerCase():null;
 const input=typeof tx?.input==='string'?tx.input.toLowerCase():'';
 const selector=/^0x[0-9a-f]{8}/.test(input)?input.slice(0,10):null;
 const knownRouter=chain==='ethereum'?ROUTERS[to]||null:null;
 const method=METHODS[selector]||null;
 let kind='UNKNOWN_CONTRACT_CALL';
 if(tx?.to===null)kind='CONTRACT_CREATION';
 else if(!to)kind='INVALID_DESTINATION';
 else if(!selector)kind=input==='0x'||input===''?'NO_CALLDATA':'MALFORMED_CALLDATA';
 else if(ERC20[selector])kind='ERC20_'+ERC20[selector]+'_SELECTOR';
 else if(SWAP.has(selector))kind=knownRouter?'KNOWN_ROUTER_SWAP_SELECTOR':'SWAP_SELECTOR_UNVERIFIED_DESTINATION';
 else if(method)kind='MULTICALL_SELECTOR_UNVERIFIED_CONTENT';
 return {chain,hash:tx?.hash||null,to,selector,kind,knownRouter,method,swapVerified:false,poolImpactVerified:false,profitVerified:false};
}
module.exports={classify};
