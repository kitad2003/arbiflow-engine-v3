ArbiFlow 4.37.0 — Unsigned Production Deployment Plan
Intended owner: 0x1d997b6f18bb70da65bab5469eac8c7c2a047394
Adds GET /api/production/base/deployment-plan.
Builds the ArbiFlowAtomicExecutor430 constructor/deployment data in memory, checks Base chain ID, estimates deployment gas from the intended owner, and reports the owner's Base ETH balance.
Deployment calldata is not exposed. No private key is requested or stored. No signature, transaction submission, contract deployment, broadcast, or fund movement occurs.
Constructor bindings: Aave Base Pool + Morpho Blue + intended owner.
