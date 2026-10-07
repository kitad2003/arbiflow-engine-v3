ArbiFlow Engine 4.53.0
Cross-DEX Economic + Funding Integration

Adds read-only economic gating for validated Base Uniswap V3 <-> Aerodrome exact round trips.
Route: /api/diagnostics/multimarket/cross-dex-economic

Pipeline:
exact cross-DEX quote -> 90% retention/depth gate -> Base ETH gas model -> own capital / Morpho / Aave funding comparison -> financing cost -> $15 minimum estimated net -> simulation eligibility.

SIMULATION_ELIGIBLE is not execution eligibility and does not claim transaction simulation.
Mainnet execution remains disabled. No signing, approvals, flash-loan requests, swaps, broadcasts or funds movement occur in this diagnostic.
The existing liquidation executor, Morpho/Aave architecture, 4.51.1 valuation layer, and 4.52.0 cross-DEX diagnostic are preserved.
