ArbiFlow 4.78.19 — Phase 6 (final four registered networks)
SOURCE: built from Phase 5 ZIP, preserves existing server.js, registry.js and manual-rpc-probe.js.
INSTALL: Back up GitHub files. Upload server.js and phase6-network-probe.js to repository root. Do NOT overwrite other files.
Render environment keys: RONIN_RPC_URL, MONAD_RPC_URL, SOLANA_RPC_URL, SUI_RPC_URL.
For VERIFIED (not just reachable) Monad, Solana, Sui need independent expected identifiers:
 MONAD_CHAIN_ID (decimal chain ID)
 SOLANA_GENESIS_HASH (mainnet genesis hash)
 SUI_CHAIN_IDENTIFIER (chain identifier returned by sui_getChainIdentifier)
Verify these values from authoritative chain documentation/provider before adding.
Ronin expected chain ID 2020 is built in.
Endpoints: /api/expansion-25x25/phase6-config and /api/expansion-25x25/phase6-probe
Run probe only manually; sequential, read-only; never submits transactions.
RPC connectivity does not enable trading/liquidity adapters or prove profitability.
