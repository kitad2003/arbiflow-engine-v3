'use strict';
// V24: exact revert identification and local-fork accounting, without mainnet broadcasts.
const hre=require('hardhat');const {ethers,network}=hre;
const {FACTORIES}=require('./verified-pairs-v12');
const VAULT='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
const UNI='0x15ab0333985fd1e289adf4fbbe19261454776642';
const SUSHI='0x2F8AC927aa94293461C75406e90Ec0cCFb2748d9';
const amount=10n**14n;
function errText(e){return [e.reason,e.shortMessage,e.message,e.info?.error?.message].filter(Boolean).join(' | ').slice(0,500)}
async function run(){
 if((await ethers.provider.getNetwork()).chainId!==31337n)throw Error('LOCAL_FORK_ONLY');
 const [operator,outsider]=await ethers.getSigners();
 const F=await ethers.getContractFactory('BalancerEthereumAtomicV23',operator);
 const c=await F.deploy(VAULT,WETH,MLN,FACTORIES.UNISWAP_V2,FACTORIES.SUSHISWAP_V2);await c.waitForDeployment();
 const token=new ethers.Contract(WETH,['function balanceOf(address) view returns(uint256)'],ethers.provider);
 const tests=[];
 async function test(label,expected,fn){
  const snap=await network.provider.send('evm_snapshot');
  let reverted=false,reason='',gasEstimate=null;
  try{
   try{gasEstimate=(await fn(true)).toString()}catch(e){reason=errText(e)}
   const tx=await fn(false);await tx.wait();
  }catch(e){reverted=true;reason=errText(e)}
  await network.provider.send('evm_revert',[snap]);
  const exact=reason.includes(expected);
  tests.push({label,expected,reverted,exact,gasEstimate,reason:reason.slice(0,190),pass:reverted&&exact});
 }
 const call=(first,second,minFirst,minSecond,minProfit,from=operator,estimate=false)=>{
  const contract=c.connect(from);const args=[first,second,amount,minFirst,minSecond,minProfit,{gasLimit:4000000}];
  return estimate?contract.makeFlashLoan.estimateGas(...args):contract.makeFlashLoan(...args);
 };
 // eth_call preserves Solidity Error(string) returndata for precise operator authorization checks.
 // This avoids Hardhat's non-decoded error text for an actual reverted transaction.
 const unauthData=c.interface.encodeFunctionData('makeFlashLoan',[UNI,SUSHI,amount,1n,1n,1n]);
 let operatorRevertData=null,operatorReason=null;
 try{await ethers.provider.call({from:outsider.address,to:await c.getAddress(),data:unauthData});}
 catch(e){
  const hex=[e.data,e.error?.data,e.info?.error?.data].find(x=>typeof x==='string'&&ethers.isHexString(x));
  if(hex){operatorRevertData=hex;try{operatorReason=ethers.AbiCoder.defaultAbiCoder().decode(['string'],'0x'+hex.slice(10))[0]}catch{}}
 }
 const operatorExact=operatorRevertData?.slice(0,10)==='0x08c379a0'&&operatorReason==='NOT_OPERATOR_OR_BUSY';
 tests.push({label:'unauthorized_operator',expected:'NOT_OPERATOR_OR_BUSY',
  reverted:operatorRevertData!==null,exact:operatorExact,gasEstimate:null,
  reason:operatorReason||'NO_DECODABLE_REVERT_DATA',pass:operatorExact});

 // A real EOA lacks the pair.factory() interface. Revert may have no reason.
 await test('wrong_factory_order','WRONG_FACTORY',e=>call(SUSHI,UNI,1,1,1,operator,e));
 await test('first_leg_min_output','SLIPPAGE_OR_NO_OUTPUT',e=>call(UNI,SUSHI,ethers.MaxUint256,1,1,operator,e));
 await test('second_leg_min_output','SLIPPAGE_OR_NO_OUTPUT',e=>call(UNI,SUSHI,1,ethers.MaxUint256,1,operator,e));
 await test('unprofitable_roundtrip','NO_NET_ARBITRAGE',e=>call(UNI,SUSHI,1,1,1,operator,e));
 const validPools=await Promise.all([UNI,SUSHI].map(a=>new ethers.Contract(a,[
  'function factory() view returns(address)','function token0() view returns(address)','function token1() view returns(address)'],ethers.provider)));
 const identities=await Promise.all(validPools.map(async(p,i)=>({
  venue:i===0?'UNISWAP_V2':'SUSHISWAP_V2',
  factoryMatch:(await p.factory()).toLowerCase()===(i===0?FACTORIES.UNISWAP_V2:FACTORIES.SUSHISWAP_V2).toLowerCase(),
  tokensMatch:[(await p.token0()).toLowerCase(),(await p.token1()).toLowerCase()].sort().join(',')===[WETH.toLowerCase(),MLN.toLowerCase()].sort().join(',')
 })));
 const vaultBalance=await token.balanceOf(VAULT);
 const successCases=tests.filter(x=>x.pass).length;
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V24',mode:'LOCAL_FORK_REVERT_REASON_AND_STATE_PRECHECK',
  results:tests,exactAssertionsPassed:successCases,totalAssertions:tests.length,
  poolIdentities:identities,vaultWethRaw:vaultBalance.toString(),
  successfulFlashLoanObserved:false,gasUsedFromSuccessfulTransaction:null,
  atomicRepaymentSuccessVerified:false,mainnetBroadcast:false,
  executionEligible:false,deploymentReady:false,
  limitations:['NO_PROFITABLE_DIRECTION_IN_OBSERVED_PRE_TARGET_STATE',
  'ESTIMATED_GAS_MAY_FAIL_FOR_REVERTING_TRANSACTIONS',
  'UNREGISTERED_EOA_POOL_REVERT_HAS_NO_CUSTOM_ERROR',
  'NO_TARGET_FIRST_BUNDLE_SIMULATION']}));
 if(successCases!==tests.length||identities.some(x=>!x.factoryMatch||!x.tokensMatch))process.exitCode=1;
}
run().catch(e=>{console.error('V24_ERROR',String(e.message).slice(0,180));process.exitCode=1});
