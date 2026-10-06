ArbiFlow 4.39.0 — Final Mainnet Execution Safety Gate

Built from validated 4.38.0. Existing production-bound fork validation is preserved.

New route:
  GET/POST /api/production/base/execution-safety-gate

The new gate remains read-only with respect to Base mainnet. It starts a fresh disposable Base fork, accrues Morpho interest on the fork without any oracle shock, and refuses to advance unless the candidate is genuinely liquidatable after exact fork accrual. If not, it returns MAINNET_EXECUTION_SAFETY_GATE_WAIT.

For an eligible candidate it verifies the deployed production executor and OWNER/AAVE_POOL/MORPHO bindings, builds a current Kyber route and transaction for the production executor, estimates the candidate-specific full atomic transaction gas on the fork, adds a 10% gas reserve, requires that budget to fit ARBIFLOW_PRODUCTION_MAX_ATOMIC_GAS, and enforces at least $15 modeled net profit after Aave premium and reserved gas cost. Missing pricing, route/build data, gas data, bindings, or profitability fails closed.

Gas ceiling reconciliation: the default ARBIFLOW_PRODUCTION_MAX_ATOMIC_GAS is now 900000 (previous modeled default 750000). The gate does not simply spend this amount: candidate-specific gas is estimated and a 10% reserve must remain <= the configured ceiling. This addresses the 4.38 observation where estimateGas was 816975 while actual fork gas used was 658726.

Safety: live execution remains disabled. This release contains no endpoint that broadcasts a Base mainnet liquidation transaction, requests a private key, or moves mainnet funds. A PASS only advances to a separate explicit-user-approval gate.
