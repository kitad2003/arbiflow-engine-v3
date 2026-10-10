'use strict';
// NEW RESEARCH: Aave V3 Base read-only flash-loan prerequisites. No borrowing or transaction signing.
// Official Aave address-book AaveV3Base.sol: POOL_ADDRESSES_PROVIDER.
const {ethers}=require('ethers');
const PROVIDER='0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D';
const DATA_PROVIDER='0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A';
const TOKENS=[
 {symbol:'USDC',address:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',decimals:6},
 {symbol:'WETH',address:'0x4200000000000000000000000000000000000006',decimals:18}
];
const PROVIDER_ABI=['function getPool() view returns (address)'];
const POOL_ABI=['function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)',
 'function getConfiguration(address asset) view returns (uint256 data)'];
const DATA_ABI=['function getReserveTokensAddresses(address asset) view returns(address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)'];
const ERC20=['function balanceOf(address account) view returns(uint256)','function decimals() view returns(uint8)'];
function flags(bitmap){
 const n=BigInt(bitmap);
 return {active:((n>>56n)&1n)===1n,paused:((n>>60n)&1n)===1n,flashLoanEnabled:((n>>63n)&1n)===1n};
}
function feeFor(amountRaw,premiumBps){
 const amount=BigInt(amountRaw),bps=BigInt(premiumBps);
 if(amount<0n||bps<0n||bps>10000n)throw Error('BAD_FLASHLOAN_FEE_INPUT');
 // Aave V3 PercentageMath.percentMul uses half-up rounding.
 return (amount*bps+5000n)/10000n;
}
async function check(provider){
 const network=await provider.getNetwork();
 if(network.chainId!==8453n)throw Error('REQUIRES_BASE_CHAIN_ID_8453');
 const addressProvider=new ethers.Contract(PROVIDER,PROVIDER_ABI,provider);
 const poolAddress=await addressProvider.getPool();
 if(!ethers.isAddress(poolAddress)||(await provider.getCode(poolAddress))==='0x')throw Error('AAVE_POOL_NOT_VERIFIED');
 const pool=new ethers.Contract(poolAddress,POOL_ABI,provider);
 const data=new ethers.Contract(DATA_PROVIDER,DATA_ABI,provider);
 const premium=BigInt(await pool.FLASHLOAN_PREMIUM_TOTAL());
 if(premium<0n||premium>10000n)throw Error('UNEXPECTED_PREMIUM');
 const reserves=[];
 for(const token of TOKENS){
  try{
   const [configuration,addresses,decimals]=await Promise.all([
    pool.getConfiguration(token.address),data.getReserveTokensAddresses(token.address),
    new ethers.Contract(token.address,ERC20,provider).decimals()]);
   if(Number(decimals)!==token.decimals)throw Error('DECIMALS_MISMATCH');
   const aToken=addresses[0];
   if(!ethers.isAddress(aToken)||aToken===ethers.ZeroAddress||(await provider.getCode(aToken))==='0x')throw Error('ATOKEN_NOT_VERIFIED');
   const balance=BigInt(await new ethers.Contract(token.address,ERC20,provider).balanceOf(aToken));
   const status=flags(configuration);
   reserves.push({symbol:token.symbol,asset:token.address,aToken,decimals:token.decimals,
    configuration:status,availableUnderlyingRaw:balance.toString(),
    availableUnderlying:ethers.formatUnits(balance,token.decimals),
    eligibleForFurtherFlashLoanTesting:status.active&&!status.paused&&status.flashLoanEnabled&&balance>0n,
    note:'ATOKEN_UNDERLYING_BALANCE_IS_NOT_A_QUOTED_OR_GUARANTEED_FLASH_LOAN'});
  }catch(e){reserves.push({symbol:token.symbol,asset:token.address,eligibleForFurtherFlashLoanTesting:false,
   error:String(e.shortMessage||e.message||e).slice(0,120)})}
 }
 return {build:'RESEARCH_ONLY_AAVE_1',network:'BASE',chainId:8453,mode:'AAVE_V3_FLASHLOAN_READ_ONLY_RESERVE_CHECK',
  addressesProvider:PROVIDER,pool:poolAddress,dataProvider:DATA_PROVIDER,premiumBps:Number(premium),
  premiumPct:Number(premium)/100,reserves,loanRequested:false,loanPrincipalProvidedByUser:false,
  atomicForkTestPassed:false,netProfitVerified:false,qualifiedOpportunities:0,alerts:[],
  mainnetBroadcast:false,executionEligible:false,
  limitations:['READ_ONLY_CONFIRMED_STATE','FLASHLOAN_LIQUIDITY_IS_TRANSACTION_STATE_DEPENDENT','NO_ATOMIC_FORK_TEST','NO_GAS_OR_SWAP_QUOTES']};
}
if(require.main===module){
 const assert=require('node:assert/strict'),fs=require('node:fs');
 assert.equal(flags(1n<<63n).flashLoanEnabled,true);
 assert.equal(flags(1n<<60n).paused,true);
 assert.equal(feeFor(10000n,5n),5n);
 assert.equal(feeFor(10001n,5n),5n);
 assert.equal(feeFor(11000n,5n),6n);
 if(process.env.AAVE_RESEARCH_LIVE==='1'){
  const rpc=process.env.BASE_RPC_URL||'';
  if(!/^https:\/\//.test(rpc))throw Error('BASE_RPC_URL_REQUIRED');
  const provider=new ethers.JsonRpcProvider(rpc);
  check(provider).then(r=>{fs.writeFileSync('arbiflow-aave-read-only.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r))})
  .catch(e=>{console.error('AAVE_READ_ONLY_ERROR',String(e.message).slice(0,160));process.exitCode=1})
  .finally(()=>provider.destroy());
 }else console.log(JSON.stringify({build:'RESEARCH_ONLY_AAVE_1',unitAssertionsPassed:5}));
}
module.exports={check,flags,feeFor};
