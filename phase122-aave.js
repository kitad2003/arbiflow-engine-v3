'use strict';
// Phase 12.2: Aave V3 Base flash-loan READ-ONLY liquidity/fee probe.
const {Interface}=require('ethers');
const provider='0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D';
const expectedPool='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const usdc='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const providerAbi=new Interface(['function getPool() view returns(address)']);
const poolAbi=new Interface(['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)','function getConfiguration(address asset) view returns(uint256 data)','function getReserveAToken(address asset) view returns(address)']);
const tokenAbi=new Interface(['function balanceOf(address) view returns(uint256)']);
async function read(rpc,chain,to,iface,fn,args=[],onStep){onStep?.('RPC_'+fn+'_START');const result=await rpc(chain,'eth_call',[{to,data:iface.encodeFunctionData(fn,args)},'latest']);const decoded=iface.decodeFunctionResult(fn,result)[0];onStep?.('RPC_'+fn+'_OK');return decoded;}
async function probe(chain,rpc,onStep){
 if(Number(chain?.chainId)!==8453)throw Error('BASE_CHAIN_REQUIRED');
 const pool=await read(rpc,chain,provider,providerAbi,'getPool',[],onStep);
 if(pool.toLowerCase()!==expectedPool.toLowerCase())throw Error('AAVE_POOL_ADDRESS_MISMATCH');
 const premium=BigInt(await read(rpc,chain,pool,poolAbi,'FLASHLOAN_PREMIUM_TOTAL',[],onStep));
 if(premium>10000n)throw Error('INVALID_PREMIUM_BPS');
 const balance=BigInt(await read(rpc,chain,usdc,tokenAbi,'balanceOf',[pool],onStep));
 const config=BigInt(await read(rpc,chain,pool,poolAbi,'getConfiguration',[usdc],onStep));
 const flag=(bit)=>((config>>BigInt(bit))&1n)===1n;
 const isActive=flag(56),isFrozen=flag(57),borrowingEnabled=flag(58),isPaused=flag(60),flashLoanEnabled=flag(63);
 const reserveReadEligible=isActive&&!isPaused&&flashLoanEnabled;
 // The Pool's own underlying balance is not the reserve's available liquidity.
 // Query the configured aToken and then the underlying ERC20 held by that aToken.
 let aTokenAddress=null,aTokenUnderlyingRaw=null,liquidityReadError=null;
 try{
  aTokenAddress=await read(rpc,chain,pool,poolAbi,'getReserveAToken',[usdc],onStep);
  if(!/^0x[0-9a-fA-F]{40}$/.test(aTokenAddress)||/^0x0{40}$/i.test(aTokenAddress))throw Error('INVALID_RESERVE_ATOKEN_ADDRESS');
  aTokenUnderlyingRaw=BigInt(await read(rpc,chain,usdc,tokenAbi,'balanceOf',[aTokenAddress],onStep));
 }catch(e){
  liquidityReadError=String(e?.message||e).slice(0,240);
  onStep?.('ATOKEN_LIQUIDITY_READ_UNAVAILABLE');
 }
 const candidates=[100,500,1000,5000,10000].map(amountUsdc=>{
  const amountRaw=BigInt(amountUsdc)*1000000n;
  const feeRaw=(amountRaw*premium+9999n)/10000n; // conservative ceil; diagnostic estimate only
  return {amountUsdc,estimatedPremiumUsdc:(Number(feeRaw)/1e6).toFixed(6),withinObservedATokenBalance:aTokenUnderlyingRaw===null?null:amountRaw<=aTokenUnderlyingRaw,atomicExecutionVerified:false,netProfitVerified:false};
 });
 return {status:'AAVE_BASE_ONCHAIN_READS_VERIFIED',provider:'AAVE_V3',chainId:8453,addressesProvider:provider,pool,asset:usdc,assetSymbol:'USDC',assetDecimals:6,poolTokenBalanceRaw:balance.toString(),poolTokenBalanceUsdc:(Number(balance)/1e6).toFixed(2),premiumBps:Number(premium),premiumPct:Number(premium)/100,liquidityObservation:{source:'USDC_BALANCE_OF_ATOKEN',aTokenAddress,underlyingBalanceRaw:aTokenUnderlyingRaw===null?null:aTokenUnderlyingRaw.toString(),underlyingBalanceUsdc:aTokenUnderlyingRaw===null?null:(Number(aTokenUnderlyingRaw)/1e6).toFixed(2),readVerified:aTokenUnderlyingRaw!==null,readError:liquidityReadError,availableFlashLoanAmountVerified:false},loanAmountScreens:candidates,reserveConfiguration:{isActive,isFrozen,borrowingEnabled,isPaused,flashLoanEnabled,reserveReadEligible,configurationReadVerified:true},availableFlashLoanAmountVerified:false,loanExecutionVerified:false,callbackVerified:false,notes:['POOL_TOKEN_BALANCE_IS_NOT_RESERVE_LIQUIDITY','ATOKEN_UNDERLYING_BALANCE_IS_OBSERVED_LIQUIDITY_NOT_EXECUTABLE_CAPACITY','FLASH_LOAN_ELIGIBILITY_FLAGS_CHECKED_BUT_NOT_EXECUTION_TESTED','PREMIUM_CAN_CHANGE','NO_LOAN_EXECUTED'],safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
}
module.exports={probe};
