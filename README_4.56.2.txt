ArbiFlow Engine 4.56.2 — Known Coverage Gaps

Based on deployed 4.56.1 diagnostics.
- Passes routeCoverage and knownCoverageGaps through /api/diagnostics/multimarket/cross-dex-economic.
- Stops repeatedly scheduling the 60 validated unsupported SushiSwap V3 jobs:
  * cbBTC/Sushi: 30 jobs, NO_QUOTE in 4.56.1.
  * cbETH/Sushi: 30 jobs, NO_POOL in 4.56.1.
- Remaining supported Base graph is still quoted read-only.
- Funding, liquidation, depth and $15 minimum-net gates preserved.
- Mainnet execution remains disabled.
