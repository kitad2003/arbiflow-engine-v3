'use strict';
// Research-only ABI decoder. Never assumes a log is a swap unless its signature and data match.
const {ethers}=require('ethers');
const v2=new ethers.Interface(['event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)']);
const v3=new ethers.Interface(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
function decode(log){
 if(!log||!Array.isArray(log.topics)||typeof log.data!=='string')return {recognized:false,reason:'MISSING_LOG_FIELDS'};
 for(const [kind,abi] of [['V2_STYLE_SWAP',v2],['V3_STYLE_SWAP',v3]]){
  try{
   const event=abi.parseLog({topics:log.topics,data:log.data});
   if(!event||event.name!=='Swap')continue;
   const amounts=kind==='V2_STYLE_SWAP'?{
    amount0In:event.args.amount0In.toString(),amount1In:event.args.amount1In.toString(),
    amount0Out:event.args.amount0Out.toString(),amount1Out:event.args.amount1Out.toString()
   }:{amount0:event.args.amount0.toString(),amount1:event.args.amount1.toString(),
    sqrtPriceX96:event.args.sqrtPriceX96.toString(),tick:Number(event.args.tick)};
   return {recognized:true,kind,amounts,tokenAddressesVerified:false,
    simulationCompleted:false,profitVerified:false,executionEligible:false};
  }catch{}
 }
 return {recognized:false,reason:'UNSUPPORTED_OR_NON_SWAP_LOG',executionEligible:false};
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const addr='0x'+'1'.repeat(40);
 const encoded=v3.encodeEventLog(v3.getEvent('Swap'),[addr,addr,-100n,200n,123456789n,1000n,17]);
 const d=decode({topics:encoded.topics,data:encoded.data});
 assert.equal(d.recognized,true);assert.equal(d.kind,'V3_STYLE_SWAP');assert.equal(d.amounts.amount0,'-100');assert.equal(d.amounts.amount1,'200');assert.equal(decode({topics:[],data:'0x'}).recognized,false);console.log(JSON.stringify({build:'RESEARCH_ONLY_4',unitAssertionsPassed:4}));
}
module.exports={decode};
