ArbiFlow Engine 4.16.0 — Live Liquidation Candidate Gate

Purpose
- Preserve the verified 4.15.3 direct Base RPC protocol checks and disposable executor fork test.
- Add a read-only onchain Morpho candidate gate for the previously closest watched borrower.
- Read Morpho position shares/collateral, stored market borrow totals, and oracle price directly from Base.
- Compute a preliminary stored-state health factor without pretending stored balances equal execution-time accrued debt.
- Keep live execution hard-disabled and require a genuinely unhealthy candidate before any future atomic liquidation simulation.

Safety
- No private key or wallet required.
- No Base-mainnet transaction broadcast.
- No funds moved.
- Executor live entry remains hard-disabled and must revert in the disposable fork test.
- $15 minimum NET profit remains the economic floor for future qualification.
- A healthy candidate produces WATCH_NOT_CURRENTLY_LIQUIDATABLE_ON_STORED_STATE; it is never fabricated into a trade.

Startup sequence
1. Verify Solidity source.
2. Compile executor.
3. Read real Base Morpho/Aave/0x contracts directly through BASE_RPC_URL.
4. Read the watched Morpho position, market state, and oracle.
5. Produce the preliminary liquidation candidate gate.
6. Start disposable Base fork and verify executor validatePlan + disabled live-entry revert.
7. Start web service only after all startup safety gates pass.
