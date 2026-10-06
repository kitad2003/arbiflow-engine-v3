ArbiFlow Engine 4.20.0 - Fresh Morpho Stored-State Gate

Changes from 4.19.0:
- Version/mode naming updated to 4.20.0 / LIVE_LIQUIDATION_CANDIDATE_GATE_4200.
- Adds direct Base RPC current-block Morpho reads for optimized candidates:
  position(bytes32,address), market(bytes32), idToMarketParams(bytes32).
- Converts borrow shares to current stored borrow assets with Morpho virtual assets/shares and round-up semantics.
- Reports current Base block, stored debt, stored collateral, stored-state health factor, and stored-state liquidation signal.
- Explicitly distinguishes current-block stored state from exact accrued execution state.
- Keeps exact accrued eligibility, transaction calldata/gas, min-output binding, and full atomic liquidation simulation fail-closed.
- Preserves WETH/debt-asset matched Aave financing, normalized Morpho pricing, 0x quote diagnostics, and ArbiFlowExecutor414.
- Mainnet signing/broadcast remains disabled; no funds are moved.
