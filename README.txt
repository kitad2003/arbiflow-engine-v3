ArbiFlow Phase 8.8.0 - Base on-chain pool inventory

Upload ONLY these two files to the root of kitad2003/arbiflow-engine-v3:
  server.js
  phase88-onchain-inventory.js

Keep all other files unchanged. GitHub > Add file > Upload files, then commit.
After Render deploys:
  https://arbiflow-engine-v3.onrender.com/api/liquidity88/status
  https://arbiflow-engine-v3.onrender.com/api/liquidity88/run?blocks=500
  https://arbiflow-engine-v3.onrender.com/api/liquidity88/pools

IMPORTANT:
- Existing Phase 8.7 indexed routes remain unchanged. This is an independent Base RPC factory-event scanner.
- A recent 500-block range may contain zero new pools. That is not proof of malfunction. Optional fromBlock can target an older known range.
- Each venue reads up to 25 logs per scan; the response explicitly flags truncated scans.
- RPC providers can also rate-limit eth_getLogs or eth_call; errors are reported, not hidden.
- Storage defaults to /tmp/arbiflow-phase88-pools.json and is EPHEMERAL on ordinary Render services. For restart durability, configure ARBIFLOW_POOL_INVENTORY_PATH to a mounted persistent disk path (if available). No disk is provisioned by this package.
- No live execution, no quotes, no profit validation, no automatic scanning. Indexed reported TVL is not executable liquidity.
- Phase 8.8 inventory is separate from Phase 8.7 inventory; cross-source matching is not yet implemented.
