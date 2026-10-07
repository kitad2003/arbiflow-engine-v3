"use strict";
const fs = require("fs");
const hre = require("hardhat");
const { ethers } = require("ethers");

const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const ZEROX_ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734";
const MARKET_ID = "0x54cf9be57fdfa6457a660991907434ff9d295c465a603a50126ff647d50b7354";
const WATCH_BORROWER = "0x7dCDb4ad4017F848879d17370aa6F32564E5Cd08";
const WAD = 10n ** 18n;
const ORACLE_PRICE_SCALE = 10n ** 36n;
const VIRTUAL_SHARES = 1000000n;
const VIRTUAL_ASSETS = 1n;

function mulDivUp(x, y, d) { return (x * y + d - 1n) / d; }
function borrowSharesToAssetsUp(shares, totalAssets, totalShares) {
  return mulDivUp(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
}

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
    "function idToMarketParams(bytes32) view returns (address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)",
    "function position(bytes32,address) view returns (uint256 supplyShares,uint128 borrowShares,uint128 collateral)",
    "function market(bytes32) view returns (uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)"
  ], base);
  const mp = await morpho.idToMarketParams(MARKET_ID);
  if (mp.loanToken === ethers.ZeroAddress) throw new Error("Known Morpho market did not resolve on Base RPC.");

  // 4.16 candidate gate: inspect the previously closest watched borrower directly on Base.
  // This is a read-only PRELIMINARY gate. Morpho accrues interest inside state-changing
  // execution, so stored market balances are not labeled as exact execution-time debt.
  const [position, marketState] = await Promise.all([
    morpho.position(MARKET_ID, WATCH_BORROWER),
    morpho.market(MARKET_ID)
  ]);
  const oracle = new ethers.Contract(mp.oracle, ["function price() view returns (uint256)"], base);
  const oraclePrice = await oracle.price();
  const storedBorrowAssets = borrowSharesToAssetsUp(
    BigInt(position.borrowShares), BigInt(marketState.totalBorrowAssets), BigInt(marketState.totalBorrowShares)
  );
  const collateralValueLoanUnits = BigInt(position.collateral) * BigInt(oraclePrice) / ORACLE_PRICE_SCALE;
  const healthFactorWad = storedBorrowAssets > 0n
    ? collateralValueLoanUnits * BigInt(mp.lltv) / storedBorrowAssets
    : 0n;
  const preliminaryLiquidatable = storedBorrowAssets > 0n && healthFactorWad < WAD;

  const aave = new ethers.Contract(AAVE_POOL, ["function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)"], base);
  const flashPremiumBps = Number(await aave.FLASHLOAN_PREMIUM_TOTAL());

  // Phase B: local disposable fork verifies ArbiFlow's executor artifact and
  // fail-closed live entry. No protocol bytecode is called through Hardhat EDR.
  const [tester] = await hre.ethers.getSigners();
  const forkNetwork = await hre.ethers.provider.getNetwork();
  if (forkNetwork.chainId !== 8453n) throw new Error(`Expected local Base fork chainId 8453, got ${forkNetwork.chainId}`);
  const sourceForkBlockNumber = await hre.ethers.provider.getBlockNumber();

  // Hardhat/EDR classifies execution at the remote fork block as historical for
  // unusual chain IDs. Mine one disposable local block before calling Base
  // protocol bytecode. Execution then occurs in a non-historical local block
  // and uses networks.hardhat.hardfork (Cancun) directly. No mainnet state is
  // changed; this block exists only inside the ephemeral fork.
  await hre.network.provider.send("evm_mine");
  const forkBlockNumber = await hre.ethers.provider.getBlockNumber();
  if (forkBlockNumber <= sourceForkBlockNumber) {
    throw new Error(`Local fork advance failed: source ${sourceForkBlockNumber}, current ${forkBlockNumber}`);
  }

  // 4.21: execute Morpho's real state-changing accrueInterest on the disposable Base fork.
  // This mirrors the first state transition performed by Morpho liquidation before health is checked.
  const forkMorpho = new hre.ethers.Contract(MORPHO, [
    "function accrueInterest((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv) marketParams)",
    "function position(bytes32,address) view returns (uint256 supplyShares,uint128 borrowShares,uint128 collateral)",
    "function market(bytes32) view returns (uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)"
  ], tester);
  const forkOracle = new hre.ethers.Contract(mp.oracle, ["function price() view returns (uint256)"], tester);
  const beforeAccrualMarket = await forkMorpho.market(MARKET_ID);
  const beforeAccrualPosition = await forkMorpho.position(MARKET_ID, WATCH_BORROWER);
  const accrueTx = await forkMorpho.accrueInterest([mp.loanToken, mp.collateralToken, mp.oracle, mp.irm, mp.lltv]);
  const accrueReceipt = await accrueTx.wait();
  const afterAccrualMarket = await forkMorpho.market(MARKET_ID);
  const afterAccrualPosition = await forkMorpho.position(MARKET_ID, WATCH_BORROWER);
  const forkOraclePrice = await forkOracle.price();
  const accruedBorrowAssets = borrowSharesToAssetsUp(
    BigInt(afterAccrualPosition.borrowShares), BigInt(afterAccrualMarket.totalBorrowAssets), BigInt(afterAccrualMarket.totalBorrowShares)
  );
  const accruedCollateralValueLoanUnits = BigInt(afterAccrualPosition.collateral) * BigInt(forkOraclePrice) / ORACLE_PRICE_SCALE;
  const accruedHealthFactorWad = accruedBorrowAssets > 0n
    ? accruedCollateralValueLoanUnits * BigInt(mp.lltv) / accruedBorrowAssets
    : 0n;
  const accruedLiquidatable = accruedBorrowAssets > 0n && accruedHealthFactorWad < WAD;

  // 4.29: deploy the full atomic executor implementation only inside the disposable fork.
  // A real liquidation transaction is deliberately NOT simulated unless an exactly liquidatable
  // candidate and a firm bound swap quote exist. Callback caller guards are tested independently.
  const AtomicFactory = await hre.ethers.getContractFactory("ArbiFlowAtomicExecutor430");
  const atomicDeployTx = await AtomicFactory.getDeployTransaction(AAVE_POOL, MORPHO);
  const atomicDeploymentGas = await tester.estimateGas(atomicDeployTx);
  const atomicExecutor = await AtomicFactory.deploy(AAVE_POOL, MORPHO);
  await atomicExecutor.waitForDeployment();
  const atomicExecutorAddress = await atomicExecutor.getAddress();
  const atomicCode = await hre.ethers.provider.getCode(atomicExecutorAddress);
  let directMorphoCallbackRejected = false;
  try { await atomicExecutor.onMorphoLiquidate.staticCall(1n, "0x"); } catch { directMorphoCallbackRejected = true; }
  let directAaveCallbackRejected = false;
  try { await atomicExecutor.executeOperation.staticCall(mp.loanToken,1n,1n,tester.address,"0x"); } catch { directAaveCallbackRejected = true; }
  if (!directMorphoCallbackRejected || !directAaveCallbackRejected) throw new Error("Atomic executor callback caller guard failed.");

  const Factory = await hre.ethers.getContractFactory("ArbiFlowExecutor414");
  const deployTx = await Factory.getDeployTransaction();
  const deploymentGas = await tester.estimateGas(deployTx);
  const executor = await Factory.deploy();
  await executor.waitForDeployment();
  const executorAddress = await executor.getAddress();
  const code = await hre.ethers.provider.getCode(executorAddress);

  const borrower = WATCH_BORROWER;
  const target = "0x0000000000000000000000000000000000000001";
  const args = [MARKET_ID, borrower, 1n, 1n, target, "0x00"];
  const hash = await executor.validatePlan.staticCall(...args);
  const gas = await executor.validatePlan.estimateGas(...args);
  let liveEntryReverted = false;
  try { await executor.executeLiquidationPlan.staticCall(...args); } catch { liveEntryReverted = true; }
  if (!liveEntryReverted) throw new Error("Safety failure: live entry point did not revert.");

  const report = {
    success: true,
    version: "4.58.1",
    architecture: "DIRECT_BASE_RPC_PROTOCOL_READS_PLUS_EPHEMERAL_EXECUTOR_FORK",
    compilePerformed: true,
    directBaseRpcReadPassed: true,
    baseChainId: Number(baseNetwork.chainId),
    baseBlockNumber,
    forkStarted: true,
    chainId: Number(forkNetwork.chainId),
    sourceForkBlockNumber,
    forkBlockNumber,
    localForkAdvanceBlocks: forkBlockNumber - sourceForkBlockNumber,
    protocolExecutionBlockIsLocalNonHistorical: forkBlockNumber > sourceForkBlockNumber,
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
    morphoForkAccrual: {
      source: "EPHEMERAL_BASE_FORK_STATE_CHANGING_ACCRUAL",
      marketId: MARKET_ID,
      borrower: WATCH_BORROWER,
      accrueInterestTransactionSucceeded: true,
      accrueInterestGasUsed: accrueReceipt.gasUsed.toString(),
      marketLastUpdateBefore: beforeAccrualMarket.lastUpdate.toString(),
      marketLastUpdateAfter: afterAccrualMarket.lastUpdate.toString(),
      totalBorrowAssetsBefore: beforeAccrualMarket.totalBorrowAssets.toString(),
      totalBorrowAssetsAfter: afterAccrualMarket.totalBorrowAssets.toString(),
      borrowShares: afterAccrualPosition.borrowShares.toString(),
      exactAccruedBorrowAssetsRaw: accruedBorrowAssets.toString(),
      oraclePrice: forkOraclePrice.toString(),
      exactAccruedHealthFactorWad: accruedHealthFactorWad.toString(),
      exactAccruedLiquidatable: accruedLiquidatable,
      exactAccruedStateConfirmed: true,
      forkOnly: true,
      mainnetStateChanged: false,
      note: "Morpho accrueInterest executed only on the disposable Base fork; post-accrual market and position were reread before health evaluation."
    },
    atomicExecutor: {
      artifact: "ArbiFlowAtomicExecutor430.sol",
      deployed: true,
      forkOnly: true,
      address: atomicExecutorAddress,
      codeBytes: (atomicCode.length - 2) / 2,
      deploymentGas: atomicDeploymentGas.toString(),
      aavePool: AAVE_POOL,
      morpho: MORPHO,
      callbackGuardsConfirmed: directMorphoCallbackRejected && directAaveCallbackRejected,
      fullAtomicSimulationPerformed: false,
      simulationGate: accruedLiquidatable ? "REQUIRES_FIRM_BOUND_0X_QUOTE" : "WAITING_FOR_FRESH_LIVE_LIQUIDATABLE_CANDIDATE",
      mainnetDeployment: false,
      mainnetBroadcast: false,
      fundsMoved: false
    },
    liquidationCandidateGate: {
      source: "DIRECT_BASE_RPC_READ_ONLY",
      marketId: MARKET_ID,
      borrower: WATCH_BORROWER,
      borrowShares: position.borrowShares.toString(),
      collateralAssets: position.collateral.toString(),
      storedTotalBorrowAssets: marketState.totalBorrowAssets.toString(),
      storedTotalBorrowShares: marketState.totalBorrowShares.toString(),
      storedBorrowAssetsEstimate: storedBorrowAssets.toString(),
      oraclePrice: oraclePrice.toString(),
      healthFactorWadStoredState: healthFactorWad.toString(),
      preliminaryLiquidatable,
      exactExecutionEligibilityConfirmed: false,
      exactAccruedRepayConfirmed: false,
      minimumNetProfitUsd: 15,
      status: preliminaryLiquidatable ? "CANDIDATE_REQUIRES_EXECUTION_TIME_ACCRUAL_AND_ATOMIC_SIMULATION" : "WATCH_NOT_CURRENTLY_LIQUIDATABLE_ON_STORED_STATE",
      note: "Read-only candidate gate only. Stored Morpho market balances can be stale until interest accrues; this field must not be treated as final execution eligibility."
    },
    atomicLiquidationExecuted: false,
    mainnetBroadcast: false,
    fundsMoved: false,
    tester: tester.address,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync("fork-report-4300.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  const report = { success: false, version: "4.58.1", error: String(e?.stack || e), mainnetBroadcast: false, fundsMoved: false, generatedAt: new Date().toISOString() };
  try { fs.writeFileSync("fork-report-4300.json", JSON.stringify(report, null, 2)); } catch {}
  console.error(e);
  process.exitCode = 1;
});
