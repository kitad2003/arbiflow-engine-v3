ArbiFlow Engine 4.15.3 — Base EDR Protocol-Read Fix

Fixes the 4.15.0/4.15.1 startup failure:
"No known hardfork for execution on historical block ... chain with id 8453"

Architecture:
1. Compile ArbiFlowExecutor414 locally.
2. Read Morpho, Aave Pool and 0x AllowanceHolder directly from BASE_RPC_URL (read-only).
3. Verify the known Morpho market and current Aave flash-loan premium through Base RPC.
4. Use the ephemeral Hardhat Base fork only for ArbiFlow executor deployment/safety calls.
5. Verify validatePlan, gas estimates and hard-disabled live entry.
6. Start server only if every gate passes.

No private key is requested. No Base-mainnet transaction is broadcast. No funds move.
