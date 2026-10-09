'use strict';
const obs=require('./phase108-observations');
const safety={readOnly:true,mainnetBroadcast:false,executionEligible:false};
const rows=new Map(),MAX=300,TTL=1800000;
const err=e=>String(e?.shortMessage||e?.message||e).slice(0,180);
function prune(){const now=Date.now();for(const [k,v] of rows)if(now-v.firstSeenAtMs>TTL)rows.delete(k);while(rows.size>MAX)rows.delete(rows.keys().next().value);}
function track(swap){const hash=String(swap?.hash||'').toLowerCase();if(!/^0x[0-9a-f]{64}$/.test(hash))return false;prune();if(rows.has(hash))return false;rows.set(hash,{hash,router:swap.router,method:swap.method,tokenIn:swap.tokenIn||null,tokenOut:swap.tokenOut||null,indicativeImpactBps:Number.isFinite(swap.impact?.estimatedPriceImpactBps)?swap.impact.estimatedPriceImpactBps:null,impactModel:swap.impact?.model||null,firstSeenAtMs:obs.match(hash)?.firstSeenAtMs||Date.now(),status:'AWAITING_RECEIPT',checks:0,lastError:null,blockNumber:null,blockTimestamp:null,leadTimeToBlockMs:null,advanceVisibility:'NOT_ESTABLISHED'});prune();return true;}
function mount(app,{getBaseChain,rpc}){
 const state={running:false,checks:0,failures:0,lastRunAt:null,lastError:null};
 async function run(){if(state.running)return;state.running=true;state.checks++;state.lastRunAt=new Date().toISOString();
 try{const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');prune();
 for(const row of [...rows.values()].filter(r=>r.status==='AWAITING_RECEIPT').slice(0,20)){
 try{const receipt=await Promise.race([rpc(chain,'eth_getTransactionReceipt',[row.hash]),new Promise((_,reject)=>setTimeout(()=>reject(Error('RECEIPT_TIMEOUT')),20000))]);row.checks++;if(!receipt)continue;
 row.blockNumber=Number(BigInt(receipt.blockNumber));row.status=BigInt(receipt.status||'0x0')===1n?'CONFIRMED_SUCCESS':'CONFIRMED_REVERT';
 try{const block=await Promise.race([rpc(chain,'eth_getBlockByNumber',[receipt.blockNumber,false]),new Promise((_,reject)=>setTimeout(()=>reject(Error('BLOCK_TIMEOUT')),20000))]);if(block?.timestamp){const ms=Number(BigInt(block.timestamp))*1000;row.blockTimestamp=new Date(ms).toISOString();row.leadTimeToBlockMs=ms-row.firstSeenAtMs;row.advanceVisibility=ms>row.firstSeenAtMs?'OBSERVED_BEFORE_BLOCK_TIMESTAMP':'NOT_BEFORE_BLOCK_TIMESTAMP';}}catch(e){row.lastError=err(e);state.failures++;}
 }catch(e){row.lastError=err(e);state.failures++;state.lastError=row.lastError;}
 }
 }catch(e){state.failures++;state.lastError=err(e);}finally{state.running=false;}}
 app.get('/api/phase11/opportunities/status',(_req,res)=>{prune();const all=[...rows.values()];const candidates=all.filter(r=>r.status==='CONFIRMED_SUCCESS'&&r.indicativeImpactBps!==null).map(r=>({hash:r.hash,router:r.router,tokenIn:r.tokenIn,tokenOut:r.tokenOut,indicativeImpactPct:r.indicativeImpactBps/100,impactModel:r.impactModel,spreadPct:null,estimatedNetProfitUsd:null,risk:'UNASSESSED',qualified:false,reason:'CROSS_DEX_EXECUTABLE_QUOTES_GAS_FEES_AND_SLIPPAGE_NOT_VERIFIED'}));res.json({success:true,build:'11.6.0',tracked:all.length,impactCandidates:candidates.length,qualified:0,alerts:[],candidates:candidates.slice(-30),qualificationRules:{minimumSpreadPctExclusive:0.5,allowedRisk:['LOW','MEDIUM'],requiresPositiveNetProfit:true},limitations:['INDICATIVE_IMPACT_NOT_CROSS_DEX_SPREAD','NO_EXECUTABLE_QUOTES','NO_GAS_OR_SLIPPAGE_VALIDATION','NO_PROFIT_VALIDATION'],safety});});
 app.get('/api/phase11/receipts/status',(_req,res)=>{prune();const all=[...rows.values()];res.json({success:true,build:'11.6.0',...state,tracked:all.length,awaiting:all.filter(r=>r.status==='AWAITING_RECEIPT').length,confirmed:all.filter(r=>r.status==='CONFIRMED_SUCCESS').length,reverted:all.filter(r=>r.status==='CONFIRMED_REVERT').length,observedBeforeBlock:all.filter(r=>r.advanceVisibility==='OBSERVED_BEFORE_BLOCK_TIMESTAMP').length,rows:all.slice(-30).map(({firstSeenAtMs,...r})=>({...r,firstPendingObservedAt:new Date(firstSeenAtMs).toISOString()})),limitations:['PROCESS_LOCAL_TRACKING','RPC_PENDING_SAMPLE_NOT_FULL_MEMPOOL','BLOCK_TIMESTAMP_NOT_RECEIPT_ARRIVAL_TIME','NO_PROFIT_VALIDATION'],safety});});
 const timer=setInterval(()=>{run().catch(e=>{state.failures++;state.lastError=err(e);});},15000);timer.unref?.();
}
module.exports={mount,track};
