'use strict';
// 12.9.21 Aave flash-loan repayment evidence, read-only. No mainnet writes.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const abi=new ethers.Interface([
 'event FlashLoan(address indexed target,address indexed initiator,address indexed asset,uint256 amount,uint8 interestRateMode,uint256 premium,uint16 referralCode)',
 'event Transfer(address indexed from,address indexed to,uint256 value)'
]);
const topicFlash=abi.getEvent('FlashLoan').topicHash,topicTransfer=abi.getEvent('Transfer').topicHash;
const lower=x=>String(x||'').toLowerCase();
function check({logs,status,executor,aToken}){
 const out={exactRepaymentVerified:false,flashLoanEvents:0,borrowTransferMatched:false,repaymentTransferMatched:false,principalRaw:null,premiumRaw:null,reason:null};
 if(status!==1){out.reason='RECEIPT_NOT_SUCCESSFUL';return out;}
 if(!ethers.isAddress(executor||'')||!ethers.isAddress(aToken||'')){out.reason='MISSING_EXECUTOR_OR_RESERVE_ATOKEN';return out;}
 const transfers=[],loans=[];
 for(const l of logs||[]){
  try{
   if(lower(l.address)===lower(USDC)&&l.topics?.[0]===topicTransfer){const d=abi.parseLog(l);transfers.push({from:lower(d.args.from),to:lower(d.args.to),amount:BigInt(d.args.value)});}
   if(lower(l.address)===lower(POOL)&&l.topics?.[0]===topicFlash){const d=abi.parseLog(l);if(lower(d.args.target)===lower(executor)&&lower(d.args.asset)===lower(USDC)&&BigInt(d.args.interestRateMode)===0n)loans.push({amount:BigInt(d.args.amount),premium:BigInt(d.args.premium)});}
  }catch{}
 }
 out.flashLoanEvents=loans.length;
 if(loans.length!==1){out.reason='EXPECTED_ONE_MATCHING_FLASH_LOAN';return out;}
 const {amount,premium}=loans[0];out.principalRaw=amount.toString();out.premiumRaw=premium.toString();
 out.borrowTransferMatched=transfers.some(t=>t.from===lower(aToken)&&t.to===lower(executor)&&t.amount===amount);
 out.repaymentTransferMatched=transfers.some(t=>t.from===lower(executor)&&t.to===lower(aToken)&&t.amount===amount+premium);
 out.exactRepaymentVerified=out.borrowTransferMatched&&out.repaymentTransferMatched;
 out.reason=out.exactRepaymentVerified?null:'EXACT_TRANSFERS_NOT_PRESENT';
 return out;
}
async function verifyTx({rpcUrl,txHash,executor}){
 if(!/^https:\/\//.test(rpcUrl||'')||!/^0x[0-9a-fA-F]{64}$/.test(txHash||'')||!ethers.isAddress(executor||''))throw Error('VALID_RPC_TX_AND_EXECUTOR_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const receipt=await p.getTransactionReceipt(txHash);
  if(!receipt)return {success:true,build:'12.9.21',transactionFound:false,qualified:false,alerts:[]};
  const reserveAbi=['function getReserveData(address) view returns((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))'];
  const pool=new ethers.Contract(POOL,reserveAbi,p);
  const reserve=await pool.getReserveData(USDC,{blockTag:receipt.blockNumber});
  const proof=check({logs:receipt.logs,status:receipt.status,executor,aToken:reserve.aTokenAddress});
  return {success:true,build:'12.9.21',txHash,blockNumber:receipt.blockNumber,transactionFound:true,...proof,netProfitVerified:false,qualified:false,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy();}
}
module.exports={check,verifyTx};
if(require.main===module){
 const a='0x0000000000000000000000000000000000000001',x='0x0000000000000000000000000000000000000002',i='0x0000000000000000000000000000000000000003';
 const event=(address,name,args)=>({address,...abi.encodeEventLog(abi.getEvent(name),args)});
 const loan=event(POOL,'FlashLoan',[x,i,USDC,1000000000n,0,500000n,0]),out=event(USDC,'Transfer',[a,x,1000000000n]),back=event(USDC,'Transfer',[x,a,1000500000n]);
 assert.equal(check({logs:[loan,out,back],status:1,executor:x,aToken:a}).exactRepaymentVerified,true);
 assert.equal(check({logs:[loan,out],status:1,executor:x,aToken:a}).exactRepaymentVerified,false);
 assert.equal(check({logs:[loan,out,event(USDC,'Transfer',[x,a,1000000000n])],status:1,executor:x,aToken:a}).exactRepaymentVerified,false);
 assert.equal(check({logs:[loan,out,back],status:0,executor:x,aToken:a}).exactRepaymentVerified,false);
 console.log(JSON.stringify({success:true,build:'12.9.21',syntheticChecksPassed:4,realTransactionProofChecked:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false}));
 if(process.env.EVIDENCE_TX_HASH&&process.env.EVIDENCE_EXECUTOR)verifyTx({rpcUrl:process.env.BASE_RPC_URL,txHash:process.env.EVIDENCE_TX_HASH,executor:process.env.EVIDENCE_EXECUTOR}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('REPAYMENT_PROOF_FAILED',String(e?.shortMessage||e?.message||e).slice(0,250));process.exitCode=1});
}
