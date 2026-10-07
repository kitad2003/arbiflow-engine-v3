ArbiFlow Engine 4.50.2 — Concurrent Discovery + Quote Telemetry Correction

Purpose:
- Preserve 4.50.0 expanded on-chain pair universe.
- Replace sequential V3 factory discovery with bounded concurrent reads and per-call timeouts.
- Configure the official Uniswap V3 BNB QuoterV2 for the BNB Uniswap V3 factory already used by discovery.
- Classify failed exact quotes as QUOTE_FAILED rather than as an economic no-profit result.
- Expand discovery telemetry so every candidate exit path is visible.
- Preserve 90% depth gate, output-saturation protection, dynamic sizing, $15 minimum net gate, Morpho/Aave funding architecture, and liquidation engine.

Read-only diagnostic route:
GET /api/diagnostics/multimarket/exact-size-funding

No approval, signature, swap, flash-loan request, or mainnet broadcast is performed by this diagnostic.
