ArbiFlow 4.78.19 — Phase 3: Five-network manual RPC onboarding

Upload server.js, registry.js, manual-rpc-probe.js, and test.js to the repository root. Keep your startup, Solidity, and package.json files unchanged. Back up server.js first.

Set the following Render environment variables with YOUR trusted HTTPS RPC URLs:
AVALANCHE_RPC_URL
LINEA_RPC_URL
SCROLL_RPC_URL
MANTLE_RPC_URL
ZKSYNC_RPC_URL

No default endpoints or API keys are included. Do not paste private RPC URLs or keys into chat.

After Render deploys, visit:
/api/expansion-25x25/phase3-config
/api/expansion-25x25/phase3-probe

The probe is MANUAL ONLY, sequential, and reads eth_chainId. It does not enable any trading, DEX quotes, scheduled scanning, or execution. Do not interpret VERIFIED as profitable opportunity support.
