require('@nomicfoundation/hardhat-ethers');
const path=require('node:path');
// Hardhat resolves relative source paths from the CONFIG file directory, not repository root.
// Absolute paths prevent the accidental balancer-research-v1/balancer-research-v1 nesting.
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},viaIR:true}},
 networks:{hardhat:{chainId:31337}},
 paths:{sources:__dirname,tests:__dirname,cache:path.join(__dirname,'.cache'),artifacts:path.join(__dirname,'.artifacts')}
};
