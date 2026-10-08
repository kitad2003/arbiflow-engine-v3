ArbiFlow Phase 8.2 - bounded DEX candidate discovery + existing-scanner evidence bridge
Upload ALL five JavaScript files (server.js, phase82-dex.js, phase8-flashloan.js, phase73-net.js, phase7-cex.js) to the repository root. Preserve other existing repository files and environment settings.

Endpoints:
/api/phase82/status - existing independent DEX scanner evidence plus external candidate counts
/api/phase82/diagnostics - why evidence might be empty
/api/phase82/discover?network=base - MANUAL GeckoTerminal candidate discovery (up to 30 results)
/api/phase82/candidates?network=base - indexed candidates, NOT on-chain verified
/api/dex-independent/run - existing manual on-chain pool discovery (RPC costs and cooldowns apply)
/api/dex-independent/status - existing independent DEX verification state

Important: GeckoTerminal candidate addresses and indexed reserves are not independently verified. They do not count toward the 500 verified liquidity-source target. The candidate cache and existing scanner evidence are in-memory, NOT durable across Render restarts. PostgreSQL persistence, protocol-wide factory enumeration, multi-hop quote graph and atomic fork simulation remain future work.

Safety: no new automatic scans, no broadcasting, no wallet access, no transaction execution. Existing safety settings and other modules are unchanged.
