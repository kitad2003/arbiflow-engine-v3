'use strict';
// Phase 10.1: read-only pending-block classification. RPC pending view is not the full mempool.
const {Interface}=require('ethers');
const {simulateAerodrome}=require('./phase102-impact');
const pendingObservations=require('./phase108-observations');
const receiptTracker=require('./phase115-receipts');
const v3Inspector=require('./phase117-v3');
const pairDiscovery=require('./phase118-pairs');
const spotDiagnostic=require('./phase120-spot');
const aaveProbe=require('./phase122-aave');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const routerRegistry={
 UNISWAP_ROUTER_02:'0x2626664c2603336e57b271c5c0b26f421741e481',
 AERODROME_ROUTER:'0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43'
};
const known=new Map(Object.entries(routerRegistry).map(([name,address])=>[address.toLowerCase(),name]));
const uni=new Interface([
 'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns(uint256)',
 'function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params) payable returns(uint256)',
 'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns(uint256)',
 'function multicall(bytes[] data) payable returns(bytes[] results)',
 'function multicall(uint256 deadline,bytes[] data) payable returns(bytes[] results)'
]);
const aero=new Interface([
 'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns(uint256[])',
 'function swapExactETHForTokens(uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) payable returns(uint256[])',
 'function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns(uint256[])'
]);
const BASE_USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BASE_WETH='0x4200000000000000000000000000000000000006';
const erc20Selectors={'0xa9059cbb':'TRANSFER','0x23b872dd':'TRANSFER_FROM','0x095ea7b3':'APPROVE'};
const targetAddress=tx=>String(tx.to||'').toLowerCase();
const safeError=e=>String(e?.shortMessage||e?.message||e).slice(0,160);
function decode(tx,routerName){
 const iface=routerName==='UNISWAP_ROUTER_02'?uni:aero;
 try{
  const parsed=iface.parseTransaction({data:tx.input,value:tx.value||'0x0'});
  if(!parsed)return {classification:'UNSUPPORTED_METHOD',methodSelector:String(tx.input).slice(0,10)};
  const p=parsed.args[0];
  const base={classification:'SUPPORTED_SWAP_METHOD',method:parsed.name};
  if(parsed.name==='exactInputSingle'||parsed.name==='exactOutputSingle'){
   return {...base,fee:Number(p.fee),tokenIn:p.tokenIn,tokenOut:p.tokenOut,amountInRaw:p.amountIn?.toString()||null,amountOutRaw:p.amountOut?.toString()||null,amountOutMinimumRaw:p.amountOutMinimum?.toString()||null,amountInMaximumRaw:p.amountInMaximum?.toString()||null};
  }
  if(parsed.name==='exactInput')return {...base,amountInRaw:p.amountIn.toString(),amountOutMinimumRaw:p.amountOutMinimum.toString(),pathBytes:p.path.length/2-1};
  if(parsed.name==='multicall')return {classification:'NESTED_MULTICALL_NOT_DECODED',method:parsed.name,innerCalls:parsed.args[parsed.args.length-1].length};
  if(parsed.name.startsWith('swapExact')){
   const routes=parsed.args[parsed.name==='swapExactTokensForTokens'?2:1];
   return {...base,routeHops:routes.length,routeDetails:routes.slice(0,3).map(r=>({from:r.from,to:r.to,stable:r.stable,factory:r.factory})),amountInRaw:parsed.name==='swapExactETHForTokens'?BigInt(tx.value||'0x0').toString():parsed.args[0].toString(),tokenIn:routes[0]?.from||null,tokenOut:routes[routes.length-1]?.to||null};
  }
  return base;
 }catch{return {classification:'UNSUPPORTED_METHOD',methodSelector:String(tx.input).slice(0,10)};}
}
function mount(app,{getBaseChain,rpc}){
 require('./phase125-economics').mount(app);
 require('./phase126-balancer').mount(app,{getBaseChain,rpc});
 const phase127Routes=require('./phase127-routes').mount(app,{getBaseChain,rpc});
 const state={build:'12.4.0',running:false,checks:0,autoChecks:0,manualChecks:0,autoFailures:0,autoLastRunAt:null,autoLastError:null,lastResult:null,startedAt:new Date().toISOString()};
 app.get('/api/phase10/status',(_req,res)=>res.json({success:true,...state,sharedPendingObservationStore:pendingObservations.stats(),safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}}));
 async function runProbe(res,source='manual'){
  if(state.running){if(res)return res.status(409).json({success:false,error:'PROBE_RUNNING'});return;}
  state.running=true;state.checks++;if(source==='auto'){state.autoChecks++;state.autoLastRunAt=new Date().toISOString();}else state.manualChecks++;
  try{
   const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');
   const pending=await Promise.race([rpc(chain,'eth_getBlockByNumber',['pending',true]),new Promise((_,reject)=>setTimeout(()=>reject(Error('PENDING_RPC_TIMEOUT_12000MS')),12000))]);
   const transactions=Array.isArray(pending?.transactions)?pending.transactions:[];
   const samples=transactions.slice(0,1000),counts={nativeTransfer:0,contractCreation:0,contractInteraction:0,knownRouter:0,supportedSwapMethod:0,unsupportedRouterMethod:0,nestedMulticall:0,hashOnly:0};
   let newPendingObservations=0;const routers={},swaps=[],unknownSelectors={},unknownTargets=new Map(),tokenMethods={verifiedUsdc:0,unverifiedErc20Selector:0},watchedAssets={usdc:0,weth:0};
   for(const tx of samples){
    if(!tx||typeof tx!=='object'){counts.hashOnly++;continue;}
    if(pendingObservations.record(tx))newPendingObservations++;
    if(!tx.to){counts.contractCreation++;continue;}
    const data=String(tx.input||tx.data||'0x');
    if(data==='0x'||data.length<10){counts.nativeTransfer++;continue;}
    const name=known.get(String(tx.to).toLowerCase());
    if(!name){counts.contractInteraction++;const selector=data.slice(0,10).toLowerCase();if(targetAddress(tx)===BASE_USDC&&erc20Selectors[selector])tokenMethods.verifiedUsdc++;else if(erc20Selectors[selector])tokenMethods.unverifiedErc20Selector++;if(targetAddress(tx)===BASE_USDC)watchedAssets.usdc++;if(targetAddress(tx)===BASE_WETH)watchedAssets.weth++;unknownSelectors[selector]=(unknownSelectors[selector]||0)+1;const target=String(tx.to).toLowerCase();const key=target+'|'+selector;unknownTargets.set(key,(unknownTargets.get(key)||0)+1);continue;}
    counts.knownRouter++;routers[name]=(routers[name]||0)+1;
    const result=decode({...tx,input:data},name);
    if(result.classification==='SUPPORTED_SWAP_METHOD'){counts.supportedSwapMethod++;swaps.push({hash:tx.hash,router:name,...result,status:'OBSERVED_NOT_SIMULATED',_txValue:tx.value||'0x0'});}
    else if(result.classification==='NESTED_MULTICALL')counts.nestedMulticall++;
    else counts.unsupportedRouterMethod++;
   }
   for(const swap of swaps.filter(x=>x.router==='AERODROME_ROUTER').slice(0,2)){swap.impact=await simulateAerodrome({value:swap._txValue},swap,chain,rpc);}
   for(const swap of swaps.filter(x=>x.router==='UNISWAP_ROUTER_02'&&['exactInputSingle','exactOutputSingle'].includes(x.method)).slice(0,2)){swap.v3Pool=await v3Inspector.inspect(swap,chain,rpc);if(swap.v3Pool.status==='POOL_STATE_VERIFIED')swap.samePairPools=await pairDiscovery.discover(swap,chain,rpc);}
   for(const swap of swaps){receiptTracker.track(swap);delete swap._txValue;}
   state.lastResult={success:true,build:state.build,chainId:8453,scanSource:source,newPendingObservations,pendingObservationStore:pendingObservations.stats(),tokenMethods,watchedAssets,reportedPendingTransactions:transactions.length,inspectedTransactions:samples.length,inspectionCoveragePct:transactions.length?Math.round(samples.length/transactions.length*10000)/100:100,inspectionTruncated:transactions.length>samples.length,inspectionLimit:1000,counts,knownRouterHits:routers,dominantUnknownTarget:[...unknownTargets.entries()].sort((a,b)=>b[1]-a[1]).slice(0,1).map(([key,count])=>{const [to,selector]=key.split('|');return {to,selector,count,shareOfInspectedPct:samples.length?Math.round(count/samples.length*10000)/100:0,verifiedIdentity:false};})[0]||null,topUnknownDestinations:[...unknownTargets.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([key,count])=>{const [to,selector]=key.split('|');return {to,selector,count,classification:to===BASE_USDC&&erc20Selectors[selector]?'VERIFIED_USDC_'+erc20Selectors[selector]:erc20Selectors[selector]?'ERC20_'+erc20Selectors[selector]+'_SELECTOR_UNVERIFIED_TARGET':'UNKNOWN_CONTRACT_METHOD'};}),topUnknownSelectors:Object.entries(unknownSelectors).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([selector,count])=>({selector,count})),decodedSupportedSwaps:swaps.length,swaps:swaps.slice(0,30),visibility:transactions.length?'RPC_PENDING_BLOCK_SAMPLE_NOT_FULL_MEMPOOL':'NO_PENDING_TRANSACTIONS_VISIBLE',limitations:['UNKNOWN_CONTRACT_IDENTITY_NOT_VERIFIED','TOKEN_METHODS_NOT_SWAP_SIGNALS','UNKNOWN_DESTINATIONS_REQUIRE_VERIFIED_ABIS','ROUTER_REGISTRY_PARTIAL','MULTICALL_INNER_CALLS_NOT_DECODED','NO_PRIVATE_ORDER_FLOW','INDICATIVE_ZERO_FEE_VOLATILE_MODEL_ONLY','NO_CONCENTRATED_LIQUIDITY_SIMULATION','SAME_PAIR_POOL_DISCOVERY_NOT_EXECUTABLE_QUOTES','NO_PROFIT_VALIDATION','NO_EXECUTION'],qualified:0,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
  }catch(e){if(source==='auto'){state.autoFailures++;state.autoLastError=safeError(e);}state.lastResult={success:false,build:state.build,error:safeError(e),visibility:'RPC_PENDING_BLOCK_UNAVAILABLE',safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};}
  finally{state.running=false;}
  if(res)res.json(state.lastResult);
 }
 const pairProbe={running:false,checks:0,failures:0,lastRunAt:null,lastError:null,lastResult:null};
 async function runPairProbe(res){
  if(pairProbe.running){if(res)return res.status(409).json({success:false,error:'PAIR_PROBE_RUNNING'});return;}
  pairProbe.running=true;pairProbe.checks++;pairProbe.lastRunAt=new Date().toISOString();
  try{
   const chain=getBaseChain();if(!chain||chain.chainId!==8453)throw Error('BASE_NOT_CONFIGURED');
   const swap={router:'UNISWAP_ROUTER_02',method:'exactInputSingle',tokenIn:BASE_USDC,tokenOut:BASE_WETH,fee:500};
   const v3Pool=await v3Inspector.inspect(swap,chain,rpc);
   const samePairPools=v3Pool.status==='POOL_STATE_VERIFIED'?await pairDiscovery.discover({...swap,v3Pool},chain,rpc):null;
   const spotObservations=samePairPools?await spotDiagnostic.compare(samePairPools,chain,rpc):null;
   pairProbe.lastResult={success:true,build:'12.4.0',chainId:8453,probePair:'BASE_USDC_WETH',v3Pool,samePairPools,spotObservations,qualified:0,alerts:[],limitations:['INDEPENDENT_DIAGNOSTIC_NOT_PENDING_TRANSACTION','SAME_DEX_POOLS_NOT_CROSS_DEX','NO_EXECUTABLE_QUOTES','NO_PROFIT_VALIDATION'],safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
  }catch(e){pairProbe.failures++;pairProbe.lastError=safeError(e);pairProbe.lastResult={success:false,build:'12.4.0',error:pairProbe.lastError,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};}
  finally{pairProbe.running=false;}
  if(res)return res.json(pairProbe.lastResult);
 }
 const aaveStartedAt=new Date().toISOString();
 const aaveInstanceId=crypto.randomUUID();
 const aaveStateFile=path.join(os.tmpdir(),'arbiflow-aave-phase122-status.json');
 let previouslySaved=null,restoreError=null;
 try{previouslySaved=JSON.parse(fs.readFileSync(aaveStateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')restoreError=e.message;}
 const aaveState={running:false,checks:0,failures:0,lastRunAt:null,lastError:null,lastResult:previouslySaved?.lastResult||null,lastStep:'IDLE',lastStepAt:null,restoredFromLocalFile:!!previouslySaved,instanceId:aaveInstanceId,instanceStartedAt:aaveStartedAt,persistenceScope:'INSTANCE_LOCAL_TEMP_FILE_ONLY_NOT_DURABLE_ACROSS_REDEPLOY',persistenceError:restoreError};
 require('./phase128-profit').mount(app,{getRoutes:()=>phase127Routes.getLastResult(),getAave:()=>aaveState.lastResult,startScan:phase127Routes.startScan,getRunning:phase127Routes.getRunning});
 function saveAaveState(){
  try{const tmp=aaveStateFile+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({lastResult:aaveState.lastResult,savedAt:new Date().toISOString()}),{mode:0o600});fs.renameSync(tmp,aaveStateFile);aaveState.persistenceError=null;}
  catch(e){aaveState.persistenceError=String(e.message||e).slice(0,200);}
 }
 function runAaveProbe(_req,res){
  if(aaveState.running)return res.status(409).json({success:false,error:'AAVE_PROBE_RUNNING',statusUrl:'/api/phase12/aave/status',instanceId:aaveInstanceId});
  aaveState.running=true;aaveState.checks++;aaveState.lastRunAt=new Date().toISOString();aaveState.lastStep='QUEUED';aaveState.lastStepAt=aaveState.lastRunAt;
  const attempt=aaveState.checks;
  res.status(202).json({success:true,build:'12.4.0',status:'PROBE_STARTED',instanceId:aaveInstanceId,attempt,statusUrl:'/api/phase12/aave/status',safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}});
  setImmediate(async()=>{
   let timer;
   let completed=false;
   const started=Date.now();
   const updateStep=(step)=>{
    if(completed||attempt!==aaveState.checks)return;
    aaveState.lastStep=step;
    aaveState.lastStepAt=new Date().toISOString();
   };
   try{
    const result=await Promise.race([
     aaveProbe.probe(getBaseChain(),rpc,updateStep),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('AAVE_PROBE_DEADLINE_EXCEEDED_90S')),90000);})
    ]);
    completed=true;
    aaveState.lastResult={success:true,build:'12.4.0',...result,elapsedMs:Date.now()-started};aaveState.lastError=null;
    aaveState.lastStep='COMPLETE';aaveState.lastStepAt=new Date().toISOString();
   }catch(e){
    completed=true;
    const failedStep=aaveState.lastStep;
    aaveState.failures++;aaveState.lastError=safeError(e);
    aaveState.lastResult={success:false,build:'12.4.0',error:aaveState.lastError,failedStep,elapsedMs:Date.now()-started,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
    aaveState.lastStep='FAILED';aaveState.lastStepAt=new Date().toISOString();
   }finally{completed=true;clearTimeout(timer);aaveState.running=false;saveAaveState();}
  });
 }
 app.get('/api/phase12/aave/probe',runAaveProbe);
 app.get('/api/phase12/aave/status',(_req,res)=>res.json({success:true,build:'12.4.0',...aaveState,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}}));
 // Phase 12.1: flash-loan-first strategy readiness; never executes or advertises available credit.
 app.get('/api/phase12/flash-loan/status',(_req,res)=>res.json({
  success:true,build:'12.4.0',strategy:'FLASH_LOAN_FIRST',network:'BASE',capitalModel:{loanPrincipalProvidedByUser:false,gasAndOperatingFundsRequired:true,exampleUserBudgetUsd:500,budgetIsNotARequiredDeposit:true},
  provider:{selected:aaveState.lastResult?.success===true,name:aaveState.lastResult?.success?'AAVE_V3':null,verifiedLiquidityRaw:null,poolTokenBalanceRaw:aaveState.lastResult?.poolTokenBalanceRaw||null,feeBps:aaveState.lastResult?.premiumBps??null,callbackVerified:false},
  prerequisites:{verifiedSamePairPools:!!pairProbe.lastResult?.samePairPools?.venues?.length,spotDiagnostics:pairProbe.lastResult?.spotObservations?.status==='SPOT_OBSERVATIONS_COLLECTED',tradeSizeExecutableQuotes:false,crossVenueRoundTripQuotes:false,flashLoanProviderLiquidity:false,flashLoanObservedATokenUnderlyingBalance:aaveState.lastResult?.liquidityObservation?.underlyingBalanceRaw??null,flashLoanAmountScreened:aaveState.lastResult?.liquidityObservation?.readVerified===true,flashLoanReserveFlagsVerified:aaveState.lastResult?.reserveConfiguration?.configurationReadVerified===true,flashLoanReserveReadEligible:aaveState.lastResult?.reserveConfiguration?.reserveReadEligible===true,flashLoanFeeVerified:aaveState.lastResult?.success===true,atomicContractForkTest:false,gasAndNetProfitGate:false},
  opportunityGate:{minimumSpreadPctExclusive:0.5,allowedRisk:['LOW','MEDIUM'],requiresPositiveNetProfit:true,qualified:0,alerts:[]},
  safety:{readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false},
  warnings:['NO_FLASH_LOAN_HAS_BEEN_REQUESTED','FLASH_LOAN_PRINCIPAL_MUST_BE_REPAID_ATOMICALLY','REVERTED_TRANSACTIONS_CAN_STILL_COST_GAS','EXISTING_LIQUIDATION_TEST_HARNESS_IS_NOT_A_LIVE_ARBITRAGE_EXECUTOR']
 }));
 app.get('/api/phase11/pairs/status',(_req,res)=>res.json({success:true,build:'12.4.0',...pairProbe,safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}}));
 app.get('/api/phase11/pairs/probe',async(_req,res)=>runPairProbe(res));
 app.get('/api/phase10/probe',async(_req,res)=>runProbe(res,'manual'));
 const autoTimer=setInterval(()=>{runProbe(null,'auto').catch(e=>{state.autoFailures++;state.autoLastError=safeError(e);});},60000);
 autoTimer.unref?.();
 state.autoSampling={enabled:true,intervalMs:60000,initialSampleOnStartup:true,processLocal:true};
 const initialTimer=setTimeout(()=>{runProbe(null,'auto').catch(e=>{state.autoFailures++;state.autoLastError=safeError(e);});},2000);
 initialTimer.unref?.();
}
module.exports={mount};
