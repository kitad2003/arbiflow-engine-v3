ArbiFlow Engine 4.49.0 — Exact Trade-Size + Flash Funding Diagnostic

Adds read-only exact-size Uniswap V3 round-trip quoting for positive 4.48 spot divergences.
Tests $100, $250, $500, $1,000, $2,500, $5,000, $10,000, $25,000 and $50,000 stablecoin starting sizes.
Preserves own-capital, Morpho flash-loan, and Aave flash-loan architecture. Base funding capacity is read directly; other-chain flash funding remains preserved but not yet configured.
Gas is modeled, not transaction-simulated. No approvals, signatures, swaps, flash loans, broadcasts, or mainnet funds movement.

Diagnostic route:
GET /api/diagnostics/multimarket/exact-size-funding
