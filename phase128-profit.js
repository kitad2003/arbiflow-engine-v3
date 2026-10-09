'use strict';
// 12.8.0: independent read-only cost-readiness view. Never fabricate gas or net profit.
const safety=Object.freeze({readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false});
function assess(routes,aave){
 const loanSize=routes?.loanSizeUsdc;
 const principal=Number.isInteger(loanSize)&&loanSize>0?BigInt(loanSize)*1000000n:null;
 const recentAave=!!(aave?.success===true && aave?.provider==='AAVE_V3' && Number.isInteger(aave?.premiumBps) && aave.premiumBps>=0);
 const configEligible=aave?.reserveConfiguration?.reserveReadEligible===true;
 const available=aave?.liquidityObservation?.readVerified===true&&aave?.liquidityObservation?.underlyingBalanceRaw!=null&&principal!==null&&BigInt(aave.liquidityObservation.underlyingBalanceRaw)>=principal;
 const fee=recentAave&&principal!==null?(principal*BigInt(aave.premiumBps)+9999n)/10000n:null;
 const providerOptions=[
  {provider:'AAVE_V3',feeBps:recentAave?aave.premiumBps:null,feeUsdcRaw:fee?.toString()??null,observedLiquiditySufficient:available,configurationEligible:configEligible,executionEligible:false,feeObservationOnly:true},
  {provider:'BALANCER_V2',feeBps:null,feeUsdcRaw:null,providerPolicy:'BLOCKED_PENDING_WINDDOWN_SECURITY_REVIEW',executionEligible:false}
 ];
 const reviewed=(routes?.routes||[]).map(row=>{
  const principalRaw=principal;
  const returnRaw=row.quoteSuccess&&/^[0-9]+$/.test(String(row.returnUsdcRaw))?BigInt(row.returnUsdcRaw):null;
  const gross=returnRaw!==null&&principalRaw!==null?returnRaw-principalRaw:null;
  const premium=fee;
  const afterLoanFee=gross!==null&&premium!==null?gross-premium:null;
  const spreadPass=gross!==null&&principalRaw!==null&&gross*10000n>principalRaw*50n;
  const reasons=[];
  if(!row.quoteSuccess)reasons.push('QUOTE_UNVERIFIED');
  if(!spreadPass)reasons.push('SPREAD_NOT_ABOVE_0_5_PCT');
  if(!recentAave||!configEligible||!available)reasons.push('AAVE_READINESS_NOT_CONFIRMED');
  reasons.push('GAS_AND_SLIPPAGE_NOT_VERIFIED','ATOMIC_FORK_TEST_NOT_VERIFIED');
  return {buyDex:row.buyDex,sellDex:row.sellDex,quoteSuccess:row.quoteSuccess===true,grossUsdcRaw:gross?.toString()??null,aavePremiumUsdcRaw:premium?.toString()??null,afterAavePremiumUsdcRaw:afterLoanFee?.toString()??null,netProfitUsdcRaw:null,gasCostUsdcRaw:null,slippageCostUsdcRaw:null,spreadPass,risk:'UNASSESSED',qualifiedForDashboard:false,executionEligible:false,rejectionReasons:reasons};
 });
 return {success:true,build:'12.8.0',strategy:'FLASH_LOAN_FIRST',quoteBuild:routes?.build??null,quoteBlock:routes?.blockTag??null,loanSizeUsdc:principal===null?null:loanSize,quoteDataAvailable:!!routes?.routes?.length,providerOptions,routeAssessments:reviewed,qualified:0,alerts:[],netProfitVerified:false,needs:['ONCHAIN_TRANSACTION_GAS_ESTIMATE','BASE_L1_DATA_FEE','SLIPPAGE_BOUND','ATOMIC_FLASH_LOAN_FORK_TEST','FRESH_PROVIDER_READS'],safety};
}
function mount(app,{getRoutes,getAave,startScan,getRunning,getStage}){
 app.get('/api/phase12/profit/refresh',(req,res)=>{
  const amount=Number(req.query.amountUsdc||500);
  if(![100,500,1000].includes(amount))return res.status(400).json({success:false,error:'ALLOWED_AMOUNTS_100_500_1000',safety});
  const result=startScan(amount);
  res.status(result.success?200:409).json({...result,build:'12.8.2',profitStatusRoute:'/api/phase12/profit/status',routeStatusRoute:'/api/phase12/routes/status',safety});
 });
 app.get('/api/phase12/profit/status',(_req,res)=>{
  try{res.json({...assess(getRoutes(),getAave()),build:'12.8.1',scannerRunning:getRunning(),scannerStage:getStage(),diagnostic:getRunning()?'QUOTE_SCAN_IN_PROGRESS':getRoutes()==null?'NO_CURRENT_PROCESS_QUOTE_RESULTS':'QUOTE_RESULTS_AVAILABLE'})}
  catch(e){res.status(500).json({success:false,error:'PROFIT_ASSESSMENT_UNAVAILABLE',qualified:0,alerts:[],safety})}
 });
}
module.exports={assess,mount};
