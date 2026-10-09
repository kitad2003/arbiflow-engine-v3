'use strict';
require('@nomicfoundation/hardhat-ethers');
const path=require('node:path');
const url=process.env.BASE_RPC_URL||'';
if(!/^https:\/\//.test(url))throw Error('BASE_RPC_URL_HTTPS_REQUIRED');
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun'}},
 paths:{sources:path.join(__dirname,'atomic-mock-contracts'),artifacts:path.join(__dirname,'artifacts'),cache:path.join(__dirname,'cache')},
 networks:{hardhat:{chainId:8453,hardfork:'cancun',chains:{8453:{hardforkHistory:{cancun:0}}},forking:{url}}}
};
