'use strict';
require('@nomicfoundation/hardhat-ethers');
const path=require('node:path');
const url=process.env.BASE_RPC_URL||'';
if(!/^https:\/\//.test(url))throw Error('BASE_RPC_URL_HTTPS_REQUIRED');
// Hardhat v2 requires explicit remote chain hardfork history for calls at the
// fork's origin block. Use a nonzero activation boundary to avoid zero-block edge cases.
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun'}},
 paths:{sources:path.join(__dirname,'atomic-mock-contracts'),artifacts:path.join(__dirname,'artifacts'),cache:path.join(__dirname,'cache')},
 networks:{hardhat:{chainId:8453,hardfork:'cancun',
  chains:{8453:{hardforkHistory:{shanghai:1,cancun:10000000}}},
  forking:{url}}}
};
