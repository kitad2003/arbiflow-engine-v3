'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {classify}=require('./BaseRpcErrorClass129110');
test('rate limiting',()=>assert.equal(classify(429,429),'RATE_LIMIT'));
test('invalid request',()=>assert.equal(classify(400,-32600),'INVALID_REQUEST'));
test('missing method',()=>assert.equal(classify(200,-32601),'METHOD_NOT_FOUND'));
test('invalid parameters',()=>assert.equal(classify(400,-32602),'INVALID_PARAMS'));
test('authentication blocked',()=>assert.equal(classify(403,null),'AUTH_OR_PLAN_RESTRICTION'));
