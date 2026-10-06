ArbiFlow 4.38.0 — Production-Bound Fork Validation Gate

Built directly from validated 4.37.2.
Adds /api/test/base/production-bound-fork (GET/POST).
The gate first requires the production deployment-readiness checks to pass, then starts a disposable Base fork, uses the configured real production executor address already present in forked Base state, verifies OWNER/AAVE_POOL/MORPHO bindings, impersonates the configured owner only inside Hardhat, builds Kyber calldata with the production executor as sender/recipient, and executes the atomic Aave -> Morpho -> Kyber -> repayment path only on the disposable fork.

Profit gate: requires configured minimum net profit >= $15 after a modeled gas reserve using ARBIFLOW_PRODUCTION_MAX_ATOMIC_GAS (default 750000), current fork gas price, and quote-derived USD pricing. If required USD/gas pricing or route headroom is unavailable, validation fails closed.

Safety: live execution remains hard-disabled. No private key is requested. No signature, mainnet transaction submission, broadcast, or mainnet fund movement occurs. A controlled oracle shock may be used only on the disposable fork to exercise the liquidation path; the report labels this synthetic fork mutation and never claims current mainnet eligibility.
