'use strict';
const assert=require('node:assert/strict'),{verify}=require('./verify-vault');
async function main(){
 const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40);
 await assert.rejects(verify({provider:{},vaultAddress:'invalid',tokenAddress:b}),/EXPLICIT_VAULT/);
 await assert.rejects(verify({provider:{getNetwork:async()=>({chainId:1n})},vaultAddress:a,tokenAddress:b}),/UNEXPECTED_CHAIN/);
 await assert.rejects(verify({provider:{getNetwork:async()=>({chainId:8453n}),getBlock:async()=>({hash:'0x'+'a'.repeat(64),number:10}),getCode:async()=> '0x'},vaultAddress:a,tokenAddress:b}),/NO_VAULT_CODE/);
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V3',unitAssertionsPassed:3,realVaultChecked:false,mainnetBroadcast:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
