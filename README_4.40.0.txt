ArbiFlow 4.40.0 — Live Candidate -> Safety Gate Pipeline

Built from validated 4.39.0. Existing 4.39 final execution safety gate is preserved.

New route:
  GET/POST /api/production/base/candidate-safety-pipeline

Behavior:
- Verifies production executor readiness first.
- Performs fresh Morpho discovery.
- If there is no discovery candidate below HF 1.0, returns LIVE_CANDIDATE_SAFETY_PIPELINE_WAIT and does not start an atomic execution test.
- If discovery finds a liquidatable Morpho candidate, automatically sends up to the 3 closest candidates through the exact 4.39 safety gate on fresh disposable Base forks.
- The exact gate performs fresh Morpho accrual without oracle mutation and, only if still liquidatable, verifies production executor bindings, current Kyber route/build, Aave premium, transaction-specific gas + 10% reserve, configured gas ceiling, slippage protection, and >= $15 modeled net profit after reserved gas.
- The first candidate that passes is returned with readyForExplicitExecutionApproval=true. A PASS still cannot broadcast.
- Candidate-specific failures are fail-closed and preserved in evaluated[].
- Duplicate pipeline runs are locked.

Safety:
- readOnly=true
- liveExecutionEnabled=false
- no mainnet signing or broadcast endpoint is added
- no private key is requested
- no mainnet funds are moved
- a passing candidate only advances to a separate explicit-user-approval stage
