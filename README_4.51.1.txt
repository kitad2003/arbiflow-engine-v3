ArbiFlow Engine 4.51.1 — Multi-Hop USD Reference + Native Gas Valuation + Cache

Changes from 4.51.0:
- Non-stable USD normalization can use direct or two-hop on-chain V3 reference paths (for example ARB -> WETH -> USDC).
- USD references are cached once per chain/token for each diagnostic scan.
- Native gas valuation uses the actual chain-native wrapped asset: WETH on Ethereum/Arbitrum/Optimism/Base, WPOL on Polygon, WBNB on BNB.
- Startup/fork/version markers are synchronized to 4.51.1.
- Existing bounded candidate validation, exact-size round-trip quoting, 90% depth gate, dynamic sizing, $15 minimum-net gate, Morpho/Aave funding architecture, liquidation module, and fail-closed mainnet behavior are preserved.

Safety: diagnostic remains read-only. No approval, signature, swap, flash-loan request, mainnet broadcast, or mainnet funds movement is introduced.
