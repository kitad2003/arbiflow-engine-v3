ArbiFlow Phase 8.7.2 — rate limit stabilization
Upload ONLY phase87-indexed-discovery.js to GitHub repository root, replacing existing file. Do not upload tests or README.
Changes: GeckoTerminal and DEX Screener independent cooldowns, minimum 60s on HTTP 429 even when Retry-After is 1, 90s between manual scan starts, preserve previously discovered pools when later scans fail, expose nextScanAt/dexCooldownUntil.
No automatic scanning, transactions, signing, or execution. Source snapshots are NOT executable liquidity.
Validation: node --check phase87-indexed-discovery.js; node test-phase87-2.js
Live provider success cannot be guaranteed: remote APIs may continue rate-limiting Render egress IPs.
