'use strict';
const path=require('node:path');
require('@nomicfoundation/hardhat-ethers');
const url=process.env.BALANCER_FORK_RPC_URL||'';
if(!/^https:\/\//.test(url))throw Error('BALANCER_FORK_RPC_URL_REQUIRED');
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},viaIR:true}},
 networks:{hardhat:{chainId:8453,hardfork:'cancun',chains:{8453:{hardforkHistory:{cancun:0}}},forking:{url}}},
 paths:{sources:__dirname,tests:__dirname,cache:path.join(__dirname,'.fork-cache'),artifacts:path.join(__dirname,'.fork-artifacts')}
};
