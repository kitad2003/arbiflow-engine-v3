ArbiFlow Engine 4.18.0 — Liquidation Quote Unit Integrity + Fork Report Repair

Built from the supplied 4.17.0 codebase.

Changes:
1. Fixes liquidation route sizing: projected USD collateral value is converted to actual collateral-token units before requesting a 0x quote.
2. Preserves both token-unit and USD accounting in route results: repayLoanAssetUnits, loanAssetPriceUsd, seizedCollateralUsd, collateralAssetPriceUsd, collateralToSellTokenUnits, exitBuyAmountLoanUnits, and exitBuyAmountUsd.
3. Derives discovery-time token/USD conversion from Morpho's borrowAssets/borrowAssetsUsd and collateral/collateralUsd fields. These remain discovery estimates and are not execution-time oracle guarantees.
4. Fixes the fork report filename mismatch. The 4.18 startup harness writes fork-report-4180.json and server.js reads that exact report.
5. Keeps live execution hard-disabled and fail-closed. No wallet, signature, mainnet broadcast, or funds movement is enabled.

Required Render environment remains the same as 4.17.0, including BASE_RPC_URL and any quote-provider keys already configured.

Start command:
npm start

Verification after deploy:
- Startup log must show PROTOCOL FORK STARTUP VERIFICATION PASS.
- /api/bots/base/scan should report version 4.18.0.
- counts.baseForkTestPassed should be true after a valid startup report.
- LIQUIDATION_ROUTE_OPTIMIZER_BOT tests should contain unitIntegrityPass:true for successful 0x exit quotes.
- collateralToSellTokenUnits must be plausible token quantities, not USD values.
- exitBuyAmountUsd is the USD-normalized value used for projectedFinalNetUsd.

Safety:
This build remains discovery/simulation only. WATCH positions are not executable positions. A future live layer still requires fresh onchain liquidation eligibility, exact accrued debt, firm execution quote/min-output binding, transaction-specific gas, atomic simulation, and explicit user-approved signing/broadcast controls.
