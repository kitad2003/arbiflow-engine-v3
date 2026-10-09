'use strict';
// One-shot historical arbitrage benchmark: 3 transactions, receipt + trace + token flow evidence.
// Never interpret multiple swaps as profitability. Fail closed if beneficiary or capital flows cannot be reconciled.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const HASHES=[
'0xe80ab3fe12460ae15d679d95c1fe62fd5bfb1a839250a4083fc31eb33161a503',
'0xdac116253b93f6a875792fe0a78801e9cb3c6941756452e781d6fb2066df1c6e',
'0xb8f1b9cab8bff9b83d30aeff17a2397b468e37a1b64df5b90d67252c14398b91'];
const SWAP=new ethers.Interface(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
const TRANSFER=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const V3SWAP=SWAP.getEvent('Swap').topicHash,ERC20=TRANSFER.getEvent('Transfer').topicHash;
function error(x){return String(x?.shortMessage||x?.message||x).slice(0,160)}
async function main(){
 const url=process.env.ETHEREUM_RPC_URL;
 assert(/^https:\/\//.test(url||''),'ETHEREUM_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(url,1,{staticNetwork:true}),results=[];
 try{
  assert.equal((await p.getNetwork()).chainId,1n);
  for(const hash of HASHES){
   const row={hash,verdict:'BLOCKED',reason:null,traceAvailable:false,preTransactionStateReconstructed:false,
    recognizedHistoricalProfit:false,detectableByArbiflow:false,atomicReplaySucceeded:false,gasPaidWei:null};
   try{
    const [tx,receipt]=await Promise.all([p.getTransaction(hash),p.getTransactionReceipt(hash)]);
    if(!tx||!receipt){row.reason='HISTORICAL_TRANSACTION_UNAVAILABLE';results.push(row);continue}
    row.block=receipt.blockNumber;row.txIndex=receipt.index;row.status=Number(receipt.status);
    row.gasUsed=receipt.gasUsed.toString();row.gasPriceWei=receipt.gasPrice?.toString()||null;
    row.gasPaidWei=receipt.gasPrice?(receipt.gasUsed*receipt.gasPrice).toString():null;
    row.sender=tx.from;row.target=tx.to;
    row.swapEvents=[];row.transferEvents=[];
    for(const log of receipt.logs){
     if(log.topics[0]===V3SWAP){try{const z=SWAP.parseLog(log);row.swapEvents.push({pool:log.address,amount0:z.args.amount0.toString(),amount1:z.args.amount1.toString(),sender:z.args.sender,recipient:z.args.recipient})}catch{}}
     if(log.topics[0]===ERC20){try{const z=TRANSFER.parseLog(log);row.transferEvents.push({token:log.address,from:z.args.from,to:z.args.to,amount:z.args.value.toString()})}catch{}}
    }
    // Reconcile receipt-level ERC20 flows by address and token. This is an observed
    // transfer delta, NOT economic profit or proof of the final beneficiary.
    const balances=new Map(),transferErrors=[];
    for(const t of row.transferEvents){
      try{
        const amount=BigInt(t.amount),token=t.token.toLowerCase();
        for(const [addr,delta] of [[t.from,-amount],[t.to,amount]]){
          const key=addr.toLowerCase()+'|'+token;
          balances.set(key,(balances.get(key)||0n)+delta);
        }
      }catch(x){transferErrors.push(error(x))}
    }
    const byAddress=new Map();
    for(const [key,delta] of balances){
      if(delta===0n)continue;
      const [address,token]=key.split('|');
      if(!byAddress.has(address))byAddress.set(address,[]);
      byAddress.get(address).push({token,netTransferRaw:delta.toString()});
    }
    const poolAddresses=new Set(row.swapEvents.map(x=>x.pool.toLowerCase()));
    const involvement=new Map();
    for(const t of row.transferEvents){
      for(const address of [t.from,t.to]){
        const a=address.toLowerCase();
        involvement.set(a,(involvement.get(a)||0)+1);
      }
    }
    row.transferFlow={
      method:'ERC20_TRANSFER_EVENTS_ONLY',
      tokenCount:new Set(row.transferEvents.map(t=>t.token.toLowerCase())).size,
      uniqueAddresses:byAddress.size,
      transferParseErrors:transferErrors,
      senderNetTransfers:byAddress.get(tx.from.toLowerCase())||[],
      targetNetTransfers:tx.to?(byAddress.get(tx.to.toLowerCase())||[]):[],
      nonPoolAddressDeltas:[...byAddress].filter(([address])=>!poolAddresses.has(address))
        .sort((a,b)=>(involvement.get(b[0])||0)-(involvement.get(a[0])||0))
        .slice(0,20).map(([address,deltas])=>({address,transferEventsInvolved:involvement.get(address)||0,deltas})),
      limitation:'Transfer sums do not reveal net economic profit, ETH internal transfers, assets not emitting Transfer, off-transaction repayments, or the true beneficiary'
    };
    row.swapCount=row.swapEvents.length;row.transferCount=row.transferEvents.length;
    row.distinctPools=new Set(row.swapEvents.map(s=>s.pool.toLowerCase())).size;
    row.firstLevelCandidate=row.distinctPools>=2;
    // Execution traces are needed to assign beneficiary and explain intermediate contract/token flows.
    // Some RPC providers prohibit debug_traceTransaction; don't call it "unprofitable" when unavailable.
    try{
     const trace=await p.send('debug_traceTransaction',[hash,{tracer:'callTracer',timeout:'10s'}]);
     row.traceAvailable=!!trace;row.traceCallType=trace?.type||null;
    }catch(x){row.traceError=error(x)}
    row.reason=row.firstLevelCandidate?'BENEFICIARY_NET_PROFIT_AND_SAME_BLOCK_STATE_NOT_RECONCILED':'NOT_VERIFIED_ARBITRAGE_MULTIPOOL_PATTERN';
    // No PASS verdict without net beneficiary flow, historical detection and full atomic replay.
    if(row.status===0){row.verdict='FAIL';row.reason='ORIGINAL_TRANSACTION_REVERTED'}
    else if(!row.firstLevelCandidate){row.verdict='FAIL';row.reason='NO_MULTIPOOL_PATTERN_IN_RECEIPT'}
    else {row.verdict='BLOCKED';row.reason=row.traceAvailable?'TRANSFER_FLOW_RECONSTRUCTED_BENEFICIARY_AND_REPLAY_UNVERIFIED':'TRANSFER_FLOW_RECONSTRUCTED_TRACE_AND_REPLAY_UNAVAILABLE'}
   }catch(x){row.reason='RPC_OR_DECODING_ERROR';row.error=error(x)}
   results.push(row);
  }
  const overall=results.every(r=>r.verdict==='PASS')?'PASS':results.some(r=>r.verdict==='PASS')?'PARTIAL_PASS':results.some(r=>r.verdict==='BLOCKED')?'BLOCKED':'FAIL';
  const out={build:'12.9.82.1',mode:'THREE_TRANSACTION_HISTORICAL_BENCHMARK',overall,transactions:results,
   passCount:results.filter(x=>x.verdict==='PASS').length,failCount:results.filter(x=>x.verdict==='FAIL').length,blockedCount:results.filter(x=>x.verdict==='BLOCKED').length,
   conclusion:'Historical receipts are evidence, not proof of realized arbitrage profit. No replay or profitable trade is claimed.',
   nextRequired:'Verified beneficiary net token flows, pre-transaction state, funding cost and atomic fork replay',
   alerts:[],qualified:0,readOnly:true,mainnetBroadcast:false,executionEligible:false,fundsMovedOnMainnet:false};
  fs.writeFileSync('arbiflow-one-shot-benchmark-12982.json',JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({...out,transactions:results.map(x=>({hash:x.hash,verdict:x.verdict,reason:x.reason,block:x.block,swapCount:x.swapCount,distinctPools:x.distinctPools,transferCount:x.transferCount,traceAvailable:x.traceAvailable,gasPaidWei:x.gasPaidWei,transferFlow:x.transferFlow}))}));
  return out;
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(HASHES.length,3);assert(HASHES.every(x=>ethers.isHexString(x,32)));console.log(JSON.stringify({build:'12.9.82.1',unitAssertionsPassed:2}));
 main().catch(e=>{console.error('BENCHMARK_12982_FAILED',error(e));process.exitCode=1})}
module.exports={main};
