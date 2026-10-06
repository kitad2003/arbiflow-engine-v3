require("@nomicfoundation/hardhat-ethers");
const path = require("path");
const url = process.env.BASE_RPC_URL || "";
module.exports = {
  paths: {
    sources: path.join(__dirname, ".arbiflow-contracts"),
    artifacts: path.join(__dirname, "artifacts"),
    cache: path.join(__dirname, "cache")
  },
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: { hardhat: url ? { forking: { url }, chainId: 8453 } : { chainId: 8453 } }
};
