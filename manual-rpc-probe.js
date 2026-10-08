"use strict";
// Only a single manually requested eth_chainId JSON-RPC read.
const envNames = Object.freeze({bnb:['BNB_RPC_URL','BSC_RPC_URL'],ethereum:['ETHEREUM_RPC_URL'],zksync:['ZKSYNC_RPC_URL'],hyperevm:['HYPEREVM_RPC_URL'],monad:['MONAD_RPC_URL']});
function rpcEnvironmentNames(key){return envNames[key] || [key.toUpperCase()+'_RPC_URL'];}
async function probeEvmChain({url,expectedChainId}){
  let parsed;
  try { parsed=new URL(url); if(parsed.protocol!=='https:') throw Error('invalid protocol'); }
  catch {return {reachable:false,chainIdMatches:false,status:'INVALID_RPC_URL'};}
  // Prevent using this public endpoint to probe arbitrary internal addresses.
  const host=parsed.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host==='0.0.0.0'||host.startsWith('127.')||host.startsWith('10.')||host.startsWith('192.168.')||host.startsWith('169.254.')||host.startsWith('172.')||host==='[::1]'||host==='::1'||/^\d+\.\d+\.\d+\.\d+$/.test(host)) return {reachable:false,chainIdMatches:false,status:'RPC_HOST_NOT_ALLOWED'};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);
  try {
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:controller.signal});
    if(response.status===429)return {reachable:false,chainIdMatches:false,status:'RATE_LIMITED'};
    if(!response.ok)return {reachable:false,chainIdMatches:false,status:'HTTP_ERROR',httpStatus:response.status};
    const data=await response.json();
    const reportedChainId=typeof data.result==='string' && /^0x[0-9a-f]+$/i.test(data.result)?Number.parseInt(data.result,16):null;
    if(!Number.isSafeInteger(reportedChainId))return {reachable:false,chainIdMatches:false,status:'INVALID_RPC_RESPONSE'};
    return {reachable:true,reportedChainId,chainIdMatches:reportedChainId===expectedChainId,status:reportedChainId===expectedChainId?'VERIFIED':'CHAIN_ID_MISMATCH'};
  }catch(e){return {reachable:false,chainIdMatches:false,status:e?.name==='AbortError'?'TIMEOUT':'RPC_REQUEST_FAILED'};}
  finally{clearTimeout(timer);}
}
module.exports={probeEvmChain,rpcEnvironmentNames};
