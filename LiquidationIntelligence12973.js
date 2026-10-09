'use strict';
// Build 12.9.73: expanded Base Aave borrower discovery and near-liquidation ranking.
// Strictly observational: no liquidation, repayment, flash loans or profit assertions.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const EVENTS=['event Borrow(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint8 interestRateMode,uint256 borrowRate,uint16 indexed referralCode)','event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)'];
const ABI=[...EVENTS,'function getUserAccountData(address user) view returns(uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)'];
const WINDOWS=Number(process.env.LIQUIDATION_WINDOWS||3),BLOCKS=Number(process.env.LIQUIDATION_BLOCKS_PER_WINDOW||2000),CHUNK=Number(process.env.LIQUIDATION_LOG_CHUNK||10),CAP=Number(process.env.LIQUIDATION_USER_LIMIT||400);
function msg(e){return String(e?.shortMessage||e?.message||e).slice(0,130)}
function rank(a,b){return a.healthFactor-b.healthFactor}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 assert(Number.isInteger(WINDOWS)&&WINDOWS>=1&&WINDOWS<=10&&Number.isInteger(BLOCKS)&&BLOCKS>=100&&BLOCKS<=10000&&Number.isInteger(CHUNK)&&CHUNK>=1&&CHUNK<=100&&Number.isInteger(CAP)&&CAP>=1&&CAP<=2000,'BAD_SCAN_CONFIG');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),errors=[];
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const block=await p.getBlockNumber(),c=new ethers.Contract(POOL,ABI,p),iface=new ethers.Interface(ABI);
  assert.notEqual(await p.getCode(POOL,block),'0x','AAVE_POOL_MISSING');
  const addresses=new Set(),windows=[];let logCalls=0,logFailures=0,totalEvents=0;
  // Older positions discovered through multiple disjoint historical windows;
  // incomplete windows always remain marked incomplete.
  for(let index=0;index<WINDOWS;index++){
   const end=block-index*BLOCKS,start=Math.max(0,end-BLOCKS+1);if(end<0)break;
   const win={index,start,end,events:0,failedChunks:0,completedChunks:0};
   for(const event of ['Borrow','Supply']){
    for(let from=start;from<=end;from+=CHUNK){
     const to=Math.min(end,from+CHUNK-1);logCalls++;
     try{
      const logs=await p.getLogs({address:POOL,topics:[iface.getEvent(event).topicHash],fromBlock:from,toBlock:to});
      win.completedChunks++;win.events+=logs.length;totalEvents+=logs.length;
      for(const log of logs)addresses.add(iface.parseLog(log).args.onBehalfOf.toLowerCase());
     }catch(e){logFailures++;win.failedChunks++;errors.push({stage:'EVENT_LOG',event,from,to,error:msg(e)});break}
    }
   }
   win.complete=win.failedChunks===0;windows.push(win);
  }
  const candidates=[...addresses],checked=[],healthFailures=0;
  for(const user of candidates.slice(0,CAP)){
   try{const d=await c.getUserAccountData(user,{blockTag:block}),debt=BigInt(d.totalDebtBase),hf=BigInt(d.healthFactor);
    checked.push({user,hasDebt:debt>0n,totalDebtBaseRaw:debt.toString(),healthFactor:debt>0n?Number(hf)/1e18:null,
     eligibleForLiquidation:debt>0n&&hf<10n**18n});
   }catch(e){healthFailures++;errors.push({stage:'HEALTH',user,error:msg(e)})}
  }
  const withDebt=checked.filter(x=>x.hasDebt).sort(rank),eligible=withDebt.filter(x=>x.eligibleForLiquidation);
  const watch=withDebt.filter(x=>x.healthFactor>=1&&x.healthFactor<=1.10);
  const complete=logFailures===0&&healthFailures===0&&candidates.length<=CAP;
  const out={build:'12.9.73',mode:'EXPANDED_AAVE_LIQUIDATION_DISCOVERY',block,windows,logs:{events:totalEvents,calls:logCalls,failures:logFailures},
   candidatesDiscovered:candidates.length,accountsAttempted:Math.min(CAP,candidates.length),accountsChecked:checked.length,healthFailures,
   borrowersWithDebt:withDebt.length,liquidatable:eligible.length,nearLiquidation:watch.length,
   topLowestHealth:withDebt.slice(0,20),eligibleBorrowers:eligible,watchBorrowers:watch,
   scanComplete:complete,coverageLimitations:['ONLY_BORROW_SUPPLY_ACTIVITY_IN_SCANNED_WINDOWS','HISTORICAL_BORROWERS_OUTSIDE_WINDOWS_NOT_INCLUDED',...(candidates.length>CAP?['USER_LIMIT_EXCEEDED']:[])],
   profitabilityVerified:false,atomicForkVerified:false,liquidationBonusVerified:false,collateralSaleVerified:false,gasVerified:false,
   qualified:0,alerts:[],errors:errors.slice(0,100),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
  fs.writeFileSync('arbiflow-liquidation-intelligence-12973.json',JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({...out,eligibleBorrowers:eligible.slice(0,10),watchBorrowers:watch.slice(0,10)}));
  if(logFailures||healthFailures)process.exitCode=1;
  return out;
 }finally{p.destroy()}
}
if(require.main===module){assert(rank({healthFactor:1.01},{healthFactor:1.1})<0);assert(10n**18n>0n);
 console.log(JSON.stringify({build:'12.9.73',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL).catch(e=>{console.error('LIQUIDATION_12973_FAILED',msg(e));process.exitCode=1})}
module.exports={run,rank};
