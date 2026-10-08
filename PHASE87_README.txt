ArbiFlow Phase 8.7.0 — integrated manual indexed liquidity discovery

Added: phase87-indexed-discovery.js and test-phase87.js.
Modified: server.js only to mount phase87-indexed-discovery alongside the existing Phase 8.6.1 mount.
All existing repository files and package.json remain otherwise unchanged.

After deployment:
  GET /api/liquidity87/run       manual start (four sequential public API calls)
  GET /api/liquidity87/status    progress and last result
  GET /api/liquidity87/pools?limit=50&offset=0&minLiquidityUSD=0
  GET /api/liquidity87/tokens
  GET /api/liquidity87/sources

Sources: GeckoTerminal Base top, trending, new; DEX Screener Base USDC pairs.
Requests are bounded, timeout after 8 seconds each, do not auto-run, and do not broadcast transactions.
Responses are in-memory snapshots only. API liquidity figures are not executable depth.
V4-style 32-byte pool identifiers are not treated as deployed contract addresses.
No on-chain verification, multi-hop quotes, net profit, persistence or live execution is claimed.

Validation: node --check server.js; node --check phase87-indexed-discovery.js; node test-phase87.js.
For a production rollout, verify deployed version and endpoints before any further phase.
