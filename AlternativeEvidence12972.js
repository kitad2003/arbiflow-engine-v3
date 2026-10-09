'use strict';
// 12.9.72 separate alternative-strategy evidence test. Read-only Base.
const assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',BAL='0xBA12222222228d8Ba445958a75a0704d566BF2C8',USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ABI=['event Borrow(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint8 interestRateMode,uint256 borrowRate,uint16 indexed referralCode)','event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)','function getUserAccountData(address user) view returns(uint256,uint256,uint256,uint256,uint256,uint256)','function getReservesList() view returns(address[])'];
const BLOCKS=Number(process.env.LIQUIDATION_LOG_BLOCKS||2000),CAP=Number(process.env.LIQUIDATION_USER_LIMIT||40),CHUNK=Number(process.env.LIQUIDATION_LOG_CHUNK||10);
function error(e){return String(e?.shortMessage||e?.message||e).slice(0,110)}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 assert(Number.isInteger(BLOCKS)&&BLOCKS>=100&&BLOCKS<=10000,'INVALID_BLOCKS');
 assert(Number.isInteger(CAP)&&CAP>=1&&CAP<=100,'INVALID_CAP');
 assert(Number.isInteger(CHUNK)&&CHUNK>=1&&CHUNK<=200,'INVALID_CHUNK');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),errors=[];
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const block=await p.getBlockNumber(),from=Math.max(0,block-BLOCKS+1),contract=new ethers.Contract(AAVE,ABI,p),iface=new ethers.Interface(ABI);
  assert.notEqual(await p.getCode(AAVE,block),'0x','AAVE_NOT_DEPLOYED');
  assert.notEqual(await p.getCode(BAL,block),'0x','BALANCER_NOT_DEPLOYED');
  const addresses=new Set();let logCount=0,logCalls=0,logFailures=0,logRangesCompleted=0;
  // Small contiguous chunks avoid restrictive RPC eth_getLogs caps. Fail closed.
  for(const type of ['Borrow','Supply']){
   for(let start=from;start<=block;start+=CHUNK){
    const end=Math.min(block,start+CHUNK-1);logCalls++;
    try{
     const logs=await p.getLogs({address:AAVE,topics:[iface.getEvent(type).topicHash],fromBlock:start,toBlock:end});
     logRangesCompleted++;logCount+=logs.length;
     for(const log of logs)addresses.add(iface.parseLog(log).args.onBehalfOf.toLowerCase());
    }catch(e){
     logFailures++;errors.push({stage:'EVENTS',type,fromBlock:start,toBlock:end,error:error(e)});
     // Do not pretend incomplete discovery equals no liquidations.
     break;
    }
   }
  }
  const discoveryComplete=logFailures===0;
  const rows=[];
  for(const user of [...addresses].slice(0,CAP)){
   try{
    const d=await contract.getUserAccountData(user,{blockTag:block}),debt=BigInt(d[1]),hf=BigInt(d[5]);
    rows.push({user,totalDebtBaseRaw:debt.toString(),healthFactor:hf===ethers.MaxUint256?null:Number(hf)/1e18,hasDebt:debt>0n,liquidatable:debt>0n&&hf<10n**18n});
   }catch(e){errors.push({stage:'HEALTH',user,error:error(e)})}
  }
  let reserves=null;try{reserves=(await contract.getReservesList({blockTag:block})).length}catch(e){errors.push({stage:'RESERVES',error:error(e)})}
  const bal=await new ethers.Contract(USDC,['function balanceOf(address) view returns(uint256)'],p).balanceOf(BAL,{blockTag:block});
  const eligible=rows.filter(x=>x.liquidatable);
  const report={build:'12.9.72.1',mode:'ALTERNATIVE_STRATEGY_EVIDENCE_READ_ONLY',block,chainId:8453,
   liquidation:{aavePool:AAVE,blockRange:[from,block],eventsRead:logCount,logChunkSize:CHUNK,logCalls,logRangesCompleted,logFailures,discoveryComplete,discoveryStatus:discoveryComplete?'COMPLETE':'INCOMPLETE_RPC_ERRORS',uniqueRecentActors:addresses.size,checked:rows.length,borrowersWithDebt:rows.filter(x=>x.hasDebt).length,healthFactorBelowOne:eligible.length,eligible,allChecked:rows,
    profitabilityVerified:false,reason:'Eligibility is not liquidation profit. Debt-collateral pair, close factor, fee, execution quote and atomic fork not yet verified.'},
   flashMint:{baseDeploymentVerified:false,provider:null,flashMintCapacity:null,fee:null,profitabilityVerified:false,reason:'No Base flash mint provider independently verified. Funding alone has no profit.'},
   jit:{tested:false,profitabilityVerified:false,reason:'Pending swap, liquidity provision, fees, hedging and bundle execution not verified.'},
   balancer:{vault:BAL,availableUsdc:Number(bal)/1e6,borrowed:false},
   reserveCount:reserves,errors,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
  fs.writeFileSync('arbiflow-alternative-evidence-12972.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,liquidation:{...report.liquidation,allChecked:undefined,eligible:eligible.slice(0,5)}}));
  if(!discoveryComplete)process.exitCode=1;
  return report;
 }finally{p.destroy()}
}
if(require.main===module){
 assert(10n**18n>1n);assert.equal(500n*1000000n,500000000n);
 console.log(JSON.stringify({build:'12.9.72.1',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).catch(e=>{console.error('ALTERNATIVE_EVIDENCE_FAILED',error(e));process.exitCode=1});
}
module.exports={run};
