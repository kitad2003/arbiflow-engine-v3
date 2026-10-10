'use strict';
// Research-based DEX registry foundation. No fabricated 500+ coverage.
// Aggregator/indexer discovery is UNTRUSTED until on-chain verification.
const {ethers}=require('ethers');
const ADAPTERS=Object.freeze(['V2_CONSTANT_PRODUCT','V3_CONCENTRATED','CURVE_STABLE','SOLIDLY_STABLE_VOLATILE','ORDER_BOOK']);
const STATUS=Object.freeze({DISCOVERED:'DISCOVERED_UNVERIFIED',VERIFIED:'ONCHAIN_CONTRACT_VERIFIED',UNSUPPORTED:'ADAPTER_NOT_IMPLEMENTED',FAILED:'VERIFICATION_FAILED'});
const V2_FACTORY_ABI=['function getPair(address,address) view returns(address)'];
function normalize(input){
 if(!input||typeof input!=='object')throw Error('INVALID_ENTRY');
 const chainId=Number(input.chainId);
 if(!Number.isSafeInteger(chainId)||chainId<=0)throw Error('INVALID_CHAIN_ID');
 if(!ADAPTERS.includes(input.adapter))throw Error('UNKNOWN_ADAPTER');
 if(!ethers.isAddress(input.factory))throw Error('INVALID_FACTORY_ADDRESS');
 if(!ethers.isAddress(input.token0)||!ethers.isAddress(input.token1)||input.token0.toLowerCase()===input.token1.toLowerCase())throw Error('INVALID_TOKENS');
 return {chainId,adapter:input.adapter,factory:ethers.getAddress(input.factory),token0:ethers.getAddress(input.token0),token1:ethers.getAddress(input.token1),source:String(input.source||'UNSPECIFIED').slice(0,100)};
}
function deduplicate(inputs){const out=new Map(),errors=[];for(const input of inputs){try{const row=normalize(input);const key=[row.chainId,row.adapter,row.factory.toLowerCase(),...[row.token0.toLowerCase(),row.token1.toLowerCase()].sort()].join('|');if(!out.has(key))out.set(key,row)}catch(e){errors.push(String(e.message))}}return {entries:[...out.values()],invalidEntries:errors.length,errors:errors.slice(0,10)}}
async function verifyV2(provider,row,{blockTag}={}){
 if(row.adapter!=='V2_CONSTANT_PRODUCT')return {...row,status:STATUS.UNSUPPORTED,verified:false};
 try{
  if(Number((await provider.getNetwork()).chainId)!==row.chainId)return {...row,status:STATUS.FAILED,reason:'CHAIN_MISMATCH',verified:false};
  if(await provider.getCode(row.factory,blockTag)==='0x')return {...row,status:STATUS.FAILED,reason:'FACTORY_CODE_ABSENT',verified:false};
  const factory=new ethers.Contract(row.factory,V2_FACTORY_ABI,provider);
  const pool=await factory.getPair(row.token0,row.token1,{blockTag});
  if(pool===ethers.ZeroAddress)return {...row,status:STATUS.FAILED,reason:'POOL_NOT_REGISTERED',verified:false};
  if(await provider.getCode(pool,blockTag)==='0x')return {...row,status:STATUS.FAILED,reason:'POOL_CODE_ABSENT',verified:false};
  const pair=new ethers.Contract(pool,['function factory() view returns(address)','function token0() view returns(address)','function token1() view returns(address)'],provider);
  const [f,t0,t1]=await Promise.all([pair.factory({blockTag}),pair.token0({blockTag}),pair.token1({blockTag})]);
  if(f.toLowerCase()!==row.factory.toLowerCase()||[t0.toLowerCase(),t1.toLowerCase()].sort().join('|')!==[row.token0.toLowerCase(),row.token1.toLowerCase()].sort().join('|'))return {...row,status:STATUS.FAILED,reason:'POOL_IDENTITY_MISMATCH',verified:false};
  return {...row,status:STATUS.VERIFIED,pool,verified:true,quoteVerified:false,executionEligible:false};
 }catch(e){return {...row,status:STATUS.FAILED,reason:'RPC_OR_CONTRACT_ERROR',error:String(e.shortMessage||e.message||e).slice(0,120),verified:false}}
}
async function audit(inputs,{providers={},verifyImpl=verifyV2,delayMs=250,waitImpl=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const {entries,invalidEntries,errors}=deduplicate(inputs);
 const results=[];
 for(const row of entries){
  const provider=providers[row.chainId];
  if(!provider){results.push({...row,status:STATUS.FAILED,reason:'CHAIN_RPC_NOT_CONFIGURED',verified:false});continue}
  await waitImpl(delayMs);
  results.push(await verifyImpl(provider,row));
 }
 return {build:'ARBIFLOW_DYNAMIC_DEX_REGISTRY_V1',mode:'READ_ONLY_PROTOCOL_ADAPTER_DISCOVERY_AUDIT',entriesDiscovered:inputs.length,uniqueEntries:entries.length,invalidEntries,invalidReasons:errors,contractsVerified:results.filter(r=>r.verified).length,quotesVerified:0,executionEligible:false,mainnetBroadcast:false,adapterTypes:ADAPTERS,results,limitations:['500_PLUS_DEX_COVERAGE_NOT_VERIFIED','V2_ONLY_ONCHAIN_VERIFICATION_IMPLEMENTED','NO_INDEXER_CONNECTOR_CONFIGURED','NO_QUOTES_OR_EXECUTION','NO_TVL_USD_ORACLE_VERIFIED']};
}
module.exports={ADAPTERS,STATUS,normalize,deduplicate,verifyV2,audit};
