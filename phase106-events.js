'use strict';
// Phase 10.7: bounded confirmed swap monitoring; cursor is process-local, not durable storage.
const {Interface,id}=require('ethers');
const pendingObservations=require('./phase108-observations');
const FACTORY='0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const factory=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const swap=new Interface(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
const TOPIC=id('Swap(address,address,int256,int256,uint160,uint128,int24)');
const ZERO='0x0000000000000000000000000000000000000000';
const safety={readOnly:true,mainnetBroadcast:false,executionEligible:false};
const err=e=>String(e?.shortMessage||e?.message||e).slice(0,400);
const hex=n=>'0x'+n.toString(16);
function mount(app,{getBaseChain,rpc}){
 const state={running:false,checks:0,lastResult:null,cursors:{},recentKeys:[],totalUniqueEvents:0,autoChecks:0,manualChecks:0,autoFailures:0,autoLastRunAt:null,autoLastError:null,cumulative:{swapEvents:0,uniqueSwapTransactions:0,matchedTransactions:0,observedBeforeBlockTransactions:0},recentTransactions:[],autoScanning:{enabled:true,intervalMs:10000,processLocal:true,maxBlocksPerPoolPerCycle:30,maxBatchesPerPoolPerCycle:3}};
 const seen=new Set();const seenTransactions=new Set();const blockTimestamps=new Map();
 async function blockTimestamp(chain,number){if(blockTimestamps.has(number))return blockTimestamps.get(number);const b=await rpc(chain,'eth_getBlockByNumber',[hex(number),false]);const timestamp=b?.timestamp?Number(BigInt(b.timestamp))*1000:null;if(timestamp!==null){blockTimestamps.set(number,timestamp);if(blockTimestamps.size>100)blockTimestamps.delete(blockTimestamps.keys().next().value);}return timestamp;}
 app.get('/api/phase10/events/status',(_req,res)=>res.json({success:true,build:'11.4.0',running:state.running,checks:state.checks,cursors:state.cursors,totalUniqueEvents:state.totalUniqueEvents,cumulative:state.cumulative,cumulativeMatchRatePct:state.cumulative.uniqueSwapTransactions?Math.round(10000*state.cumulative.matchedTransactions/state.cumulative.uniqueSwapTransactions)/100:null,autoChecks:state.autoChecks,manualChecks:state.manualChecks,autoFailures:state.autoFailures,autoLastRunAt:state.autoLastRunAt,autoLastError:state.autoLastError,autoScanning:state.autoScanning,sharedPendingObservationStore:pendingObservations.stats(),lastResult:state.lastResult,safety}));
 async function runProbe(res,source='manual'){
  if(state.running){if(res)return res.status(409).json({success:false,error:'PROBE_RUNNING'});return;}
  if(source==='auto'){state.autoChecks++;state.autoLastRunAt=new Date().toISOString();}else state.manualChecks++;
  state.running=true;state.checks++;
  try{
   const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');
   const latest=Number(BigInt(await rpc(chain,'eth_blockNumber',[])));
   const pools=[],observations=[],logDiagnostics=[];const pendingStoreAtScanStart=pendingObservations.stats();
   let logFailures=0,duplicatesSkipped=0,scannedBlocks=0,matchedPendingSwaps=0,unmatchedConfirmedSwaps=0,observedBeforeBlock=0,uniqueSwapTransactions=0,matchedPendingTransactions=0,observedBeforeBlockTransactions=0;
   for(const fee of [500,3000]){
    const pool={fee};
    try{
     const result=await rpc(chain,'eth_call',[{to:FACTORY,data:factory.encodeFunctionData('getPool',[USDC,WETH,fee])},'latest']);
     const [address]=factory.decodeFunctionResult('getPool',result);
     if(address.toLowerCase()===ZERO){pool.error='POOL_NOT_FOUND';pools.push(pool);continue;}
     pool.address=address;
     const key=address.toLowerCase();
     // Initial probe: last ten blocks. Subsequent probes: resume after successful range.
     const previous=state.cursors[key];
     const from=previous===undefined?Math.max(0,latest-9):previous+1;
     const to=Math.min(latest,from+29);
     pool.fromBlock=from;pool.toBlock=to;
     pool.remainingBlocks=Math.max(0,latest-to);
     if(from>latest){pool.logQuery='UP_TO_DATE';pools.push(pool);continue;}
     let logs;
     try{
      logs=[];
      for(let start=from;start<=to;start+=10){const end=Math.min(to,start+9);const batch=await rpc(chain,'eth_getLogs',[{address,fromBlock:hex(start),toBlock:hex(end),topics:[TOPIC]}]);if(!Array.isArray(batch))throw Error('INVALID_LOGS');logs.push(...batch);pool.batchesCompleted=(pool.batchesCompleted||0)+1;}
      pool.logQuery='BOUNDED_10_BLOCK_BATCHES';
     }catch(e){
      logDiagnostics.push({fee,attempt:'BOUNDED_10_BLOCK_BATCHES',error:err(e)});
      // Only advance the cursor for the actual successfully queried range.
      logs=await rpc(chain,'eth_getLogs',[{address,fromBlock:hex(from),toBlock:hex(from),topics:[TOPIC]}]);
      pool.logQuery='SINGLE_BLOCK_FALLBACK';pool.toBlock=from;
      pool.remainingBlocks=Math.max(0,latest-from);
     }
     if(!Array.isArray(logs))throw Error('INVALID_LOGS');
     const parsed=[];
     for(const log of logs){
      const event=swap.parseLog(log);
      if(!event)continue;
      const unique=String(log.blockHash||log.blockNumber)+'|'+String(log.transactionHash)+'|'+String(log.logIndex??log.index??'0');
      const observed=pendingObservations.match(log.transactionHash);
      const confirmedObservedAtMs=Date.now();
      const confirmedBlockTimestampMs=observed?await blockTimestamp(chain,Number(BigInt(log.blockNumber))):null;
      const advanceVisibility=observed&&confirmedBlockTimestampMs!==null?(observed.firstSeenAtMs<confirmedBlockTimestampMs?'OBSERVED_BEFORE_BLOCK_TIMESTAMP':'NOT_BEFORE_BLOCK_TIMESTAMP'):'NOT_ESTABLISHED';
      parsed.push({unique,record:{advanceVisibility,confirmedBlockTimestamp:confirmedBlockTimestampMs===null?null:new Date(confirmedBlockTimestampMs).toISOString(),leadTimeToBlockMs:observed&&confirmedBlockTimestampMs!==null?confirmedBlockTimestampMs-observed.firstSeenAtMs:null,pendingMatch:observed?'OBSERVED_IN_PENDING_SAMPLE':'NOT_OBSERVED_IN_PENDING_SAMPLE',firstPendingObservedAt:observed?new Date(observed.firstSeenAtMs).toISOString():null,observationAgeMs:observed?Math.max(0,confirmedObservedAtMs-observed.firstSeenAtMs):null,pool:address,fee,transactionHash:log.transactionHash,blockNumber:Number(BigInt(log.blockNumber)),logIndex:log.logIndex??log.index??null,amount0Raw:event.args.amount0.toString(),amount1Raw:event.args.amount1.toString(),sqrtPriceX96After:event.args.sqrtPriceX96.toString(),status:'CONFIRMED_SWAP_EVENT_NOT_PREDICTED'}});
     }
     // Successful response and parsing only: commit cursor and dedup state.
     state.cursors[key]=pool.toBlock;
     scannedBlocks+=pool.toBlock-from+1;
     pool.eventsInRange=parsed.length;
     for(const entry of parsed){
      if(seen.has(entry.unique)){duplicatesSkipped++;continue;}
      seen.add(entry.unique);state.recentKeys.push(entry.unique);
      if(state.recentKeys.length>2000)seen.delete(state.recentKeys.shift());
      state.totalUniqueEvents++;state.cumulative.swapEvents++;const txKey=entry.record.transactionHash.toLowerCase();if(!seenTransactions.has(txKey)){seenTransactions.add(txKey);state.recentTransactions.push(txKey);if(state.recentTransactions.length>10000)seenTransactions.delete(state.recentTransactions.shift());uniqueSwapTransactions++;state.cumulative.uniqueSwapTransactions++;if(entry.record.pendingMatch==='OBSERVED_IN_PENDING_SAMPLE'){matchedPendingTransactions++;state.cumulative.matchedTransactions++;}if(entry.record.advanceVisibility==='OBSERVED_BEFORE_BLOCK_TIMESTAMP'){observedBeforeBlockTransactions++;state.cumulative.observedBeforeBlockTransactions++;}}if(entry.record.pendingMatch==='OBSERVED_IN_PENDING_SAMPLE')matchedPendingSwaps++;else unmatchedConfirmedSwaps++;if(entry.record.advanceVisibility==='OBSERVED_BEFORE_BLOCK_TIMESTAMP')observedBeforeBlock++;observations.push(entry.record);
     }
    }catch(e){logFailures++;pool.error=err(e);logDiagnostics.push({fee,attempt:'POOL_SCAN',error:err(e)});}
    pools.push(pool);
   }
   state.lastResult={success:logFailures===0,build:'11.4.0',chainId:8453,latestBlock:latest,pools,scannedBlocks,confirmedSwapEvents:observations.length,matchedPendingSwaps,unmatchedConfirmedSwaps,observedBeforeBlock,scanSource:source,uniqueSwapTransactions,matchedPendingTransactions,observedBeforeBlockTransactions,transactionMatchRatePct:uniqueSwapTransactions?Math.round(matchedPendingTransactions/uniqueSwapTransactions*10000)/100:null,cumulative:{...state.cumulative},cumulativeMatchRatePct:state.cumulative.uniqueSwapTransactions?Math.round(state.cumulative.matchedTransactions/state.cumulative.uniqueSwapTransactions*10000)/100:null,matchRatePct:observations.length?Math.round(matchedPendingSwaps/observations.length*10000)/100:null,pendingObservationStore:pendingObservations.stats(),pendingStoreAtScanStart,visibilityDiagnostic:pendingStoreAtScanStart.stored===0?'NO_PENDING_HASHES_AT_SCAN_START':matchedPendingTransactions===0?'PENDING_HASHES_PRESENT_BUT_NO_CONFIRMED_TX_MATCH':'CONFIRMED_TX_HASH_MATCH_OBSERVED',observations:observations.slice(-30),duplicatesSkipped,totalUniqueEvents:state.totalUniqueEvents,cursors:state.cursors,logFailures,logDiagnostics,pendingHashMatchingImplemented:true,predictionMatchingImplemented:false,limitations:['CURSORS_RESET_ON_RESTART','MAX_10_BLOCKS_PER_RPC_REQUEST','CATCHUP_REQUIRES_REPEATED_PROBES','CONFIRMED_EVENTS_ONLY','PENDING_HASH_MATCHING_REQUIRES_PRIOR_PENDING_PROBES','BLOCK_TIMESTAMP_NOT_LOCAL_RECEIPT_TIME','MATCH_RATE_IS_SAMPLED_NOT_NETWORK_WIDE','CUMULATIVE_COUNTS_RESET_ON_RESTART','SCAN_BACKLOG_MAY_GROW_IF_RPC_SLOW','CUMULATIVE_MATCHES_ARE_UNIQUE_TRANSACTIONS_NOT_SWAP_LOGS','NO_PROFIT_VALIDATION'],safety};
  }catch(e){if(source==='auto'){state.autoFailures++;state.autoLastError=err(e);}state.lastResult={success:false,build:'11.4.0',error:err(e),safety};}
  finally{state.running=false;}
  if(res)res.json(state.lastResult);
 }
 app.get('/api/phase10/events/probe',async(_req,res)=>runProbe(res,'manual'));
 const autoTimer=setInterval(()=>{runProbe(null,'auto').catch(e=>{state.autoFailures++;state.autoLastError=err(e);});},10000);
 autoTimer.unref?.();
}
module.exports={mount};
