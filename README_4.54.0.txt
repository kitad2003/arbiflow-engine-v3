ArbiFlow Engine 4.54.0 - Base Multi-DEX Expansion

Adds the pre-existing PancakeSwap V3 Base read-only adapter to the validated cross-DEX opportunity graph.
Venues: Uniswap V3, Aerodrome, PancakeSwap V3.
Assets: WETH, cbBTC, DAI against USDC.
Probe sizes: $100, $250, $500, $1,000, $2,500.
Ordered cross-venue directions: 6. Maximum jobs: 90.

Preserved from 4.53.1:
- exact read-only quoting
- 90% round-trip retention/depth gate
- live Base gas price + exact ETH/USD reference
- direct Morpho/Aave USDC capacity reads
- Morpho 0 bps modeled flash fee
- Aave live premium read
- own-capital path
- $15 minimum estimated net gate
- liquidation architecture and atomic executor
- fail-closed mainnet execution safety

PancakeSwap runtime health verifies Base chain id, bytecode, QuoterV2 factory binding, and factory bytecode.
No approvals, signatures, swaps, flash-loan requests, mainnet broadcasts or funds movement are performed by the diagnostic.
