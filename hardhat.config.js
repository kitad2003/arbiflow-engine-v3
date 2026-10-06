require("@nomicfoundation/hardhat-ethers");
const path = require("path");
const url = process.env.BASE_RPC_URL || "";
const baseFork = {
  chainId: 8453,
  hardfork: "cancun",
  chains: {
    8453: {
      // Base is not included in Hardhat 2's built-in hardfork history.
      // The fork block used by ArbiFlow is post-Cancun/Ecotone, so historical
      // eth_call execution on the pinned/current fork must resolve to Cancun.
      hardforkHistory: { cancun: 0 }
    }
  }
};
if (url) baseFork.forking = { url };
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
  networks: { hardhat: baseFork }
};
