'use strict';
// Base swap-event-triggered cross-venue research. Quotes are AFTER BLOCK, not
// after triggering transaction; never claim historical backrun execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const POOLS=[{venue:'UNI',address:'0xd0b53d9277642d899df5c87a3966a349a798f224',fee:500},{venue:'AERO',address:'0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59',spacing:100}];
const U='0x222ca98f00ed15b1fae10b61c277703a194cf5d2',A='0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0',L='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const SWAP=ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)');
const SWAP_ALT=ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)'); // V3 compatible event only
const SIZES=[100,500,1000,2500];
function err(e){return String(e?.shortMessage||e?.reason||e?.code||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC]').slice(0,150)}
async function run(){
 const url=process.env.BASE_RPC_URL;assert(/^https:\/\//.test(url||''),'BASE_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(url,8453,{staticNetwork:true});
 const report={build:'12.9.87',mode:'SWAP_EVENT_TRIGGERED_BASE_CROSS_VENUE_BLOCK_END_QUOTES',
   status:'BLOCKED',eventsSeen:0,triggerBlocks:0,quotesAttempted:0,quotesCompleted:0,quoteFailures:0,
   positiveBeforeGas:0,spreadAboveHalfPercent:0,candidates:[],events:[],errors:[],
   qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,
   exactTransactionOrderingReconstructed:false,atomicForkReplayVerified:false};
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const head=await p.getBlockNumber(),start=Math.max(1,head-79);report.range=[start,head];
  const pools=POOLS.map(x=>x.address);
  const logs=await p.getLogs({address:pools,topics:[[SWAP,SWAP_ALT]],fromBlock:start,toBlock:head});
  report.eventsSeen=logs.length;
  const uniq=[...new Set(logs.map(x=>x.blockNumber))].sort((a,b)=>b-a).slice(0,8);
  report.triggerBlocks=uniq.length;
  report.events=logs.slice(-12).map(x=>({block:x.blockNumber,transactionHash:x.transactionHash,venue:x.address.toLowerCase()===POOLS[0].address.toLowerCase()?'UNI':'AERO'}));
  const uni=new ethers.Contract(U,['function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns(uint256,uint160,uint32,uint256)'],p);
  const aero=new ethers.Contract(A,['function quoteExactInputSingle((address,address,uint256,int24,uint160)) returns(uint256,uint160,uint32,uint256)'],p);
  const loan=new ethers.Contract(L,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p);
  async function quote(v,t0,t1,amount,block){
   return BigInt((v==='UNI'?await uni.quoteExactInputSingle.staticCall([t0,t1,amount,500,0],{blockTag:block}):
    await aero.quoteExactInputSingle.staticCall([t0,t1,amount,100,0],{blockTag:block}))[0]);
  }
  for(const block of uniq){
   const bps=BigInt(await loan.FLASHLOAN_PREMIUM_TOTAL({blockTag:block}));
   for(const dir of [['UNI','AERO'],['AERO','UNI']])for(const size of SIZES){
    report.quotesAttempted++;
    try{
     const amount=BigInt(size)*1000000n;
     const mid=await quote(dir[0],USDC,WETH,amount,block),returned=await quote(dir[1],WETH,USDC,mid,block);
     const premium=(amount*bps+9999n)/10000n,net=returned-amount-premium;
     const spreadBps=(returned-amount)*10000n/amount;
     report.quotesCompleted++;if(net>0n)report.positiveBeforeGas++;if(spreadBps>50n)report.spreadAboveHalfPercent++;
     const row={block,direction:dir.join('->'),sizeUsdc:size,returnUsdc:ethers.formatUnits(returned,6),
      afterPremiumBeforeGasUsdc:ethers.formatUnits(net,6),spreadBps:spreadBps.toString(),preGasPositive:net>0n,
      afterBlockQuote:true,backrunProven:false};
     if(report.candidates.length<16||net>0n)report.candidates.push(row);
    }catch(e){report.quoteFailures++;if(report.errors.length<8)report.errors.push({block,direction:dir.join('->'),sizeUsdc:size,error:err(e)})}
   }
  }
  report.status=report.eventsSeen===0?'NO_SWAP_EVENTS_IN_WINDOW':report.quotesCompleted===0?'BLOCKED':'EVENT_QUOTE_ANALYSIS_COMPLETE';
  report.reason=report.positiveBeforeGas?'INDICATIVE_POSITIVE_REQUIRES_TX_POSITION_REPLAY_AND_GAS':'NO_POSITIVE_PRE_GAS_ROUTE_IN_CHECKED_BLOCK_END_STATES';
  report.limitations=['Events trigger block-end quotes, not same-transaction post-state','Only two known pools and four sizes','No flash-loan execution, gas conversion or historical tx-order reconstruction','Event-signature match may omit non-V3-compatible swap events'];
 }catch(e){report.status='BLOCKED';report.reason=err(e)}
 finally{p.destroy()}
 fs.writeFileSync('arbiflow-swap-events-12987.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
if(require.main===module)run().catch(e=>{console.error('EVENT_DISCOVERY_12987_FAILED',err(e));process.exitCode=1});
module.exports={run};
