ArbiFlow Phase 8.6: Dynamic Base V3 liquidity discovery (manual, read-only)
Upload ALL .js files to the existing repository root, preserving other repository files.
Deploy, then open /api/liquidity86/run?blocks=1000 and poll /api/liquidity86/status.
Pool inventory: /api/liquidity86/pools?limit=50
To scan a specific range: /api/liquidity86/run?fromBlock=52328000&blocks=1000
NOTE: recent windows can contain ZERO new pools; this is not necessarily an error.
This is a bounded factory-event proof of discovery, not a complete historical index.
Pool registry is in memory and will reset on redeployment/restart.
No flash loans, transactions, or profit claims. Keep safety flags OFF for execution.
