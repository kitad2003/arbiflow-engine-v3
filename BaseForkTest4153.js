"use strict";
const fs = require("fs");
const hre = require("hardhat");
const { ethers } = require("ethers");

const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const ZEROX_ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734";
const MARKET_ID = "0x54cf9be57fdfa6457a660991907434ff9d295c465a603a50126ff647d50b7354";

async function codeBytes(provider, address) {
  const code = await provider.getCode(address);
  return (code.length - 2) / 2;
}

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL is required.");

  // Phase A: real Base protocol reads go straight to the configured Base RPC.
  // This avoids Hardhat EDR trying to execute Base protocol bytecode with an
  // Ethereum-mainnet hardfork history that doesn't describe Base correctly.
  const base = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL, 8453, { staticNetwork: true });
  const baseNetwork = await base.getNetwork();
  if (baseNetwork.chainId !== 8453n) throw new Error(`BASE_RPC_URL is not Base mainnet; got chainId ${baseNetwork.chainId}`);
  const baseBlockNumber = await base.getBlockNumber();

  const protocolCode = {
    morpho: await codeBytes(base, MORPHO),
    aavePool: await codeBytes(base, AAVE_POOL),
    zeroXAllowanceHolder: await codeBytes(base, ZEROX_ALLOWANCE_HOLDER)
  };
  if (!protocolCode.morpho || !protocolCode.aavePool || !protocolCode.zeroXAllowanceHolder) {
    throw new Error(`Base protocol code check failed: ${JSON.stringify(protocolCode)}`);
  }

  const morpho = new ethers.Contract(MORPHO, [
    "function idToMarketParams(bytes32) view returns (address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)"
  ], base);
  const mp = await morpho.idToMarketParams(MARKET_ID);
  if (mp.loanToken === ethers.ZeroAddress) throw new Error("Known Morpho market did not resolve on Base RPC.");

  const aave = new ethers.Contract(AAVE_POOL, ["function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)"], base);
  const flashPremiumBps = Number(await aave.FLASHLOAN_PREMIUM_TOTAL());

  // Phase B: local disposable fork verifies ArbiFlow's executor artifact and
  // fail-closed live entry. No protocol bytecode is called through Hardhat EDR.
  const [tester] = await hre.ethers.getSigners();
  const forkNetwork = await hre.ethers.provider.getNetwork();
  if (forkNetwork.chainId !== 8453n) throw new Error(`Expected local Base fork chainId 8453, got ${forkNetwork.chainId}`);
  const forkBlockNumber = await hre.ethers.provider.getBlockNumber();

  const Factory = await hre.ethers.getContractFactory("ArbiFlowExecutor414");
  const deployTx = await Factory.getDeployTransaction();
  const deploymentGas = await tester.estimateGas(deployTx);
  const executor = await Factory.deploy();
  await executor.waitForDeployment();
  const executorAddress = await executor.getAddress();
  const code = await hre.ethers.provider.getCode(executorAddress);

  const borrower = "0x7dCDb4ad4017F848879d17370aa6F32564E5Cd08";
  const target = "0x0000000000000000000000000000000000000001";
  const args = [MARKET_ID, borrower, 1n, 1n, target, "0x00"];
  const hash = await executor.validatePlan.staticCall(...args);
  const gas = await executor.validatePlan.estimateGas(...args);
  let liveEntryReverted = false;
  try { await executor.executeLiquidationPlan.staticCall(...args); } catch { liveEntryReverted = true; }
  if (!liveEntryReverted) throw new Error("Safety failure: live entry point did not revert.");

  const report = {
    success: true,
    version: "4.15.3",
    architecture: "DIRECT_BASE_RPC_PROTOCOL_READS_PLUS_EPHEMERAL_EXECUTOR_FORK",
    compilePerformed: true,
    directBaseRpcReadPassed: true,
    baseChainId: Number(baseNetwork.chainId),
    baseBlockNumber,
    forkStarted: true,
    chainId: Number(forkNetwork.chainId),
    forkBlockNumber,
    executor: executorAddress,
    forkContractDeployed: true,
    contractCodeBytes: (code.length - 2) / 2,
    validatePlanEthCallPerformed: true,
    validatePlanHash: hash,
    validatePlanGas: gas.toString(),
    deploymentGas: deploymentGas.toString(),
    liveEntryReverted,
    protocolIntegration: {
      source: "DIRECT_BASE_RPC_READ_ONLY",
      morpho: { address: MORPHO, codeBytes: protocolCode.morpho, knownMarketResolved: true, loanToken: mp.loanToken, collateralToken: mp.collateralToken, oracle: mp.oracle, irm: mp.irm, lltv: mp.lltv.toString() },
      aave: { pool: AAVE_POOL, codeBytes: protocolCode.aavePool, flashLoanPremiumBps: flashPremiumBps },
      zeroX: { allowanceHolder: ZEROX_ALLOWANCE_HOLDER, codeBytes: protocolCode.zeroXAllowanceHolder }
    },
    atomicLiquidationExecuted: false,
    mainnetBroadcast: false,
    fundsMoved: false,
    tester: tester.address,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync("fork-report-4153.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  const report = { success: false, version: "4.15.3", error: String(e?.stack || e), mainnetBroadcast: false, fundsMoved: false, generatedAt: new Date().toISOString() };
  try { fs.writeFileSync("fork-report-4153.json", JSON.stringify(report, null, 2)); } catch {}
  console.error(e);
  process.exitCode = 1;
});
