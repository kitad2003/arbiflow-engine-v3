'use strict';
// Offline trade-size sweep. Results are theoretical, never actionable alerts.
const {estimateV2RoundTrip}=require('./v2-roundtrip-v7');
function sweepV2TradeSizes({amountsRaw,first,second}={}){
 const base={kind:'V2_THEORETICAL_SIZE_SWEEP',readOnly:true,executionEligible:false,profitVerified:false,alertEligible:false};
 if(!Array.isArray(amountsRaw)||amountsRaw.length===0||amountsRaw.length>64)return {...base,valid:false,reason:'INVALID_SIZE_LIST',results:[]};
 const seen=new Set(),results=[];
 for(const raw of amountsRaw){
  if(typeof raw!=='string'||!/^[1-9][0-9]*$/.test(raw)||seen.has(raw))return {...base,valid:false,reason:'INVALID_OR_DUPLICATE_SIZE',results:[]};
  seen.add(raw);
  const quote=estimateV2RoundTrip({amountInRaw:raw,first,second});
  results.push({amountInRaw:raw,valid:quote.valid,reason:quote.reason,grossDeltaRaw:quote.valid?quote.grossDeltaRaw:null,positiveGross:quote.valid?quote.positiveGross:false});
 }
 const valid=results.filter(x=>x.valid);
 const positive=valid.filter(x=>x.positiveGross);
 const best=positive.reduce((a,b)=>!a||BigInt(b.grossDeltaRaw)>BigInt(a.grossDeltaRaw)?b:a,null);
 return {...base,valid:valid.length>0,reason:valid.length?'THEORETICAL_ONLY':'NO_VALID_SIZES',sizesChecked:results.length,validSizes:valid.length,positiveGrossSizes:positive.length,bestTheoreticalPositive:best,results,limitations:['No onchain execution simulation','No gas or slippage','No verified pool identities or fee provenance','Not eligible for dashboard alert']};
}
module.exports={sweepV2TradeSizes};
