ArbiFlow Engine 4.47.0 - Real DEX Pool Discovery

Preserves the validated 4.46 multi-market foundation and Base/Morpho liquidation modules.
Adds a read-only Uniswap V3 on-chain factory discovery adapter for the six currently configured chains: Ethereum, Arbitrum, Optimism, Base, Polygon, and BNB Smart Chain.

Endpoint: /api/diagnostics/multimarket/dex-pools

The scanner checks canonical token pairs across fee tiers 100/500/3000/10000, records actual pool addresses and pool liquidity() state, and reports exact coverage. This is real on-chain pool discovery, not a venue registry.

Safety: read-only. No approvals, signatures, swaps, flash loans, broadcasts, or funds movement. Live execution remains disabled.
