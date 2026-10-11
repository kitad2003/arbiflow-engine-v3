'use strict';
// Conservative read-only pool verifier: token membership and factory provenance.
// Caller must provide an independently verified factory address and expected pool address.
const {Interface, getAddress}=require('ethers');
const I=new Interface([
 'function token0() view returns(address)',
 'function token1() view returns(address)',
 'function factory() view returns(address)',
 'function getReserves() view returns(uint112,uint112,uint32)',
 'function getPair(address,address) view returns(address)'
]);
function address(x){try{return getAddress(x).toLowerCase()}catch{return null}}
async function verifyV2Pool({provider,pool,tokenA,tokenB,expectedFactory}={}){
 const out={pool:address(pool),verified:false,readOnly:true,executionEligible:false,profitVerified:false,reason:null};
 const a=address(tokenA),b=address(tokenB),f=address(expectedFactory);
 if(!provider||typeof provider.call!=='function'||!out.pool||!a||!b||a===b||!f){out.reason='INVALID_OR_UNVERIFIED_INPUT';return out}
 async function read(name){
  const data=I.encodeFunctionData(name,[]);
  const response=await provider.call({to:out.pool,data});
  return I.decodeFunctionResult(name,response);
 }
 try{
  const [t0,t1,fac,reserves]=await Promise.all([read('token0'),read('token1'),read('factory'),read('getReserves')]);
  const x=address(t0[0]),y=address(t1[0]),actualFactory=address(fac[0]);
  if(!x||!y||x===y||!((x===a&&y===b)||(x===b&&y===a))){out.reason='TOKEN_PAIR_MISMATCH';return out}
  if(actualFactory!==f){out.reason='FACTORY_MISMATCH';return out}
  // A pool reporting a factory address is insufficient: ask the factory for its registered pair.
  const pairResponse=await provider.call({to:f,data:I.encodeFunctionData('getPair',[x,y])});
  const registeredPair=address(I.decodeFunctionResult('getPair',pairResponse)[0]);
  if(registeredPair!==out.pool){out.reason='FACTORY_PAIR_REGISTRY_MISMATCH';return out}
  const reserve0=BigInt(reserves[0]),reserve1=BigInt(reserves[1]);
  if(reserve0===0n||reserve1===0n){out.reason='ZERO_RESERVES';return out}
  return {...out,verified:true,reason:'TOKEN_FACTORY_AND_RESERVES_MATCH',token0:x,token1:y,factory:actualFactory,reserve0Raw:String(reserve0),reserve1Raw:String(reserve1),blockTag:'latest',note:'V2-like pool factory registry and reserves match; factory deployment identity, executable liquidity and profitability remain unverified'};
 }catch(e){out.reason='POOL_CALL_OR_DECODE_FAILED';return out}
}
module.exports={verifyV2Pool};
