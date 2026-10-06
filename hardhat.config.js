require("@nomicfoundation/hardhat-ethers");
const path = require("path");
const url = process.env.BASE_RPC_URL || "";

// Hardhat is used only for ArbiFlow's local executor safety harness.
// Base protocol reads are deliberately performed against BASE_RPC_URL directly
// in BaseForkTest4170.js, avoiding Hardhat EDR's Base historical-hardfork issue.
const hardhat = {
  chainId: 8453,
  hardfork: "cancun",
  // Fallback history for chain 8453. The 4.21 harness does not depend on
  // historical execution: it mines one local block after forking and executes
  // protocol bytecode there using the configured Cancun hardfork.
  chains: {
    8453: {
      hardforkHistory: {
        cancun: 0
      }
    }
  }
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
