ArbiFlow Engine 4.57.0 — Arbitrum Exact Quote Expansion

Additive expansion beyond validated Base.
New read-only endpoint:
/api/diagnostics/multimarket/arbitrum-exact-quotes

It validates the configured Arbitrum RPC, Uniswap V3 factory/quoter, then tests exact USDC round trips for WETH, WBTC, cbBTC, ARB and USDT at $100/$250/$500/$1000/$2500.

Base 4-venue diagnostics, Morpho/Aave funding architecture, liquidation system, known Base coverage gaps, depth protections and $15 minimum-net safety architecture are preserved. Arbitrum flash funding/execution is intentionally not enabled in this discovery-stage release. No mainnet execution is enabled.
