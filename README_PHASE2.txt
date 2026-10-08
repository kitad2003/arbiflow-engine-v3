ArbiFlow 4.78.19 Phase 2 — MANUAL RPC CONNECTIVITY

Upload server.js, registry.js, manual-rpc-probe.js, test.js to the repository root.
Back up existing server.js first. Replace the four named files only.
Do not change package.json, Startup4300.js, contracts, or Render environment variables for this step.

Manual endpoints:
  /api/expansion-25x25/status
  /api/expansion-25x25/rpc-config
  /api/expansion-25x25/rpc-probe?chain=base
  /api/expansion-25x25/rpc-probe?chain=arbitrum

rpc-config reports configuration, not verified reachability.
rpc-probe performs ONE explicit eth_chainId RPC request per invocation.
Do not run all 25 probes together: provider rate limits may apply.
Existing configured RPCs remain in use; optional new chains can use KEY_RPC_URL environment variables.
No automatic scans, orders, approvals, signing, or mainnet broadcasts are added.
Non-EVM chains and Monad without a verified chain ID are not probed.
The registry entries do NOT imply live trading or exchange integration.

Local tests: node --check server.js && node --check manual-rpc-probe.js && node test.js
