require('@nomicfoundation/hardhat-ethers');
module.exports={solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'cancun'}},networks:{hardhat:{chainId:31337,hardfork:'cancun'}},paths:{sources:'./balancer-research-v1',artifacts:'./artifacts-v48',cache:'./cache-v48'}};
