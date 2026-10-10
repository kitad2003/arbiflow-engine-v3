require('@nomicfoundation/hardhat-ethers');
const url=process.env.BASE_RPC_URL;
module.exports={
 solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},viaIR:true}},
 networks:{hardhat:{chainId:8453,hardfork:'cancun',chains:{8453:{hardforkHistory:{cancun:0}}},forking:url?{url}:undefined}},
 paths:{sources:'./.research-aave-sources',tests:'./.research-aave-tests',cache:'./.research-aave-cache',artifacts:'./.research-aave-artifacts'}
};
