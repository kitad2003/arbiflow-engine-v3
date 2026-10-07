ArbiFlow Engine 4.52.0

Multi-DEX Adapter Foundation + Cross-DEX Opportunity Graph

Adds a read-only Base cross-DEX diagnostic joining the existing Uniswap V3 and Aerodrome adapters into one normalized exact-quote graph. It probes USDC round trips through WETH, cbBTC and DAI in both venue directions at $100, $250, $500, $1,000 and $2,500.

Route: /api/diagnostics/multimarket/cross-dex-base

Safety: read-only only. No approvals, signatures, swaps, flash-loan requests, mainnet broadcasts or fund movement. Positive before-gas observations are not execution eligibility. Existing 4.51.1 USD normalization, depth gates, Morpho/Aave funding architecture and Base liquidation module remain preserved.

Also corrects the legacy Base direct-venue WETH token constant to 0x4200000000000000000000000000000000000006.
