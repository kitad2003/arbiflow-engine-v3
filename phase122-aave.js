'use strict';
// Phase 12.2: Aave V3 Base flash-loan READ-ONLY liquidity/fee probe.
const {Interface}=require('ethers');
const provider='0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D';
const expectedPool='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const usdc='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const providerAbi=new Interface(['function getPool() view returns(address)']);
const poolAbi=new Interface(['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)']);
const tokenAbi=new Interface(['function balanceOf(address) view returns(uint256)']);
async function read(rpc,chain,to,iface,fn,args=[]){const result=await rpc(chain,'eth_call',[{to,data:iface.encodeFunctionData(fn,args)},'latest']);return iface.decodeFunctionResult(fn,result)[0];}
async function probe(chain,rpc){
 if(Number(chain?.chainId)!==8453)throw Error('BASE_CHAIN_REQUIRED');
 const pool=await read(rpc,chain,provider,providerAbi,'getPool');
 if(pool.toLowerCase()!==expectedPool.toLowerCase())throw Error('AAVE_POOL_ADDRESS_MISMATCH');
 const premium=BigInt(await read(rpc,chain,pool,poolAbi,'FLASHLOAN_PREMIUM_TOTAL'));
 if(premium>10000n)throw Error('INVALID_PREMIUM_BPS');
 const balance=BigInt(await read(rpc,chain,usdc,tokenAbi,'balanceOf',[pool]));
 return {status:'AAVE_BASE_ONCHAIN_READS_VERIFIED',provider:'AAVE_V3',chainId:8453,addressesProvider:provider,pool,asset:usdc,assetSymbol:'USDC',assetDecimals:6,poolTokenBalanceRaw:balance.toString(),poolTokenBalanceUsdc:(Number(balance)/1e6).toFixed(2),premiumBps:Number(premium),premiumPct:Number(premium)/100,availableFlashLoanAmountVerified:false,loanExecutionVerified:false,callbackVerified:false,notes:['POOL_TOKEN_BALANCE_IS_NOT_GUARANTEED_FLASH_LOAN_CAPACITY','RESERVE_PAUSE_AND_FLASHLOAN_ENABLEMENT_NOT_CHECKED','PREMIUM_CAN_CHANGE','NO_LOAN_EXECUTED'],safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
}
module.exports={probe};
