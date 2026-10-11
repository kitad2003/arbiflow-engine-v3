'use strict';
const assert=require('node:assert/strict');
const {stressGasCost}=require('./gas-sensitivity-v7');
const coverage={reason:'RESEARCH_COST_COMPONENTS_ONLY',baseGasWei:'21000',l1DataFeeWei:'4000',builderPaymentWei:'500',estimatedComponentsWei:'25500'};
const x=stressGasCost({coverage});assert.equal(x.valid,true);assert.equal(x.scenarios[0].scenarioGasWei,'25500');assert.equal(x.scenarios[3].scenarioGasWei,'46500');assert.equal(x.netVerified,false);assert.equal(x.alertEligible,false);
assert.equal(stressGasCost({coverage:{...coverage,estimatedComponentsWei:'25501'}}).reason,'INCONSISTENT_COST_COMPONENTS');
assert.equal(stressGasCost({coverage,feeMultipliersBps:[9999]}).reason,'INVALID_STRESS_MULTIPLIERS');
assert.equal(stressGasCost({coverage:{...coverage,reason:'L2_DATA_FEE_NOT_ESTABLISHED'}}).reason,'INCOMPLETE_COST_COVERAGE');
console.log('V7_GAS_SENSITIVITY_OFFLINE_TEST_PASS');
