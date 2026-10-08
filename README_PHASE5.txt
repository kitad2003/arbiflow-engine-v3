ArbiFlow 4.78.19 Phase 5 — manual RPC onboarding
SOURCE: Phase 4 ZIP, retaining all earlier routes and scanner features.
Back up current GitHub files before replacing. This package assumes the running GitHub code matches Phase 4.
Upload server.js, registry.js, manual-rpc-probe.js, test.js to repository root.
Do not replace package.json, startup scripts, or contracts.
Set Render Environment keys (values are HTTPS RPC provider URLs):
CRONOS_RPC_URL
HYPEREVM_RPC_URL
BERACHAIN_RPC_URL
SEI_RPC_URL
ABSTRACT_RPC_URL
After Render redeploy:
GET /api/expansion-25x25/phase5-config
GET /api/expansion-25x25/phase5-probe
Probe is manual, sequential, eth_chainId-only, with 1.2s gaps. Avoid repeated calls if provider responds 429.
No auto scans or mainnet broadcasting added. Connectivity is not liquidity/trading verification.
