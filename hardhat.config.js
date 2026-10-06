require("@nomicfoundation/hardhat-ethers");
const path = require("path");
const url = process.env.BASE_RPC_URL || "";

// Hardhat is used only for ArbiFlow's local executor safety harness.
// Base protocol reads are deliberately performed against BASE_RPC_URL directly
// in BaseForkTest4152.js, avoiding Hardhat EDR's Base historical-hardfork issue.
const hardhat = {
  chainId: 8453,
  hardfork: "cancun"
};
if (url) hardhat.forking = { url };

module.exports = {
  paths: {
    sources: path.join(__dirname, ".arbiflow-contracts"),
    artifacts: path.join(__dirname, "artifacts"),
    cache: path.join(__dirname, "cache")
  },
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" }
  },
  networks: { hardhat }
};
