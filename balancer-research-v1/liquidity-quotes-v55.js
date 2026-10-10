'use strict';
// V55: confirmed-block reserve snapshots and two-direction constant-product gross quotes.
// Read-only. Bundle disclosures are discovery clues, never executable targets.
const {ethers}=require('ethers');
const {identifyPair}=require('./verified-pairs-v12');
const ABI=['function getReserves() view returns (uint112,uint112,uint32)'];
const SIZES=[1n,5n,10n,25n,50n,100n]; // basis points of input-side reserve: 0.01%..1%
function quote(amount,reserveIn,reserveOut){
 if(amount<=0n||reserveIn<=0n||reserveOut<=0n)return 0n;
 const input=amount*997n;
 return input*reserveOut/(reserveIn*1000n+input);
}
function roundTrip(a,b,size,direction){
 const ai=direction===0?a.r0:a.r1,ao=direction===0?a.r1:a.r0;
 const bi=direction===0?b.r1:b.r0,bo=direction===0?b.r0:b.r1;
 const intermediate=quote(size,ai,ao);
 const returned=quote(intermediate,bi,bo);
 return {sizeRaw:size.toString(),returnedRaw:returned.toString(),grossDeltaRaw:(returned-size).toString(),positiveGross:returned>size};
}
async function evaluate(provider,poolA,poolB){
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const block=await provider.getBlock('latest');
 if(!block?.hash)throw Error('CONFIRMED_BLOCK_UNAVAILABLE');
 const [a,b]=await Promise.all([identifyPair(provider,poolA,block.number),identifyPair(provider,poolB,block.number)]);
 if(!a.verified||!b.verified)throw Error('POOL_IDENTITY_NOT_VERIFIED');
 if(a.venue===b.venue)throw Error('DISTINCT_VENUES_REQUIRED');
 if(a.token0.toLowerCase()!==b.token0.toLowerCase()||a.token1.toLowerCase()!==b.token1.toLowerCase())throw Error('TOKEN_ORDER_MISMATCH');
 const [ar,br]=await Promise.all([new ethers.Contract(poolA,ABI,provider).getReserves({blockTag:block.number}),new ethers.Contract(poolB,ABI,provider).getReserves({blockTag:block.number})]);
 const A={r0:BigInt(ar[0]),r1:BigInt(ar[1])},B={r0:BigInt(br[0]),r1:BigInt(br[1])};
 const rows=[];
 for(const [buy,sell,first] of [[A,B,a.venue],[B,A,b.venue]]){
  for(const direction of [0,1]){
   const inputReserve=direction===0?buy.r0:buy.r1;
   for(const bps of SIZES){
    const size=inputReserve*bps/10000n;
    rows.push({firstVenue:first,secondVenue:first===a.venue?b.venue:a.venue,inputToken:direction===0?a.token0:a.token1,sizeBpsOfFirstPoolReserve:Number(bps),...roundTrip(buy,sell,size,direction)});
   }
  }
 }
 return {blockNumber:block.number,blockHash:block.hash,token0:a.token0,token1:a.token1,
  poolA,poolB,reserves:{poolA:{r0:A.r0.toString(),r1:A.r1.toString()},poolB:{r0:B.r0.toString(),r1:B.r1.toString()}},
  quotes:rows,positiveGrossCount:rows.filter(x=>x.positiveGross).length,
  netProfitVerified:false,gasIncluded:false,flashLoanFeeIncluded:false,builderBidIncluded:false,
  targetFirstSimulation:false,executionEligible:false,mainnetBroadcast:false,bundlesSubmitted:0};
}
module.exports={quote,roundTrip,evaluate};
if(require.main===module){
 const provider=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 const pairs=[
 ['0x15e86e6f65ef7ea1dbb72a5e51a07926fb1c82e3','0x08650bb9dc722C9c8C62E79C2BAfA2d3fc5B3293'],
 ['0x3dd49f67e9d5bc4c5e6634b3f70bfd9dc1b6bd74','0x0D7a61C28B3ad47bb9dbB139260915E29b6efC45']
 ];
 (async()=>{if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_REQUIRED');
  const results=[];for(const [a,b] of pairs){try{results.push({ok:true,...await evaluate(provider,a,b)})}catch(e){results.push({ok:false,poolA:a,poolB:b,error:String(e.message).slice(0,150)})}}
  console.log(JSON.stringify({build:'BALANCER_RESEARCH_V55',mode:'CONFIRMED_BLOCK_READ_ONLY_GROSS_QUOTES',results,executionEligible:false,bundlesSubmitted:0,mainnetBroadcast:false}));
 })().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>provider.destroy());
}
