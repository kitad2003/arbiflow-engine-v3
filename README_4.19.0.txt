ArbiFlow Engine 4.19.0 — Debt-Asset Financing Alignment

Changes from 4.18.1:
- Preserves the verified Morpho raw-unit normalization and 0x exit-quote diagnostics.
- Aave liquidation financing is now discovered using the actual Morpho debt asset rather than hardcoded USDC.
- Current WETH-debt candidates therefore use Aave WETH reserve liquidity and AAVE_FLASH_LOAN_SIMPLE_WETH in the execution blueprint.
- Route optimizer exposes flashAsset, availableFlashLiquidityTokenUnits, and normalized USD flash capacity.
- Execution plans expose flashAsset, flashAssetAddress, and flashAssetMatchesDebtAsset.
- Executor simulation and callable-test metadata now consistently reference ArbiFlowExecutor414.sol.
- Startup/fork report naming advanced to 4.19.0 / fork-report-4190.json / BaseForkTest4190.js.
- Live executeLiquidationPlan remains hard-disabled. No mainnet broadcast or fund movement is enabled.

Still intentionally fail-closed:
- exact fresh accrued Morpho repay state is not yet bound to a transaction
- firm 0x execution calldata/minimum output is not yet bound
- transaction-specific gas is not yet available
- complete atomic liquidation simulation is not yet performed
- live signing/broadcast remains disabled
