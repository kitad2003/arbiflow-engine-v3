ArbiFlow Engine 4.21.0 - Morpho Fork Accrual Gate

Changes from 4.20.0:
- Version/mode: 4.21.0 / LIVE_LIQUIDATION_CANDIDATE_GATE_4210.
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
