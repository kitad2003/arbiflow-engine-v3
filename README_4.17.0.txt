ArbiFlow Engine 4.17.0 — Broad Opportunity Discovery

Purpose
- Shift priority from one watched liquidation borrower to broader opportunity discovery.
- Preserve the verified Base protocol read + ephemeral executor fork startup gate.
- Keep all execution disabled and fail closed.

Discovery changes
- Morpho discovery expands from the top 12 Base borrow markets to the top 50.
- The Morpho position discovery request remains bounded at 100 largest borrow-share positions for reliability.
- Morpho near-liquidation watch range expands from HF <= 1.05 to HF <= 1.10.
- Morpho WATCH positions are added to the unified rankedOpportunityQueue as non-executable candidates.
- Existing direct spread, triangular arbitrage, stablecoin dislocation, Aave liquidation, watcher, size discovery, optimizer and aggregator-intelligence bots remain active.
- Expensive sizing remains gated behind promising/raw-positive candidates.

Safety
- No wallet required.
- No private key required.
- No flash loan requested.
- No mainnet transaction broadcast.
- No funds moved.
- Live execution remains hard-disabled.
- Minimum net-profit floor remains $15; discovery/watch signals do not count as executable profit.

Deploy
Extract the ZIP and upload all files to the arbiflow-engine-v3 repository root. Commit to main and allow Render Auto-Deploy to run. No Render environment-variable changes are required.
