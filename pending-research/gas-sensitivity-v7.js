'use strict';
// Read-only sensitivity analysis in native wei. Never converts costs into trade-token profits.
function stressGasCost({coverage,feeMultipliersBps=[10000,12500,15000,20000]}={}){
 const base={valid:false,readOnly:true,costComplete:false,netVerified:false,alertEligible:false,executionEligible:false};
 if(!coverage||coverage.reason!=='RESEARCH_COST_COMPONENTS_ONLY'||typeof coverage.estimatedComponentsWei!=='string'||!/^[0-9]+$/.test(coverage.estimatedComponentsWei))return {...base,reason:'INCOMPLETE_COST_COVERAGE'};
 if(!Array.isArray(feeMultipliersBps)||feeMultipliersBps.length===0||feeMultipliersBps.length>16||feeMultipliersBps.some(x=>!Number.isSafeInteger(x)||x<10000||x>100000))return {...base,reason:'INVALID_STRESS_MULTIPLIERS'};
 if(!/^[0-9]+$/.test(coverage.baseGasWei||'')||!/^[0-9]+$/.test(coverage.l1DataFeeWei||'')||!/^[0-9]+$/.test(coverage.builderPaymentWei||''))return {...base,reason:'INVALID_COST_COMPONENTS'};
 const baseGas=BigInt(coverage.baseGasWei),data=BigInt(coverage.l1DataFeeWei),builder=BigInt(coverage.builderPaymentWei);
 if(baseGas+data+builder!==BigInt(coverage.estimatedComponentsWei))return {...base,reason:'INCONSISTENT_COST_COMPONENTS'};
 const scenarios=feeMultipliersBps.map(bps=>({feeMultiplierBps:bps,scenarioGasWei:String((baseGas*BigInt(bps)+9999n)/10000n+data+builder)}));
 return {...base,valid:true,reason:'UNVERIFIED_GAS_SENSITIVITY_ONLY',scenarios,limitations:['Multipliers apply only to base execution gas','L2 data fees and builder payments are held constant','No conversion to profit-token units or execution guarantee']};
}
module.exports={stressGasCost};
