'use strict';
// Read-only multi-token graph discovery; no trades or alerts.
module.exports.mount=(app,{getChain,call})=>{
 const {Interface}=require('ethers');
 const quoteAbi=new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
 const quoters={8453:'0x222ca98f00ed15b1fae10b61c277703a194cf5d2',42161:'0x61fFE014bA17989E743c5F6cB21bF9697530B21e',10:'0x61fFE014bA17989E743c5F6cB21bF9697530B21e'};
 const abi=new Interface(['function getPool(address,address,uint24) view returns (address)','function getPair(address,address) view returns (address)','function token0() view returns (address)','function token1() view returns (address)','function liquidity() view returns (uint128)','function getReserves() view returns (uint112,uint112,uint32)']);
 const dai={8453:'0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',42161:'0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',10:'0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'};
 const factories={8453:['0x33128a8fC17869897dcE68Ed026d694621f6FDfD','0x71524B4f93c58fcbF659783284E38825f0622859'],42161:['0x1F98431c8aD98523631AE4a59f267346ea31F984','0xc35DADB65012eC5796536bD9864eD8773aBc74C4'],10:['0x1F98431c8aD98523631AE4a59f267346ea31F984','0xFbc12984689e5f15626Bad03Ad60160Fe98B303C']};
 const state={running:false,runs:0,lastCompletedAt:null,result:null};
 const lenderByChain={8453:{pool:'0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',dataProvider:'0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A'},42161:{pool:'0x794a61358D6845594F94dc1DB02A252b5b4814aD',dataProvider:'0x243Aa95cAC2a25651eda86e80bEe66114413c43b'},10:{pool:'0x794a61358D6845594F94dc1DB02A252b5b4814aD',dataProvider:'0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654'}};
 const loanAbi=new Interface(['function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)','function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)','function balanceOf(address owner) view returns (uint256)']);
 async function lenderSnapshot(chain,chainId){const conf=lenderByChain[chainId];try{const invoke=async(address,fn,args=[])=>loanAbi.decodeFunctionResult(fn,await call(chain,address.toLowerCase(),loanAbi.encodeFunctionData(fn,args.map(x=>typeof x==='string'?x.toLowerCase():x))));const premium=Number((await invoke(conf.pool,'FLASHLOAN_PREMIUM_TOTAL'))[0]);const token=chain.tokens.USDC;const aToken=String((await invoke(conf.dataProvider,'getReserveTokensAddresses',[token]))[0]);const availableRaw=BigInt((await invoke(token,'balanceOf',[aToken]))[0]);return {status:'RESERVE_OBSERVED_NOT_EXECUTABLE',provider:'AAVE_V3',asset:'USDC',pool:conf.pool,availableUsdc:Number(availableRaw)/1e6,premiumBps:premium,flashLoanEligibility:'NOT_VERIFIED',atomicSimulation:false};}catch(e){return {status:'LENDER_CHECK_FAILED',error:String(e.message||e).slice(0,160),flashLoanEligibility:'NOT_VERIFIED',atomicSimulation:false};}}

 const valid=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x)&&!/^0x0{40}$/i.test(x);
 const pairs=[['USDC','WETH'],['USDC','DAI'],['WETH','DAI']];
 async function run(chainId){
  const chain=getChain(chainId),f=factories[chainId];if(!chain||!f)throw Error('UNSUPPORTED_CHAIN');
  const tokens={USDC:chain.tokens.USDC,WETH:chain.tokens.WETH,DAI:dai[chainId]};
  const lender=await lenderSnapshot(chain,chainId);
  const venues=[{name:'UNISWAP_V3_500',factory:f[0],fee:500},{name:'UNISWAP_V3_3000',factory:f[0],fee:3000},{name:'SUSHISWAP_V2',factory:f[1]}];
  const edges=[];
  for(const [a,b] of pairs)for(const v of venues){
   const row={pair:a+'/'+b,venue:v.name,fee:v.fee||null,status:'UNTESTED',pool:null};
   try{
    const fn=v.fee?'getPool':'getPair';
    const args=v.fee?[tokens[a].toLowerCase(),tokens[b].toLowerCase(),v.fee]:[tokens[a].toLowerCase(),tokens[b].toLowerCase()];
    const raw=await call(chain,v.factory,abi.encodeFunctionData(fn,args));
    const pool=abi.decodeFunctionResult(fn,raw)[0];
    if(!valid(pool)){row.status='NO_POOL';edges.push(row);continue;}
    row.pool=pool;row.token0=null;
    const addresses=[];
    for(const method of ['token0','token1'])addresses.push(String(abi.decodeFunctionResult(method,await call(chain,pool,abi.encodeFunctionData(method,[])))[0]).toLowerCase());
    row.token0=addresses[0];
    if(!addresses.includes(tokens[a].toLowerCase())||!addresses.includes(tokens[b].toLowerCase())){row.status='TOKEN_MISMATCH';edges.push(row);continue;}
    if(v.fee){const l=abi.decodeFunctionResult('liquidity',await call(chain,pool,abi.encodeFunctionData('liquidity',[])))[0];row.status=l>0n?'POOL_LIVE':'POOL_EMPTY';row.activeLiquidity=l.toString();}
    else{const r=abi.decodeFunctionResult('getReserves',await call(chain,pool,abi.encodeFunctionData('getReserves',[])));row.status=r[0]>0n&&r[1]>0n?'POOL_LIVE':'POOL_EMPTY';row.reserves=[r[0].toString(),r[1].toString()];}
   }catch(e){row.status='ERROR';row.error=String(e.message||e).slice(0,150);}
   edges.push(row);
   if(row.error&&/429|COOLDOWN|RATE_LIMIT/.test(row.error))break;
  }
  const live=edges.filter(x=>x.status==='POOL_LIVE');
  const byPair=Object.fromEntries(pairs.map(([a,b])=>[a+'/'+b,live.filter(x=>x.pair===a+'/'+b).length]));
  // Bounded read-only triangular quote probes. V2 uses an assumed 30 bps fee.
  // Quote outputs are indicative and NOT atomically executable.
  const routes=[];
  const cycles=[
   [['USDC','WETH'],['WETH','DAI'],['DAI','USDC']],
   [['USDC','DAI'],['DAI','WETH'],['WETH','USDC']]
  ];
  const decimals={USDC:6,WETH:18,DAI:18};
  const capQuotes=240;let quoteCalls=0;
  async function quote(edge,from,to,amount){
   if(++quoteCalls>capQuotes)throw Error('RPC_QUOTE_BUDGET_REACHED');
   if(edge.fee){
    const raw=await call(chain,quoters[chainId],quoteAbi.encodeFunctionData('quoteExactInputSingle',[{tokenIn:tokens[from].toLowerCase(),tokenOut:tokens[to].toLowerCase(),amountIn:amount,fee:edge.fee,sqrtPriceLimitX96:0}]));
    return BigInt(quoteAbi.decodeFunctionResult('quoteExactInputSingle',raw)[0]);
   }
   const [r0,r1]=edge.reserves.map(BigInt);
   const forward=edge.token0===tokens[from].toLowerCase();
   const reserveIn=forward?r0:r1,reserveOut=forward?r1:r0;
   if(!reserveIn||!reserveOut)throw Error('ZERO_RESERVE');
   const feeAdjusted=amount*997n;
   return feeAdjusted*reserveOut/(reserveIn*1000n+feeAdjusted);
  }
  async function probe(legs,combo,size){
   const record={sizeUsdc:size,route:['USDC',...legs.map(l=>l[1])].join('>'),venues:combo.map(e=>e.venue),pools:combo.map(e=>e.pool),status:'UNQUOTED',feePolicy:'V2_30_BPS_ASSUMED',flashLoan:{...lender,feeUsd:lender.premiumBps==null?null:size*lender.premiumBps/10000,capacitySufficient:lender.availableUsdc!=null?lender.availableUsdc>=size:false},netProfitUsd:null,qualified:false};
   try{
    let amount=BigInt(Math.round(size*1e6));
    for(let j=0;j<3;j++){const inputRaw=amount.toString();amount=await quote(combo[j],legs[j][0],legs[j][1],amount);record.legs=record.legs||[];record.legs.push({from:legs[j][0],to:legs[j][1],venue:combo[j].venue,pool:combo[j].pool,inputRaw,outputRaw:amount.toString(),inputHuman:Number(inputRaw)/10**decimals[legs[j][0]],outputHuman:Number(amount)/10**decimals[legs[j][1]]});if(amount<=0n)throw Error('ZERO_LEG_OUTPUT');
     if((legs[j][0]==='USDC'&&legs[j][1]==='DAI')||(legs[j][0]==='DAI'&&legs[j][1]==='USDC')){const stableRate=record.legs[j].outputHuman/record.legs[j].inputHuman;if(!Number.isFinite(stableRate)||stableRate<0.95||stableRate>1.05){record.rejectedLeg=j+1;record.stableRate=stableRate;throw Error('STABLECOIN_POOL_PRICE_OUTSIDE_5_PERCENT_BAND');}}}
    const input=BigInt(Math.round(size*1e6));
    record.outputUsdcRaw=amount.toString();
    record.grossProfitUsd=Number(amount-input)/1e6;
    record.grossReturnPct=Number((amount-input)*1000000n/input)/10000;
    record.afterLoanPremiumBeforeGasUsd=record.flashLoan.feeUsd==null?null:record.grossProfitUsd-record.flashLoan.feeUsd;
    record.netProfitUsd=null; // Gas, swap execution, flash eligibility and atomic simulation are unverified.
    record.status=record.grossReturnPct<=-10?'SEVERE_LOSS_ROUTE_REJECTED':'INDICATIVE_QUOTED_NOT_EXECUTABLE';
   }catch(e){record.status='QUOTE_ERROR';record.error=String(e.message||e).slice(0,180);}
   routes.push(record);
   return record;
  }
  // Read-only $10,000+ flash-loan-sized probes; loan availability is NOT assumed.
  // Use each route's own V2 reserve depth when available. V3 liquidity()
  // is not directly USD-denominated; V3-only paths use a bounded probe.
  const minimumTradeUsdc=10000;
  const maxProbeUsdc=100000;
  function routeDepth(legs,combo){
   const ceilings=[];
   for(let i=0;i<3;i++){
    const e=combo[i],from=legs[i][0];
    if(e.fee)continue;
    const idx=e.token0===tokens[from].toLowerCase()?0:1;
    const reserve=Number(BigInt(e.reserves[idx]))/10**decimals[from];
    if(Number.isFinite(reserve)&&reserve>0&&from==='USDC')ceilings.push(reserve*0.02);
   }
   return ceilings.length?Math.min(...ceilings):null;
  }
  const candidates=[];
  for(const legs of cycles){
   const options=legs.map(([a,b])=>live.filter(e=>e.pair===a+'/'+b||e.pair===b+'/'+a));
   if(!options.every(o=>o.length))continue;
   for(const a of options[0])for(const b of options[1])for(const c of options[2])candidates.push({legs,combo:[a,b,c]});
  }
  const baseline=[],perRouteSizing=[],skippedShallowRoutes=[];
  for(const candidate of candidates){
   if(quoteCalls+3>capQuotes)break;
   const depth=routeDepth(candidate.legs,candidate.combo);
   if(lender.availableUsdc==null||lender.availableUsdc<minimumTradeUsdc){skippedShallowRoutes.push({reason:'LENDER_CAPACITY_NOT_VERIFIED',lenderStatus:lender.status});break;}
   if(depth!==null&&depth<minimumTradeUsdc){
    skippedShallowRoutes.push({route:['USDC',...candidate.legs.map(l=>l[1])].join('>'),venues:candidate.combo.map(e=>e.venue),reason:'V2_RESERVE_TOO_SHALLOW',estimatedSafeUsdc:depth});
    continue;
   }
   const size=depth===null?minimumTradeUsdc:Math.max(minimumTradeUsdc,Math.min(maxProbeUsdc,Math.round(depth*0.25)));
   const result=await probe(candidate.legs,candidate.combo,size);
   if(result.status==='INDICATIVE_QUOTED_NOT_EXECUTABLE')baseline.push({...candidate,score:result.grossProfitUsd,initialSize:size,depth});
  }
  baseline.sort((a,b)=>b.score-a.score);
  for(const candidate of baseline.slice(0,8)){
   const row={route:['USDC',...candidate.legs.map(l=>l[1])].join('>'),venues:candidate.combo.map(e=>e.venue),reserveBasedLimitUsdc:candidate.depth,sizesTested:[candidate.initialSize],stoppedReason:null};
   for(const multiplier of [2,5,10]){
    const size=Math.round(candidate.initialSize*multiplier);
    if(size>lender.availableUsdc){row.stoppedReason='LENDER_LIQUIDITY_LIMIT';break;}
    if(size>maxProbeUsdc){row.stoppedReason='PROBE_SAFETY_CAP';break;}
    if(candidate.depth!==null&&size>candidate.depth){row.stoppedReason='V2_RESERVE_SCREEN';break;}
    if(quoteCalls+3>capQuotes){row.stoppedReason='QUOTE_BUDGET';break;}
    const result=await probe(candidate.legs,candidate.combo,size);
    row.sizesTested.push(size);
    if(result.status!=='INDICATIVE_QUOTED_NOT_EXECUTABLE'){row.stoppedReason='QUOTE_FAILED';break;}
    if(result.grossReturnPct < -10){row.stoppedReason='EXTREME_NEGATIVE_RETURN';break;}
   }
   perRouteSizing.push(row);
  }
  const sizes=[...new Set(routes.map(r=>r.sizeUsdc))].sort((a,b)=>a-b);
  const bestByGross=routes.filter(r=>r.status==='INDICATIVE_QUOTED_NOT_EXECUTABLE').sort((a,b)=>b.grossProfitUsd-a.grossProfitUsd).slice(0,10);
  const quoted=routes.filter(r=>r.status==='INDICATIVE_QUOTED_NOT_EXECUTABLE');
  return {success:true,stage:'LARGE_TRADE_FLASH_LOAN_DIAGNOSTICS',chainId,tokens:Object.keys(tokens),lender,loanPremiumIncludedInIndicativeBreakdown:true,netProfitVerified:false,atomicSimulation:false,poolChecks:edges.length,livePools:live.length,byPair,triangularTopologyAvailable:Object.values(byPair).every(n=>n>0),triangularCyclesQuoted:quoted.length,triangularCyclesAttempted:routes.length,venueCombinations:candidates.length,quoteCalls,quoteBudget:capQuotes,minimumTradeUsdc,maximumProbeUsdc:maxProbeUsdc,sizeCandidatesUsdc:sizes,skippedShallowRoutes,perRouteSizing,bestByGross,indicativePositiveGross:quoted.filter(r=>r.grossProfitUsd>0).length,severeLossRoutesRejected:routes.filter(r=>r.status==='SEVERE_LOSS_ROUTE_REJECTED').length,stablecoinPriceRejections:routes.filter(r=>r.error?.includes('STABLECOIN_POOL_PRICE_OUTSIDE_5_PERCENT_BAND')).length,qualified:0,alertsEmitted:0,routes,edges,limitations:['FLASH_LOAN_ELIGIBILITY_NOT_VERIFIED','RESERVE_BALANCE_NOT_GUARANTEED_FLASH_BORROWABLE','NO_FLASH_LOAN_EXECUTOR_INTEGRATION','QUOTES_NOT_ATOMIC_EXECUTION','V2_30_BPS_FEE_ASSUMED','NO_GAS_OR_FLASH_LOAN_FEE_NETTING','NO_ATOMIC_SIMULATION','V3_ONLY_ROUTES_HAVE_NO_USD_DEPTH_VERIFICATION','LARGE_TRADE_PROBES_NOT_TRUE_OPTIMIZATION','NOT_ALL_SIZES_TESTED_ON_ALL_ROUTES','NO_ALERTS_UNTIL_VERIFIED_NET_PROFIT'],safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
 }
 app.get('/api/market-graph/status',(_req,res)=>res.json({success:true,...state,safety:{readOnly:true,mainnetBroadcast:false}}));
 app.get('/api/market-graph/run',(req,res)=>{
  if(state.running)return res.status(409).json({success:false,error:'GRAPH_SCAN_RUNNING'});
  const chainId=Number(req.query.chainId||8453);
  if(!factories[chainId])return res.status(400).json({success:false,error:'SUPPORTED_CHAIN_IDS_8453_42161_10'});
  state.running=true;state.runs++;
  setImmediate(async()=>{try{state.result=await run(chainId);}catch(e){state.result={success:false,error:String(e.message||e).slice(0,200)};}finally{state.running=false;state.lastCompletedAt=new Date().toISOString();}});
  res.json({success:true,status:'STARTED_BACKGROUND',statusRoute:'/api/market-graph/status',readOnly:true});
 });
};
