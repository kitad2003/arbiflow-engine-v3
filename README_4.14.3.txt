ArbiFlow 4.14.3 — Explicit Solidity Compile Gate

Purpose:
Fix the 4.14.2 Render failure HH700 (ArbiFlowExecutor414 artifact not found).

Startup order:
1. Require BASE_RPC_URL.
2. Run Hardhat compile --force.
3. Require the ArbiFlowExecutor414 artifact and non-empty bytecode.
4. Run the Base fork harness with --no-compile.
5. Require a PASS report proving ephemeral fork deployment, validatePlan eth_call/gas, and the disabled live entry-point revert.
6. Only then start server.js.

Safety:
No Base-mainnet deployment, signature, flash loan, funds movement, or transaction broadcast is performed by this verification harness. The live execution entry point remains disabled.
