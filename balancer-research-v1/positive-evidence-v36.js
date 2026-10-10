'use strict';
// V36: retain V35 gross-positive observations with transparent cost assumptions.
// Not target-applied state, executable profit, or a permission to submit bundles.
const {ethers}=require('ethers');
const {run:monitor}=require('./persistent-monitor-v34');
const {evaluate}=require('./pending-gross-gate-v35');
function costs(record,{gasPriceWei=0n,gasUnits=300000n,flashFeeBps=0n,builderBidWei=0n}={}){
 const q=record?.bestGrossQuote;
 if(!q?.grossPositive)return {status:'NOT_POSITIVE',netVerified:false};
 const gross=BigInt(q.grossWei),principal=BigInt(q.borrowWei);
 const gas=gasPriceWei*gasUnits,loanFee=(principal*flashFeeBps+9999n)/10000n;
 const net=gross-gas-loanFee-builderBidWei;
 return {status:'GROSS_POSITIVE_ESTIMATE_ONLY',grossWei:gross.toString(),principalWei:principal.toString(),
  assumedGasWei:gas.toString(),assumedFlashFeeWei:loanFee.toString(),assumedBuilderBidWei:builderBidWei.toString(),
  assumedNetWei:net.toString(),assumedNetPositive:net>0n,
  gasPriceKnown:gasPriceWei>0n,flashFeeVerified:false,builderBidVerified:false,
  contractCompatible:record.v26TokenCompatible===true,netVerified:false,executionEligible:false};
}
async function run({provider,monitorImpl=monitor,evaluateImpl=evaluate,runtimeMs=240000}={}){
 const result={build:'BALANCER_RESEARCH_V36',mode:'PENDING_GROSS_POSITIVE_EVIDENCE',
  pendingSwapEvents:0,assessed:0,positiveGrossCount:0,compatiblePositive:0,
  assumedNetPositive:0,rejected:0,positiveRecords:[],recordsTruncated:0,
  simulationAttempted:false,bundlesSubmitted:0,mainnetBroadcast:false,executionEligible:false};
 const seen=new Set();
 const monitored=await monitorImpl({runtimeMs,onEvent:async event=>{
  if(event.kind!=='PENDING_TRANSACTION'||!event.pendingHash||!event.swapPools?.length)return;
  result.pendingSwapEvents++;
  if(seen.has(event.pendingHash))return;seen.add(event.pendingHash);
  let record;try{record=await evaluateImpl(event,{provider})}catch{result.rejected++;return}
  result.assessed++;
  if(!record.bestGrossQuote?.grossPositive){result.rejected++;return}
  result.positiveGrossCount++;
  const fee=provider?await provider.getFeeData().catch(()=>null):null;
  const assumed=costs(record,{gasPriceWei:BigInt(fee?.gasPrice||0n)});
  if(assumed.contractCompatible)result.compatiblePositive++;
  if(assumed.assumedNetPositive&&assumed.gasPriceKnown)result.assumedNetPositive++;
  const observation={targetHash:event.pendingHash,pool:record.pool,alternatePool:record.alternativePool,
   token0:record.token0,token1:record.token1,verifiedBlock:record.verifiedBlock,
   direction:record.bestGrossQuote.direction,...assumed,simulated:false};
  if(result.positiveRecords.length<60)result.positiveRecords.push(observation);
  else result.recordsTruncated++;
 }});
 return {...result,monitor:monitored,
  limitations:['CONFIRMED_PRE_TARGET_RESERVES_ONLY','GAS_UNITS_ASSUMED_300000',
   'FLASH_LOAN_FEE_AND_BUILDER_BID_ASSUMED_ZERO_UNVERIFIED',
   'NO_TARGET_STATE_SIMULATION','NO_MAINNET_SUBMISSION']};
}
module.exports={costs,run};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL)throw Error('ETHEREUM_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 run({provider:p}).then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('V36_FAILED',String(e.message).slice(0,160));process.exitCode=1})
 .finally(()=>p.destroy());
}