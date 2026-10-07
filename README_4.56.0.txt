ArbiFlow Engine 4.56.0 - Base SushiSwap V3 Venue Expansion

Adds SushiSwap V3 as a fourth direct read-only Base venue using Sushi's Base V3 factory and QuoterV2 deployments.

Base venues:
- Uniswap V3
- Aerodrome
- PancakeSwap V3
- SushiSwap V3

Assets:
- WETH
- cbBTC
- DAI
- cbETH
- USDbC

Probe sizes: $100, $250, $500, $1,000, $2,500
Ordered cross-venue directions: 12
Maximum diagnostic jobs: 300

Preserved safety/economics:
- 90% round-trip retention/depth gate
- live Base native gas valuation
- Morpho USDC flash capacity / 0 bps model
- Aave USDC flash capacity / live premium read
- $15 minimum estimated net-profit simulation gate
- existing liquidation architecture and executor source
- no approvals, signatures, swaps, flash-loan requests, mainnet broadcasts or funds movement in diagnostic

Runtime validation on Render is required before this release is considered fully validated.
