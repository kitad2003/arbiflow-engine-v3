ArbiFlow 4.14.4 - Explicit Solidity Source Path Fix

Purpose:
- Fix the 4.14.3 Render failure where Hardhat printed "Nothing to compile".
- Avoid dependence on GitHub/browser preserving a nested contracts folder.

Startup sequence:
1. Require BASE_RPC_URL and local Hardhat.
2. Verify root ArbiFlowExecutor414.sol exists and passes basic source-integrity checks.
3. Recreate .arbiflow-contracts at startup and copy the verified root source into it.
4. Hardhat is explicitly configured to use .arbiflow-contracts as its source directory.
5. Clear stale artifacts/cache, compile with --force, recursively verify a real artifact with bytecode exists.
6. Run BaseForkTest4144.js against the ephemeral Hardhat Base fork.
7. Deploy executor only on the fork, call validatePlan, estimate gas, and prove executeLiquidationPlan reverts.
8. Require mainnetBroadcast=false and fundsMoved=false.
9. Start server.js only after all gates pass.

No real Base transaction is broadcast. No funds move. Live execution remains disabled.
