'use strict';
// Read-only eth_call preflight. Does not send a transaction, authenticate calldata,
// or claim atomic arbitrage profit. Requires a pinned block hash before and after.
async function simulateResearchTransaction({provider,transaction,expectedChainId,blockNumber,blockHash}={}){
 const base={simulated:false,readOnly:true,executionEligible:false,alertEligible:false,profitVerified:false};
 const hash=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{64}$/.test(x);
 const address=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x);
 if(!provider||typeof provider.getNetwork!=='function'||typeof provider.getBlock!=='function'||typeof provider.send!=='function'||typeof provider.getCode!=='function')return {...base,reason:'INVALID_PROVIDER'};
 if(!Number.isSafeInteger(expectedChainId)||expectedChainId<=0||!Number.isSafeInteger(blockNumber)||blockNumber<0||!hash(blockHash))return {...base,reason:'INVALID_BLOCK_CONTEXT'};
 if(transaction&&Object.keys(transaction).some(k=>!['to','from','data','value'].includes(k)))return {...base,reason:'UNSUPPORTED_TRANSACTION_FIELDS'};
 if(!transaction||!address(transaction.to)||typeof transaction.data!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(transaction.data)||(transaction.from!==undefined&&!address(transaction.from))||(transaction.value!==undefined&&!/^[0-9]+$/.test(String(transaction.value))))return {...base,reason:'INVALID_TRANSACTION'};
 try{
  const network=await provider.getNetwork();
  if(Number(network.chainId)!==expectedChainId)return {...base,reason:'CHAIN_MISMATCH'};
  const before=await provider.getBlock(blockNumber);
  if(!before||before.number!==blockNumber||!hash(before.hash)||before.hash.toLowerCase()!==blockHash.toLowerCase())return {...base,reason:'BLOCK_CONTEXT_MISMATCH'};
  const code=await provider.getCode(transaction.to,blockNumber);
  const codeBlock=await provider.getBlock(blockNumber);
  if(!codeBlock||codeBlock.number!==blockNumber||!hash(codeBlock.hash)||codeBlock.hash.toLowerCase()!==blockHash.toLowerCase())return {...base,reason:'BLOCK_REORG_DURING_CODE_CHECK'};
  if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code))return {...base,reason:'TARGET_CONTRACT_CODE_MISSING'};
  let output,callFailed=false;
  // EIP-1898 blockHash pinning prevents the call from silently using a different block at the same height.
  const rpcTx={to:transaction.to,data:transaction.data};
  if(transaction.from!==undefined)rpcTx.from=transaction.from;
  if(transaction.value!==undefined)rpcTx.value='0x'+BigInt(transaction.value).toString(16);
  try{output=await provider.send('eth_call',[rpcTx,{blockHash:blockHash.toLowerCase(),requireCanonical:true}])}catch{callFailed=true}
  const after=await provider.getBlock(blockNumber);
  if(!after||after.number!==blockNumber||!hash(after.hash)||after.hash.toLowerCase()!==blockHash.toLowerCase())return {...base,reason:'BLOCK_REORG_DURING_SIMULATION'};
  if(callFailed)return {...base,reason:'ETH_CALL_REVERTED_OR_FAILED'};
  if(typeof output!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(output))return {...base,reason:'INVALID_CALL_RESULT'};
  return {...base,simulated:true,reason:'READ_ONLY_ETH_CALL_SUCCEEDED',chainId:expectedChainId,blockNumber,blockHash:blockHash.toLowerCase(),returnData:output,limitations:['eth_call success is not atomic bundle execution','Pending state, ordering, inclusion and MEV competition not modeled','No verified net profit or permission to broadcast']};
 }catch{return {...base,reason:'PROVIDER_SIMULATION_FAILED'}}
}
module.exports={simulateResearchTransaction};
