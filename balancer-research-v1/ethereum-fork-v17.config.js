'use strict';
const path = require('node:path');
require('@nomicfoundation/hardhat-ethers');
const rpc = process.env.ETHEREUM_RPC_URL;
if (!rpc || !rpc.startsWith('https://')) throw new Error('ETHEREUM_RPC_URL_REQUIRED');
module.exports = {
 solidity: {version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},viaIR:true}},
 networks: {hardhat:{chainId:31337,hardfork:'cancun',gas:12000000,blockGasLimit:30000000,forking:{url:rpc}}},
 paths: {sources:__dirname,tests:__dirname,cache:path.join(__dirname,'.eth-v17-cache'),artifacts:path.join(__dirname,'.eth-v17-artifacts')}
};
