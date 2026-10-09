'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {continuity}=require('./BaseTraceContinuity12995');
const addr='0x'+'ab'.repeat(20);
test('consistent overlapping storage evidence',()=>{const r=continuity({post:{[addr]:{storage:{'0x01':'0x02'}}}},{pre:{[addr]:{storage:{'0x01':'0x0002'}}}});assert.equal(r.status,'PARTIAL_CONSISTENCY');assert.equal(r.checked,1);assert.equal(r.stateReconstructed,false)});
test('contradiction detected',()=>{const r=continuity({post:{[addr]:{balance:'0x02'}}},{pre:{[addr]:{balance:'0x03'}}});assert.equal(r.status,'INCONSISTENT');assert.equal(r.mismatches.length,1)});
test('unrelated slots do not prove continuity',()=>{const r=continuity({post:{[addr]:{storage:{'0x01':'0x02'}}}},{pre:{[addr]:{storage:{'0x03':'0x02'}}}});assert.equal(r.status,'NO_OVERLAPPING_FIELDS')});
test('missing trace reports gap',()=>assert.equal(continuity(null,{pre:{}}).status,'TRACE_PAIR_MISSING'));
