ArbiFlow Engine 4.53.1 — Economic Plumbing Fix

Route: /api/diagnostics/multimarket/cross-dex-economic

Fixes:
- Base ETH/USD gas reference now comes from the validated exact Uniswap V3 USDC->WETH quote path, removing the legacy 0x dependency from this diagnostic.
- Morpho and Aave USDC flash-liquidity capacity now reuse the proven direct Base protocol-balance reader from the market-liquidity diagnostic.
- Funding/gas reads fail closed instead of silently becoming zero.
- Adds plumbingChecks so non-zero native USD, gas USD, Morpho capacity and Aave capacity are explicit.

Preserved:
- Uniswap V3 <-> Aerodrome exact cross-DEX quotes
- 90% retention/depth gate
- $15 minimum estimated-net gate
- Morpho 0-bps and Aave premium economics
- Existing liquidation and atomic executor architecture
- Read-only diagnostic; no signing, approvals, swaps, flash loans or mainnet broadcasts.
