'use strict';
// Build 12.9.5: offline/fork-safe preflight. No flash loan is requested.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'ArbiFlowCrossVenueForkPrototype1295.sol'),'utf8');
assert.match(source,/function execute\(Plan calldata\) external pure \{revert ExecutionNotImplemented\(\);\}/);
assert.match(source,/function executeOperation\([^\n]+revert ExecutionNotImplemented\(\);\}/);
assert.match(source,/p\.buyVenue==p\.sellVenue/);
assert.match(source,/p\.expiresAt<=block\.timestamp/);
console.log(JSON.stringify({success:true,build:'12.9.5',test:'SOURCE_FAIL_CLOSED_ASSERTIONS',passed:true,atomicForkTestPassed:false,gasUnitsMeasured:false,executionEligible:false}));
