ArbiFlow 4.58.4 — Bounded Concurrent Opportunity Scanner
Repairs the long-running 4.58.3 scan while preserving its successful nonblocking Render startup.
Changes: 3-chain bounded concurrency; bounded pool/quote concurrency; per-scan token-decimal and pool caches; 12-second RPC timeouts; visible status progress counters; ranked positive opportunities retained.
Read-only scanner. No approvals, signatures, swaps, flash requests, mainnet broadcasts, or funds movement. Existing Base/Morpho/Aave/executor architecture preserved.
