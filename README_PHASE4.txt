ArbiFlow 4.78.19 — Phase 4: five more EVM networks (Gnosis, Metis, Sonic, Celo, Unichain)

Upload these four files to the GitHub repository root, replacing matching files: server.js, registry.js, manual-rpc-probe.js, test.js. Back up your current server.js first. Do not modify package.json, startup scripts, or Solidity contracts.

Render > Environment: add your trusted HTTPS RPC endpoint URLs for:
GNOSIS_RPC_URL
METIS_RPC_URL
SONIC_RPC_URL
CELO_RPC_URL
UNICHAIN_RPC_URL

The URLs are not included in this package. Do not share secret API keys or private RPC URLs.

After Render redeploys, inspect:
/api/expansion-25x25/phase4-config
/api/expansion-25x25/phase4-probe

These are read-only eth_chainId probes, triggered only by opening the endpoint. Checks run sequentially with a delay. All existing Phase 2 and Phase 3 endpoints remain present. No background scanning, CEX adapters, swaps, execution, or profitability verification is added.
