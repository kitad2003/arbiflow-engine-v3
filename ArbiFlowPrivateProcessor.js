'use strict';
// Private calculation layer. No wallet, transaction signing, or trading interfaces.
const fs=require('node:fs');
const THRESHOLD_BPS=50;
function analyze(report){
 const groups=report?.results||{},rows=[];
 for(const type of ['triangular','twoPool'])for(const route of groups[type]||[])for(const s of route.sizes||[]){
  if(!s.success)continue;
  const gross=Number(s.grossUsdc),loan=Number(s.sizeUsdc),aave=Number(s.afterAaveBeforeGasUsdc);
  if(![gross,loan,aave].every(Number.isFinite)||loan<=0)continue;
  rows.push({type,path:route.path,pools:route.pools,loanUsdc:loan,spreadPct:gross/loan*100,afterAaveBeforeGasUsdc:aave,gasUsdc:null,l1FeeUsdc:null,slippageUsdc:null,netUsdc:null,risk:'UNVERIFIED',forkVerified:false,state:'CONFIRMED_BLOCK_SNAPSHOT',observedAt:report.createdAt||null,reason:'UNVERIFIED_COSTS_AND_ATOMIC_EXECUTION'});
 }
 rows.sort((a,b)=>b.afterAaveBeforeGasUsdc-a.afterAaveBeforeGasUsdc);
 return {diagnostics:rows.slice(0,100),qualified:[],counts:{evaluated:rows.length,positiveAfterAave:rows.filter(x=>x.afterAaveBeforeGasUsdc>0).length,spreadOverHalfPercent:rows.filter(x=>x.spreadPct>0.5).length,qualified:0},safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false,thresholdBpsExclusive:THRESHOLD_BPS}};
}
function fromReportFile(path){try{return analyze(JSON.parse(fs.readFileSync(path,'utf8')))}catch{return analyze(null)}}
module.exports={analyze,fromReportFile};
