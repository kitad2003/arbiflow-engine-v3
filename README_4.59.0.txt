ArbiFlow 4.59.0 — Fast Opportunity Graph Engine
Adds a read-only Stage-1 market graph ahead of the existing 4.58.6 exact-quote scanner.
Pipeline: pool-state discovery -> normalized pair/fee-tier graph -> preliminary spread candidates -> separate exact validation.
Preserves the 4.58.6 scanner, Base four-DEX graph, Morpho liquidation, Morpho flash liquidity, Aave fallback and production executor.
No approvals, signatures, swaps, flash requests, broadcasts or funds movement are performed by the new graph routes.
Routes:
  /api/opportunities/graph/start
  /api/opportunities/graph/status
Existing exact scanner routes remain unchanged.
