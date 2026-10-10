'use strict';
const assert=require('node:assert/strict');
const {classify}=require('./pending-investigation-v3');
assert.equal(classify({to:null,input:'0x'}).classification,'CONTRACT_CREATION');
assert.equal(classify({to:'0x0000000000000000000000000000000000000001',input:'0x'}).classification,'NO_CALLDATA');
assert.equal(classify({to:'0x0000000000000000000000000000000000000001',input:'0x38ed1739'}).classification,'KNOWN_SELECTOR_UNVERIFIED_DESTINATION');
assert.equal(classify({to:'0x7a250d5630b4cf539739df2c5dacab4c659f2488',input:'0x38ed1739'}).classification,'KNOWN_ROUTER_KNOWN_SELECTOR');
assert.equal(classify({to:'0x0000000000000000000000000000000000000001',input:'0xabcdef12'}).classification,'UNKNOWN_SELECTOR_UNVERIFIED_DESTINATION');
console.log('PENDING_INVESTIGATION_V3_CLASSIFICATION_TEST_PASS');
