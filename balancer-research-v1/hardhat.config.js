require('@nomicfoundation/hardhat-ethers');
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},viaIR:true}},
 networks:{hardhat:{chainId:31337}},
 paths:{sources:'./balancer-research-v1',tests:'./balancer-research-v1',cache:'./balancer-research-v1/.cache',artifacts:'./balancer-research-v1/.artifacts'}
};
