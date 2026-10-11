'use strict';
// Universal Router calldata parser. An allowlisted router address must be verified separately.
// Only decodes structural swap intents. Never claims execution, pool impact, or profit.
const {Interface}=require('ethers');
const I=new Interface(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable','function execute(bytes commands,bytes[] inputs) payable']);
const coder=require('ethers').AbiCoder.defaultAbiCoder();
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const COMMANDS=Object.freeze({0x00:'V3_SWAP_EXACT_IN',0x01:'V3_SWAP_EXACT_OUT',0x08:'V2_SWAP_EXACT_IN',0x09:'V2_SWAP_EXACT_OUT'});
function decodeUniversalIntent(tx,{allowlistedAddresses=[]}={}){
 const to=typeof tx?.to==='string'?tx.to.toLowerCase():null;
 const base={chain:tx?.chain||null,hash:tx?.hash||null,to,decoded:false,completeIntent:false,swapVerified:false,poolImpactVerified:false,profitVerified:false,executionEligible:false};
 if(!to||!allowlistedAddresses.some(a=>a.toLowerCase()===to))return {...base,kind:'UNVERIFIED_ROUTER_DESTINATION'};
 let parsed;
 try{parsed=I.parseTransaction({data:tx.input||'0x',value:tx.value||0})}catch{return {...base,kind:'INVALID_UNIVERSAL_CALLDATA'}}
 if(!parsed||parsed.name!=='execute')return {...base,kind:'UNSUPPORTED_UNIVERSAL_METHOD'};
 const bytes=parsed.args[0],inputs=parsed.args[1];
 if((bytes.length-2)/2!==inputs.length)return {...base,kind:'COMMAND_INPUT_LENGTH_MISMATCH'};
 const swaps=[],unsupported=[];
 for(let i=0;i<inputs.length;i++){
  const raw=Number.parseInt(bytes.slice(2+i*2,4+i*2),16);
  const id=raw&0x3f,command=COMMANDS[id];
  if(!command){unsupported.push({index:i,commandId:id});continue}
  try{
   let args,path;
   if(id===0x08||id===0x09){
    args=coder.decode(['address','uint256','uint256','address[]','bool'],inputs[i]);
    path=[...args[3]];
   }else{
    args=coder.decode(['address','uint256','uint256','bytes','bool'],inputs[i]);
    const packed=args[3].slice(2);
    if(packed.length<86||(packed.length-40)%46!==0)throw Error('INVALID_V3_PATH');
    path=[];for(let offset=0;offset<packed.length;offset+=46)path.push('0x'+packed.slice(offset,offset+40));
    if(!path.every(a=>ADDRESS.test(a)))throw Error('INVALID_V3_ADDRESS');
   }
   if(path.length<2||path.length>32||!path.every(a=>ADDRESS.test(a)))throw Error('INVALID_PATH');
   swaps.push({index:i,command,recipient:args[0],amountRaw:String(args[1]),limitRaw:String(args[2]),path,payerIsUser:Boolean(args[4]),exactOutput:id===0x01||id===0x09});
  }catch(e){unsupported.push({index:i,commandId:id,reason:'MALFORMED_SWAP_INPUT'})}
 }
 return {...base,kind:swaps.length?'DECODED_UNIVERSAL_SWAP_INTENT':'NO_SUPPORTED_SWAP_INTENT',decoded:swaps.length>0,completeIntent:swaps.length>0&&unsupported.length===0,swaps,unsupported,deadline:parsed.args.length===3?String(parsed.args[2]):null,notes:'Structural decoding only; router identity, onchain outcome and profitability require independent verification'};
}
module.exports={decodeUniversalIntent};
