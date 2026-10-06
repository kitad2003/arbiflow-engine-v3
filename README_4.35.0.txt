ArbiFlow 4.35.0 — Controlled KyberSwap Atomic Fork Gate
Adds /api/test/base/controlled-kyberswap-atomic.
The test deploys the atomic executor only on a disposable Base fork, makes a controlled fork-only oracle shock, derives exact Morpho liquidation bounds, requests a real KyberSwap collateral->loan route, builds calldata with the fork executor as sender/recipient, and attempts the complete Aave flash-loan + Morpho liquidation + Kyber swap + repayments transaction on the fork.
Kyber routerAddress is used as both swap target and ERC20 approval spender per KyberSwap Aggregator API documentation.
No mainnet deployment, signing, broadcast, or real fund movement. Fail closed on any route/build/output/execution mismatch.
