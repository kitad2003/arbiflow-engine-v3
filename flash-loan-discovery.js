'use strict';
// Read-only Aave V3 flash-loan discovery. No approvals, signing or execution.
// Addresses for other networks must be verified and supplied by operator.
module.exports.mount=(app,{getChain,call})=>{
 const {Interface,formatUnits}=require('ethers');
 const markets=[
  ['ethereum',1],['arbitrum',42161],['optimism',10],['base',8453],
  ['polygon',137],['avalanche',43114],['bnb',56],['gnosis',100],
  ['scroll',534352],['linea',59144],['zksync',324],['metis',1088],
  ['sonic',146],['celo',42220],['soneium',1868]
 ];
 const known={8453:{pool:'0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',dataProvider:'0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A'}};
 const abi=new Interface([
  'function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)',
  'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)',
  'function balanceOf(address owner) view returns (uint256)',
  'function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)'
 ]);
 const valid=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x)&&!/^0x0{40}$/i.test(x);
 const state={lastCheckedAt:null,results:[]};
 async function read(chain,address,method,args=[]){
  const data=await call(chain,address,abi.encodeFunctionData(method,args));
  return abi.decodeFunctionResult(method,data);
 }
 async function inspect(name,chainId){
  const chain=getChain(chainId);
  const prefix='AAVE_V3_'+name.toUpperCase().replace(/[^A-Z0-9]/g,'_');
  const conf={pool:process.env[prefix+'_POOL']||known[chainId]?.pool,dataProvider:process.env[prefix+'_DATA_PROVIDER']||known[chainId]?.dataProvider};
  const base={network:name,chainId,provider:'AAVE_V3',asset:'USDC',minimumTradeUsdc:10000,readOnly:true,executable:false,qualified:false};
  if(!chain?.rpc)return {...base,status:'RPC_NOT_CONFIGURED'};
  if(!valid(conf.pool)||!valid(conf.dataProvider))return {...base,status:'LENDER_ADDRESSES_NOT_CONFIGURED'};
  if(!valid(chain.tokens?.USDC))return {...base,status:'USDC_NOT_CONFIGURED'};
  try{
   const [premium,addresses,configuration]=await Promise.all([
    read(chain,conf.pool,'FLASHLOAN_PREMIUM_TOTAL'),
    read(chain,conf.dataProvider,'getReserveTokensAddresses',[chain.tokens.USDC]),
    read(chain,conf.dataProvider,'getReserveConfigurationData',[chain.tokens.USDC])
   ]);
   if(!configuration[8]||configuration[9])return {...base,status:'RESERVE_INACTIVE_OR_FROZEN'};
   const aToken=String(addresses[0]);
   if(!valid(aToken))return {...base,status:'INVALID_ATOKEN'};
   const raw=BigInt((await read(chain,chain.tokens.USDC,'balanceOf',[aToken]))[0]);
   const decimals=Number(configuration[0]);
   if(!Number.isInteger(decimals)||decimals<0||decimals>36)return {...base,status:'INVALID_DECIMALS'};
   const available=Number(formatUnits(raw,decimals));
   const premiumBps=Number(premium[0]);
   if(!Number.isFinite(available)||!Number.isFinite(premiumBps))return {...base,status:'INVALID_ONCHAIN_VALUE'};
   return {...base,status:available>=10000?'LIQUIDITY_OBSERVED_NOT_EXECUTABLE':'INSUFFICIENT_LIQUIDITY',
    pool:conf.pool,dataProvider:conf.dataProvider,assetAddress:chain.tokens.USDC,
    availableUsdc:available,premiumBps,example10000FeeUsdc:10000*premiumBps/10000,
    maxObservedLoanUsdc:available,flashLoanEligibility:'NOT_VERIFIED',
    atomicSimulation:false,netProfitUsd:null};
  }catch(e){return {...base,status:'ONCHAIN_CHECK_FAILED',error:String(e.message||e).slice(0,180)};}
 }
 app.get('/api/flash-loans/discovery',async(req,res)=>{
  const requested=req.query.chainId===undefined?null:Number(req.query.chainId);
  if(requested!==null&&!markets.some(x=>x[1]===requested))return res.status(400).json({success:false,error:'UNSUPPORTED_CHAIN_ID'});
  const chosen=markets.filter(x=>requested===null||x[1]===requested);
  const results=[];
  for(const [name,id] of chosen)results.push(await inspect(name,id));
  state.lastCheckedAt=new Date().toISOString();state.results=results;
  res.json({success:true,readOnly:true,mainnetBroadcast:false,walletBalanceDisplayed:false,
   disclaimer:'Observed reserve liquidity is not proof of flash-loan eligibility or executable profit. No funds borrowed.',
   networksChecked:results.length,results});
 });
 app.get('/api/flash-loans/discovery/status',(_req,res)=>res.json({success:true,...state,readOnly:true}));
};
