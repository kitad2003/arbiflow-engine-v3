ArbiFlow 4.59.1 — Candidate-First Exact Validation

Connects the 4.59.0 Fast Opportunity Graph to a bounded exact-quote validator.
Only ranked graph candidates above the configurable preliminary spread threshold are promoted.
Both fee-tier directions are exact-tested to avoid directional bias.
The 4.58.6 brute-force multichain scanner remains available only as a diagnostic fallback.

Routes:
  /api/opportunities/graph/start
  /api/opportunities/graph/status
  /api/opportunities/candidates/start
  /api/opportunities/candidates/status

Defaults:
  ARBIFLOW_CANDIDATE_MIN_SPREAD_PCT=0.01
  ARBIFLOW_CANDIDATE_LIMIT=60

Safety: read-only. No approvals, signatures, swaps, flash requests, mainnet broadcasts, or funds movement are added by this release.
