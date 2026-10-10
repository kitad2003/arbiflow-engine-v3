'use strict';
// Research-only on-chain pool token identity verification. No legacy strategy or trading.
const {ethers}=require('ethers');
const POOL=['function token0() view returns(address)','function token1() view returns(address)'];
const TOKEN=['function decimals() view returns(uint8)','function symbol() view returns(string)'];
const address=x=>typeof x==='string'&&ethers.isAddress(x);
async function identify(provider,pool){
 if(!address(pool))return {verified:false,reason:'INVALID_POOL_ADDRESS'};
 try{
  if((await provider.getNetwork()).chainId!==8453n)return {verified:false,reason:'NOT_BASE_CHAIN'};
  if((await provider.getCode(pool))==='0x')return {verified:false,reason:'NO_POOL_CONTRACT_CODE'};
  const c=new ethers.Contract(pool,POOL,provider);
  const [token0,token1]=await Promise.all([c.token0(),c.token1()]);
  if(!address(token0)||!address(token1)||token0.toLowerCase()===token1.toLowerCase())return {verified:false,reason:'BAD_POOL_TOKENS'};
  async function tokenInfo(a){
   if((await provider.getCode(a))==='0x')throw Error('TOKEN_CODE_MISSING');
   const t=new ethers.Contract(a,TOKEN,provider);
   const decimals=Number(await t.decimals());if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('UNSUPPORTED_TOKEN_DECIMALS');
   let symbol=null;try{symbol=String(await t.symbol()).slice(0,32)}catch{}
   return {address:a,decimals,symbol};
  }
  const [t0,t1]=await Promise.all([tokenInfo(token0),tokenInfo(token1)]);
  return {verified:true,pool,chainId:8453,token0:t0,token1:t1,verifiedAtConfirmedState:true};
 }catch(e){return {verified:false,pool,reason:'TOKEN_METADATA_READ_FAILED',detail:String(e.shortMessage||e.message||e).slice(0,100)}}
}
function enrich(event,metadata){
 if(!event?.decoded?.recognized||!metadata?.verified)return {...event,tokenAddressesVerified:false};
 const amounts=event.decoded.amounts;
 const output={...event,tokenAddressesVerified:true,tokens:{token0:metadata.token0,token1:metadata.token1}};
 if(event.decoded.kind==='V3_STYLE_SWAP'){
  output.formattedAmounts={token0:ethers.formatUnits(BigInt(amounts.amount0),metadata.token0.decimals),
   token1:ethers.formatUnits(BigInt(amounts.amount1),metadata.token1.decimals)};
 }
 if(event.decoded.kind==='V2_STYLE_SWAP'){
  output.formattedAmounts=Object.fromEntries(['amount0In','amount0Out','amount1In','amount1Out'].map(k=>[k,ethers.formatUnits(BigInt(amounts[k]),metadata[k.includes('0')?'token0':'token1'].decimals)]));
 }
 return output;
}
if(require.main===module){
 const assert=require('node:assert/strict');
 const event={decoded:{recognized:true,kind:'V3_STYLE_SWAP',amounts:{amount0:'-4165897861378097',amount1:'10367659'}}};
 const meta={verified:true,token0:{address:'0x'+'1'.repeat(40),decimals:18},token1:{address:'0x'+'2'.repeat(40),decimals:6}};
 const r=enrich(event,meta);
 assert.equal(r.formattedAmounts.token0,'-0.004165897861378097');
 assert.equal(r.formattedAmounts.token1,'10.367659');
 assert.equal(enrich(event,{verified:false}).tokenAddressesVerified,false);
 console.log(JSON.stringify({build:'RESEARCH_ONLY_5',unitAssertionsPassed:3}));
}
module.exports={identify,enrich};
