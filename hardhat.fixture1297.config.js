'use strict';
require('@nomicfoundation/hardhat-ethers');
const path=require('node:path');
// Dedicated isolated local EVM, intentionally ignores BASE_RPC_URL and never forks or broadcasts.
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun'}},
 paths:{sources:path.join(__dirname,'atomic-mock-contracts'),artifacts:path.join(__dirname,'artifacts'),cache:path.join(__dirname,'cache')},
 networks:{hardhat:{chainId:31337,hardfork:'cancun'}}
};
