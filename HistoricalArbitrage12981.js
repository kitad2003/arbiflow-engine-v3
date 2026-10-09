'use strict';
// ArbiFlow 12.9.81 historical arbitrage evidence investigator.
// Looks for transactions touching >=2 distinct, verified Uniswap V3 pools;
// never assumes multiple swaps == arbitrage or that token transfers == profit.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const CHAINS={
 ethereum:{chainId:1,env:'ETHEREUM_RPC_URL',factory:'0x1F98431c8aD98523631AE4a59f267346ea31F984',tokens:[['GHO','0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f'],['USDC','0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],['WETH','0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2']]},
 base:{chainId:8453,env:'BASE_RPC_URL',factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',tokens:[['USDC','0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],['WETH','0x4200000000000000000000000000000000000006'],['cbBTC','0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf']]}
};
const FEES=[100,500,3000,10000];
const FABI=['function getPool(address,address,uint24) view returns(address)'];
const SWAP='event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)';
const TRANSFER='event Transfer(address indexed from,address indexed to,uint256 value)';
const SWAP_TOPIC=ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)');
const TIFACE=new ethers.Interface([TRANSFER]);
const BLOCKS=Number(process.env.HISTORICAL_ARB_BLOCKS||120),CHUNK=Number(process.env.HISTORICAL_ARB_LOG_CHUNK||10),CAP=Number(process.env.HISTORICAL_ARB_TX_CAP||30);
const optTx=(process.env.HISTORICAL_ARB_TX_HASHES||'').split(',').map(x=>x.trim()).filter(Boolean);
function msg(e){return String(e?.shortMessage||e?.message||e).slice(0,140)}
function flatten(t,out=[]){if(!t||typeof t!=='object')return out;out.push({from:t.from,to:t.to,type:t.type,value:t.value,error:t.error});for(const c of t.calls||[])flatten(c,out);return out;}
function classify(swaps,transfers,traceAvailable){
 return {multiplePoolSwaps:swaps.length>=2&&new Set(swaps.map(s=>s.pool.toLowerCase())).size>=2,
  preliminaryArbitrageCandidate:swaps.length>=2&&new Set(swaps.map(s=>s.pool.toLowerCase())).size>=2,
  verifiedArbitrage:false,verifiedNetProfit:false,
  reason:traceAvailable?'MULTI_POOL_SWAPS_NOT_SUFFICIENT_TO_PROVE_PROFIT':'RECEIPT_ONLY_NO_COMPLETE_FLOW_OR_TRACE'};
}
async function scan(name,config,rpc){
 const provider=new ethers.JsonRpcProvider(rpc,config.chainId,{staticNetwork:true});
 const o={chain:name,chainId:config.chainId,block:null,pools:[],blockRange:null,logCalls:0,logFailures:0,swapLogs:0,
  transactionsObserved:0,multiPoolCandidates:0,transactions:[],errors:[],discoveryComplete:false,
  traceSupport:'UNTESTED',historicalReplayVerified:false,verifiedProfits:0};
 try{
  assert.equal(Number((await provider.getNetwork()).chainId),config.chainId);
  const block=await provider.getBlockNumber();o.block=block;
  const factory=new ethers.Contract(config.factory,FABI,provider);
  for(let i=0;i<config.tokens.length;i++)for(let j=i+1;j<config.tokens.length;j++){
   const [nameA,a]=config.tokens[i],[nameB,b]=config.tokens[j];
   for(const fee of FEES){
    try{const pool=await factory.getPool(a,b,fee,{blockTag:block});
     if(pool!==ethers.ZeroAddress&&await provider.getCode(pool,block)!=='0x')
      o.pools.push({pool,pair:nameA+'/'+nameB,fee});
    }catch(e){o.errors.push({stage:'POOL',pair:nameA+'/'+nameB,fee,error:msg(e)})}
   }
  }
  const from=Math.max(0,block-BLOCKS+1);o.blockRange=[from,block];
  const poolMap=new Map(o.pools.map(x=>[x.pool.toLowerCase(),x]));
  const txSwaps=new Map();
  for(let start=from;start<=block;start+=CHUNK){
   if(o.pools.length===0)break;
   const end=Math.min(block,start+CHUNK-1);o.logCalls++;
   try{const logs=await provider.getLogs({address:o.pools.map(x=>x.pool),topics:[SWAP_TOPIC],fromBlock:start,toBlock:end});
    o.swapLogs+=logs.length;
    for(const l of logs){
     const key=l.transactionHash.toLowerCase();
     if(!txSwaps.has(key))txSwaps.set(key,[]);
     txSwaps.get(key).push({pool:l.address,pair:poolMap.get(l.address.toLowerCase())?.pair,blockNumber:l.blockNumber,logIndex:l.index});
    }
   }catch(e){o.logFailures++;o.errors.push({stage:'LOG',from:start,to:end,error:msg(e)})}
  }
  // Explicit hashes permit deeper replay research even if they are outside the recent log window.
  for(const hash of optTx)if(ethers.isHexString(hash,32)&&!txSwaps.has(hash.toLowerCase()))txSwaps.set(hash.toLowerCase(),[]);
  const ranked=[...txSwaps.entries()].sort((a,b)=>b[1].length-a[1].length);
  const shortlist=ranked.filter(([hash,swaps])=>swaps.length>=2||optTx.some(t=>t.toLowerCase()===hash)).slice(0,CAP);
  o.transactionsObserved=txSwaps.size;
  for(const [hash,foundSwaps] of shortlist){
   try{
    const receipt=await provider.getTransactionReceipt(hash),tx=await provider.getTransaction(hash);
    if(!receipt||!tx){o.errors.push({stage:'TX_MISSING',hash});continue}
    const swaps=receipt.logs.filter(x=>x.topics[0]===SWAP_TOPIC&&poolMap.has(x.address.toLowerCase()))
     .map(x=>({pool:x.address,pair:poolMap.get(x.address.toLowerCase())?.pair,logIndex:x.index}));
    const transfers=receipt.logs.filter(x=>x.topics[0]===TIFACE.getEvent('Transfer').topicHash).map(x=>{
      try{const d=TIFACE.parseLog(x);return {token:x.address,from:d.args.from,to:d.args.to,amountRaw:d.args.value.toString()}}catch{return null}
    }).filter(Boolean);
    let trace=null,traceError=null;
    try{trace=await provider.send('debug_traceTransaction',[hash,{tracer:'callTracer',timeout:'8s'}]);o.traceSupport='AVAILABLE'}
    catch(e){traceError=msg(e);if(o.traceSupport!=='AVAILABLE')o.traceSupport='UNAVAILABLE_OR_FAILED'}
    const diagnosis=classify(swaps,transfers,!!trace);
    if(diagnosis.preliminaryArbitrageCandidate)o.multiPoolCandidates++;
    o.transactions.push({hash,blockNumber:receipt.blockNumber,transactionIndex:receipt.index,
      status:Number(receipt.status),gasUsed:receipt.gasUsed.toString(),effectiveGasPriceWei:receipt.gasPrice?.toString()||null,
      sender:tx.from,to:tx.to,swapCount:swaps.length,swaps,transfers:transfers.slice(0,70),transferCount:transfers.length,
      traceAvailable:!!trace,traceCallCount:trace?flatten(trace).length:null,traceError,diagnosis,
      preTransactionStateReconstructed:false,profitCurrency:null,netProfitRaw:null,
      reason:'No token-level beneficiary balance reconciliation; same-block prior transactions and funding costs not reconstructed'});
   }catch(e){o.errors.push({stage:'TX',hash,error:msg(e)})}
  }
  o.discoveryComplete=o.logFailures===0&&o.errors.filter(e=>['POOL','LOG'].includes(e.stage)).length===0;
  return o;
 }finally{provider.destroy()}
}
async function main(){
 assert(Number.isInteger(BLOCKS)&&BLOCKS>=10&&BLOCKS<=1000,'INVALID_BLOCKS');
 assert(Number.isInteger(CHUNK)&&CHUNK>=1&&CHUNK<=100,'INVALID_CHUNK');
 assert(Number.isInteger(CAP)&&CAP>=1&&CAP<=100,'INVALID_CAP');
 const results=[];
 for(const [name,config] of Object.entries(CHAINS)){
  const rpc=process.env[config.env];
  if(!rpc){results.push({chain:name,status:'NOT_TESTED_RPC_MISSING',required:config.env});continue}
  try{results.push(await scan(name,config,rpc))}
  catch(e){results.push({chain:name,status:'SCAN_FAILED',error:msg(e)});process.exitCode=1}
 }
 const report={build:'12.9.81',mode:'HISTORICAL_ARBITRAGE_EVIDENCE_FIRST_PASS',results,
  replayVerified:false,positiveProfitVerified:false,verifiedHistoricalArbitrages:0,
  requiredNextSteps:['IDENTIFY_REAL_ARB_BENEFICIARY_AND_NET_TOKEN_BALANCE_DELTAS','RECONSTRUCT_PRE_TRANSACTION_STATE_AT_TX_INDEX','REPLAY_SAME_BLOCK_PRIOR_TXS','VALIDATE_TRACE_SUPPORT_AND_GAS_COSTS'],
  alerts:[],qualified:0,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
 fs.writeFileSync('arbiflow-historical-arbitrage-12981.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,results:results.map(r=>({...r,transactions:r.transactions?.map(t=>({hash:t.hash,swapCount:t.swapCount,blockNumber:t.blockNumber,traceAvailable:t.traceAvailable,diagnosis:t.diagnosis})).slice(0,15)}))}));
 if(results.every(r=>r.status==='NOT_TESTED_RPC_MISSING'||r.status==='SCAN_FAILED'))process.exitCode=1;
 return report;
}
if(require.main===module){assert.equal(FEES.length,4);assert.equal(classify([{pool:'a'},{pool:'b'}],[],false).verifiedArbitrage,false);console.log(JSON.stringify({build:'12.9.81',unitAssertionsPassed:2}));
 main().catch(e=>{console.error('HISTORICAL_ARB_12981_FAILED',msg(e));process.exitCode=1})}
module.exports={main,classify,flatten};
