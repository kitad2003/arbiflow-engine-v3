'use strict';
require('@nomicfoundation/hardhat-ethers');
const path=require('node:path'),url=process.env.ETHEREUM_RPC_URL||'';
if(!/^https:\/\//.test(url))throw Error('ETHEREUM_RPC_URL_HTTPS_REQUIRED');
// RPC eth_call cap seen in test: 16,777,216. Hardhat default fork block gas 60M
// can become an oversized eth_call. Keep both under provider cap.
const limit=15000000;
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun'}},
 paths:{sources:path.join(__dirname,'atomic-mock-contracts'),artifacts:path.join(__dirname,'artifacts'),cache:path.join(__dirname,'cache')},
 networks:{hardhat:{chainId:1,hardfork:'cancun',blockGasLimit:limit,gas:limit,forking:{url}}}
};
