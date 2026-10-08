ArbiFlow Phase 6: final Sui identifier verification

Replace ONLY phase6-network-probe.js in your repository root.
Do not replace server.js, package.json, scanner modules or contracts.

SUI_GRAPHQL_URL=https://graphql.mainnet.sui.io/graphql
MONAD_RPC_URL=https://rpc.monad.xyz

The Sui expected identifier is hardcoded from Mysten Labs' public Sui SDK
reference; SUI_CHAIN_IDENTIFIER can override it if explicitly configured.
If SUI_CHAIN_IDENTIFIER is set incorrectly in Render, remove it.

Deploy to Render and manually visit:
https://arbiflow-engine-v3.onrender.com/api/expansion-25x25/phase6-probe

Read-only RPC checks only; no automatic scanning or mainnet broadcasting.
