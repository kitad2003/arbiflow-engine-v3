require("@nomicfoundation/hardhat-ethers");
const url = process.env.BASE_RPC_URL || "";
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: { hardhat: url ? { forking: { url }, chainId: 8453 } : { chainId: 8453 } }
};
