'use strict';
const {Interface}=require('ethers');
const {ROUTERS,CANDIDATES}=require('./verified-router-registry-v4');
const ADDR=/^0x[0-9a-f]{40}$/i;
const V2=new Interface([
 'function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable',
 'function swapETHForExactTokens(uint256 amountOut,address[] path,address to,uint256 deadline) payable',
 'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)',
 'function swapTokensForExactTokens(uint256 amountOut,uint256 amountInMax,address[] path,address to,uint256 deadline)',
 'function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)'
]);
const UNIVERSAL_SELECTORS=new Set(['0x3593564c','0x24856bc3']);
function decode(chain,tx){
 const to=typeof tx?.to==='string'&&ADDR.test(tx.to)?tx.to.toLowerCase():null;
 const input=typeof tx?.input==='string'?tx.input:'';
 const selector=/^0x[0-9a-f]{8}/i.test(input)?input.slice(0,10).toLowerCase():null;
 const router=to&&ROUTERS[chain]?.[to]||null;
 const base={chain,hash:tx?.hash||null,to,selector,router:router?.name||null,routerVerified:!!router,decoded:false,swapVerified:false,poolImpactVerified:false,profitVerified:false,executionEligible:false};
 if(!router){
  return {...base,kind:UNIVERSAL_SELECTORS.has(selector)?'UNIVERSAL_ROUTER_SELECTOR_UNVERIFIED_DESTINATION':'UNVERIFIED_DESTINATION',candidateForContractVerification:!!to&&CANDIDATES[chain]?.includes(to)};
 }
 if(router.family!=='UNISWAP_V2')return {...base,kind:'UNSUPPORTED_ROUTER_ABI'};
 try{
  const parsed=V2.parseTransaction({data:input,value:tx?.value||0});
  if(!parsed||!parsed.name.startsWith('swap'))return {...base,kind:'UNSUPPORTED_METHOD'};
  const a=parsed.args;let path,recipient,deadline,amountIn=null,amountOutMin=null,amountOut=null,amountInMax=null;
  switch(parsed.name){
   case 'swapExactETHForTokens':amountIn=String(BigInt(tx?.value||0));amountOutMin=String(a[0]);path=a[1];recipient=a[2];deadline=a[3];break;
   case 'swapETHForExactTokens':amountInMax=String(BigInt(tx?.value||0));amountOut=String(a[0]);path=a[1];recipient=a[2];deadline=a[3];break;
   case 'swapExactTokensForTokens':case 'swapExactTokensForETH':amountIn=String(a[0]);amountOutMin=String(a[1]);path=a[2];recipient=a[3];deadline=a[4];break;
   case 'swapTokensForExactTokens':amountOut=String(a[0]);amountInMax=String(a[1]);path=a[2];recipient=a[3];deadline=a[4];break;
   default:return {...base,kind:'UNSUPPORTED_METHOD'};
  }
  if(!Array.isArray(path)||path.length<2||path.length>32||!path.every(x=>ADDR.test(x)))return {...base,kind:'INVALID_SWAP_PATH'};
  return {...base,kind:'DECODED_V2_SWAP_INTENT',decoded:true,swapVerified:false,method:parsed.name,path:[...path],recipient,deadline:String(deadline),amountInRaw:amountIn,amountOutMinRaw:amountOutMin,amountOutRaw:amountOut,amountInMaxRaw:amountInMax,notes:'ABI decoding establishes submitted intent only; transaction outcome, reserves and profitability unverified'};
 }catch{return {...base,kind:'ABI_DECODE_FAILED'}}
}
module.exports={decode,V2};
