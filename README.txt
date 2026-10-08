ArbiFlow Phase 6 Monad + Sui identity fix

Replace ONLY phase6-network-probe.js in GitHub repository root. Do NOT replace server.js, package.json, or scanner code.

Render variables:
MONAD_RPC_URL=https://rpc.monad.xyz
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SUI_GRAPHQL_URL=https://graphql.mainnet.sui.io/graphql

SUI_RPC_URL is legacy JSON-RPC and is no longer used by this module.
SUI_CHAIN_IDENTIFIER is optional; until an independently trusted Sui mainnet identifier is configured, a successful Sui GraphQL request reports REACHABLE_UNVERIFIED, not VERIFIED. Obtain the expected identifier from a trusted independent source; do not blindly copy the result from the same endpoint.

Endpoint: /api/expansion-25x25/phase6-probe
All probes are manual, read-only, sequential via existing server integration. No transaction broadcasts.
