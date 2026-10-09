'use strict';
// 12.9.39 compare confirmed and pending-state reads WITHOUT assuming Flashblocks support.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const UNI='0x222ca98f00ed15b1fae10b61c277703a194cf5d2';
const iface=new ethers.Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)']);
async function check(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const block=await p.getBlockNumber(),data=iface.encodeFunctionData('quoteExactInputSingle',[[USDC,WETH,10000000000n,500,0]]);
  const tx={to:UNI,data};
  const confirmed=await p.send('eth_call',[tx,ethers.toQuantity(block)]);
  const confirmedWeth=iface.decodeFunctionResult('quoteExactInputSingle',confirmed)[0];
  let pendingWeth=null,pendingSupported=false,pendingError=null;
  try{const raw=await p.send('eth_call',[tx,'pending']);pendingWeth=iface.decodeFunctionResult('quoteExactInputSingle',raw)[0].toString();pendingSupported=true}
  catch(err){pendingError=String(err?.shortMessage||err?.code||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,100)}
  const changed=pendingSupported&&BigInt(pendingWeth)!==confirmedWeth;
  return {success:true,build:'12.9.39',mode:'BASE_CONFIRMED_VS_PENDING_READ_DIAGNOSTIC',confirmedBlock:block,confirmedWethRaw:confirmedWeth.toString(),pendingWethRaw:pendingWeth,pendingTagResponseReceived:pendingSupported,pendingDiffObserved:changed,pendingIsGenuineFlashblocks:false,pendingError,pendingSupportInterpretation:'PENDING_RESPONSE_ALONE_DOES_NOT_PROVE_FLASHBLOCKS_OR_MEMPOOL_VISIBILITY',qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(10000*1000000,10000000000);if(process.env.BASE_RPC_URL)check(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('PENDING_STATE_12939_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,160));process.exitCode=1});else console.log(JSON.stringify({build:'12.9.39',unitAssertionsPassed:1,liveCheck:false}));}
module.exports={check};
