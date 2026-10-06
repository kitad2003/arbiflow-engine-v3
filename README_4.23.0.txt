ArbiFlow Engine 4.23.0 — Direct Morpho Discovery to Batch Fork Eligibility Gate

Purpose
4.23 fixes the 4.22 scan-order coupling where the fork accrual gate received only routeBot.bestByPosition. A 0x quote timeout or gas-pricing failure could therefore cause positionsChecked=0 even when Morpho discovery had near-liquidation borrowers.

4.23 flow
1. MORPHO_LIQUIDATION_BOT discovers Base Morpho positions.
2. LIQUIDATION_READINESS_BOT deduplicates opportunities + watchlist, ranks by lowest health factor, and selects the closest 3 positions directly.
3. One disposable Base fork is launched for the selected candidates.
4. One local block is mined to avoid EDR historical-block execution.
5. Each unique Morpho market is accrued exactly once.
6. Every selected borrower is reread against the accrued market state.
7. exactAccruedEligibility becomes true only when the exact-at-fork accrued state is confirmed and unhealthy.
8. Route/0x data is joined only if available. Missing route data is a downstream blocker, not a reason to skip eligibility.

Expected scan proof
- positionsChecked: 3 when at least 3 Morpho positions are discovered
- candidateSelection.source: MORPHO_LIQUIDATION_BOT_DIRECT
- forkAccrualGate.candidatesChecked: 3
- forkAccrualGate.uniqueMarketsAccrued: count of distinct selected market IDs (expected 2 for the previously observed top 3)
- non-null sourceForkBlockNumber and protocolExecutionBlockNumber
- exactForkAccruedState on each selected candidate

Safety
Mainnet execution remains disabled. No private key, signature, Base-mainnet deployment, transaction broadcast, flash loan, liquidation, or fund movement is performed. Protocol-valid repay/seize bounds, transaction-specific gas, min-output binding, fresh execution route, and atomic fork simulation remain mandatory downstream gates.
