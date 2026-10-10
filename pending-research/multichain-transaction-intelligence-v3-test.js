'use strict';
const assert=require('node:assert/strict');
const {classify}=require('./multichain-transaction-intelligence-v3-classifier');
const t=(to,input)=>({hash:'0x'+'a'.repeat(64),to,input});
assert.equal(classify('ethereum',t('0xdac17f958d2ee523a2206206994597c13d831ec7','0xa9059cbb')).kind,'ERC20_TRANSFER_SELECTOR');
assert.equal(classify('base',t('0x'+'1'.repeat(40),'0x3593564c')).kind,'SWAP_SELECTOR_UNVERIFIED_DESTINATION');
assert.equal(classify('ethereum',t('0x7a250d5630b4cf539739df2c5dacab4c659f2488','0x7ff36ab5')).kind,'KNOWN_ROUTER_SWAP_SELECTOR');
assert.equal(classify('ethereum',t(null,'0x')).kind,'CONTRACT_CREATION');
console.log('MULTICHAIN_TRANSACTION_INTELLIGENCE_V3_TEST_PASS');
