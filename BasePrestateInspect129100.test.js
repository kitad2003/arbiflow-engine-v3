'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect}=require('./BasePrestateInspect129100');
test('missing snapshot blocked',()=>assert.equal(inspect(null).available,false));
test('empty snapshot blocked',()=>assert.equal(inspect({}).available,false));
test('nonempty object is only partial evidence',()=>{const v=inspect({'0x123':{}});assert.equal(v.available,true);assert.equal(v.fullCheckpoint,false);assert.equal(v.verifiedAgainstFork,false)});
