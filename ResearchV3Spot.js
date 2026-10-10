'use strict';
// Research-only V3 post-swap spot price, from sqrtPriceX96 and token decimals.
// NOT a pre-swap price, transaction impact, executable quote, or arbitrage opportunity.
const {formatUnits}=require('ethers');
function spot(event){
 if(!event?.tokenAddressesVerified||event?.decoded?.kind!=='V3_STYLE_SWAP')return {available:false,reason:'VERIFIED_V3_EVENT_REQUIRED'};
 try{
  const {token0,token1}=event.tokens;
  const sqrt=BigInt(event.decoded.amounts.sqrtPriceX96);
  const d0=Number(token0.decimals),d1=Number(token1.decimals);
  if(sqrt<=0n||![d0,d1].every(x=>Number.isInteger(x)&&x>=0&&x<=36))throw Error('INVALID_V3_STATE');
  const q192=2n**192n,scale=10n**24n;
  // Price token1/token0 in human units: sqrt^2 / 2^192 * 10^(d0-d1).
  const numerator=sqrt*sqrt*10n**BigInt(d0)*scale;
  const denominator=q192*10n**BigInt(d1);
  const scaled=numerator/denominator;
  const price= formatUnits(scaled,24);
  const inverseScaled=(scale*scale)/scaled;
  return {available:true,token0:token0.symbol||token0.address,token1:token1.symbol||token1.address,
   token1PerToken0:price,token0PerToken1:formatUnits(inverseScaled,24),
   context:'DECODED_POST_SWAP_POOL_SPOT_PRICE',priceImpactVerified:false,profitVerified:false,executionEligible:false};
 }catch(e){return {available:false,reason:String(e.message||e).slice(0,80),executionEligible:false}}
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const x={tokenAddressesVerified:true,tokens:{token0:{decimals:18,symbol:'WETH'},token1:{decimals:6,symbol:'USDC'}},
  decoded:{kind:'V3_STYLE_SWAP',amounts:{sqrtPriceX96:'3953591211734622219166123'}}};
 const r=spot(x);
 assert.equal(r.available,true);
 assert.equal(Number(r.token1PerToken0)>2000&&Number(r.token1PerToken0)<3000,true);
 assert.equal(r.priceImpactVerified,false);
 assert.equal(spot({}).available,false);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_6',unitAssertionsPassed:4,illustrativePrice:r.token1PerToken0}));
}
module.exports={spot};
