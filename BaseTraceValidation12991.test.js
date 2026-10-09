'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluateTrace}=require('./BaseTraceValidation12991');
const addr='0x'+'11'.repeat(20);
test('rejects missing trace',()=>assert.equal(evaluateTrace(null).traceShapeValid,false));
test('rejects call-tracer output',()=>assert.equal(evaluateTrace({type:'CALL'}).traceShapeValid,false));
test('accepts empty diff but not proof of replay',()=>{
 const r=evaluateTrace({pre:{},post:{}});assert.equal(r.traceShapeValid,true);assert.equal(r.reconstructed,false);assert.equal(r.hasChanges,false);
});
test('counts changed accounts but never claims reconstructed state',()=>{
 const r=evaluateTrace({pre:{[addr]:{balance:'0x1'}},post:{[addr]:{storage:{'0x01':'0x02'}}}});
 assert.equal(r.traceShapeValid,true);assert.equal(r.accountCountPre,1);assert.equal(r.accountCountPost,1);assert.equal(r.reconstructed,false);
});
test('rejects malformed storage diff',()=>assert.equal(evaluateTrace({pre:{},post:{[addr]:{storage:{'bad slot':'0x2'}}}}).traceShapeValid,false));
test('rejects arrays',()=>assert.equal(evaluateTrace({pre:[],post:[]}).traceShapeValid,false));
