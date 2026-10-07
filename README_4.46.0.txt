ArbiFlow Engine 4.46.0 - Multi-Market Foundation

Preserves validated 4.45 Base/Morpho liquidity diagnostic and production safety gates.
Adds a read-only 15-chain registry and RPC health diagnostic plus 12-CEX and 7-DEX-family adapter registries.

New endpoint:
/api/diagnostics/multimarket/foundation

15 chains: Ethereum, Arbitrum, Optimism, Base, Polygon, BNB Smart Chain, Avalanche, Linea, Scroll, Mantle, zkSync Era, Gnosis, Metis, Sonic, Celo.

This release does NOT trade, approve tokens, request flash loans, sign, broadcast, or move funds. CEX market-data and DEX pool adapters are registry/planned in this foundation build; they are not falsely reported as live.
