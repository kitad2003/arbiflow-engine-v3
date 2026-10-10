'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect}=require('./BasePrestateInspect129100');
const a='0x'+'11'.repeat(20),w='0x'+'00'.repeat(32);
test('missing and empty rejected',()=>{assert.equal(inspect(null).available,false);assert.equal(inspect({}).available,false)});
test('malformed addresses rejected',()=>assert.equal(inspect({'0x123':{}}).reason,'INVALID_ADDRESS'));
test('valid partial snapshot remains unverified',()=>{const x=inspect({[a]:{nonce:'0x0',balance:'0xa',code:'0x',storage:{[w]:w}}});assert.equal(x.available,true);assert.equal(x.storageSlotsAccessed,1);assert.equal(x.fullCheckpoint,false)});
test('invalid storage rejected',()=>assert.equal(inspect({[a]:{storage:{bad:w}}}).reason,'INVALID_STORAGE_WORD'));
test('invalid balance rejected',()=>assert.equal(inspect({[a]:{balance:'0xZZ'}}).reason,'INVALID_BALANCE'));

test('Geth integer nonce is accepted without claiming full checkpoint',()=>{const x=inspect({[a]:{nonce:12,balance:'0x0'}});assert.equal(x.available,true);assert.equal(x.fullCheckpoint,false)});
test('negative and fractional nonces rejected',()=>{for(const n of [-1,1.5,Number.POSITIVE_INFINITY])assert.equal(inspect({[a]:{nonce:n}}).reason,'INVALID_NONCE')});
