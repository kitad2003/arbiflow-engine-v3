ArbiFlow Engine 4.22.0 — Batch Morpho Fork-Accrued Candidate Gate

4.22.0 preserves the verified 4.21 startup fork-accrual test and adds per-scan execution-eligibility verification for optimized Morpho candidates. The scan launches one disposable Base fork, mines one local Cancun block, accrues each unique candidate market once, then rereads every candidate borrower after accrual.

A candidate advances exactAccruedEligibility only when forkAccruedStateConfirmed=true, exactAtForkBlock=true, and exactAccruedLiquidatable=true. This is exact only at the fork block and is not a guarantee of transaction-block eligibility. Protocol-valid repay/seize bounds, firm transaction-bound 0x quote, transaction-specific gas, min-output protection, and atomic liquidation simulation remain mandatory and fail closed. Mainnet signing/broadcast remains disabled.

New artifact: MorphoCandidateForkGate4220.js
Startup: Startup4220.js
Startup fork harness: BaseForkTest4220.js

ArbiFlow Engine 4.22.0 - Morpho Fork Accrual Gate

Changes from 4.20.0:
- Version/mode: 4.22.0 / LIVE_LIQUIDATION_CANDIDATE_GATE_4220.
- Startup fork now calls Morpho Blue accrueInterest(MarketParams) on the disposable Base fork.
- Rereads Morpho market and borrower position after accrual.
- Calculates post-accrual borrow assets with Morpho virtual asset/share rounding semantics.
- Reads the Morpho oracle after accrual and calculates post-accrual health factor.
- Reports exactAccruedLiquidatable and exactAccruedStateConfirmed for the startup verification candidate.
- Startup is fail-closed: deployment is blocked if fork accrual does not execute and produce a confirmed post-accrual state.
- Scan surfaces the fork-accrual report under BASE_FORK_SIMULATION_FOUNDATION_BOT.
- Preserves current-block stored-state readiness checks, WETH debt-asset matched Aave financing, normalized Morpho pricing, 0x quote diagnostics, and ArbiFlowExecutor414.
- Full liquidation execution remains disabled. No real Base transaction, wallet signature, mainnet deployment, or mainnet funds movement occurs.

Important scope:
4.21 proves real Morpho interest accrual and post-accrual health evaluation on the ephemeral fork. It does not yet execute a Morpho liquidation, bind a firm 0x transaction quote, or perform the complete Aave flash-loan -> liquidation -> collateral swap -> flash repayment sequence.


4.22.0 Render EDR correction 2:
- After attaching to the latest Base fork, the harness records sourceForkBlockNumber.
- It mines exactly one ephemeral local block before any Morpho bytecode is executed through Hardhat.
- This makes protocol execution non-historical and forces Hardhat to use the configured Cancun hardfork.
- Report fields localForkAdvanceBlocks and protocolExecutionBlockIsLocalNonHistorical prove the path used.
- No mainnet transaction, deployment, signature, or funds movement is enabled.
