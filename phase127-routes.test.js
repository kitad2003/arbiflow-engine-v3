'use strict';
const assert=require('node:assert/strict');
const {Interface}=require('ethers');
const {scan}=require('./phase127-routes');
(async()=>{
 let calls=0;
 const rpc=async(_chain,method)=>{
  calls++;
  if(method==='eth_chainId')return '0x2105';
  if(method==='eth_blockNumber')return '0x100';
  if(method==='eth_call')return new Interface(['function getPool(address,address,uint24) view returns(address)']).encodeFunctionResult('getPool',['0x0000000000000000000000000000000000000000']);
  throw Error('UNEXPECTED_RPC_METHOD');
 };
 // Empty pool discovery must fail closed even if the RPC only returns empty pools.
 const empty=await scan({chainId:8453},rpc,100);
 assert.equal(empty.qualified,0);assert.deepEqual(empty.alerts,[]);
 assert.equal(empty.safety.executionEligible,false);
 assert.equal(empty.routes.length,0);
 assert.ok(calls>=3);
 await assert.rejects(()=>scan({chainId:1},rpc,100),/BASE_CHAIN_REQUIRED/);
 await assert.rejects(()=>scan({chainId:8453},rpc,55),/INVALID_AMOUNT/);
 console.log('PASS Phase 12.7: empty liquidity, no-alert fail closed, network and amount guards');
})().catch(e=>{console.error(e);process.exitCode=1});
