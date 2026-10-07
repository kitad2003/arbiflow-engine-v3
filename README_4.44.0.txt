ArbiFlow Engine 4.44.0

Latency-focused update built from validated 4.43.0.
- Preserves exhaustive 1,000-per-page discovery with no configured total-position cap.
- Preserves exhaustive HF <= 1.01 hot-watch lane.
- Replaces per-candidate Hardhat child-process confirmation in the common path with one in-process disposable Base fork and batched exact Morpho accrueInterest confirmation.
- Accrues each represented market once per confirmation batch.
- Spawns the full production safety/economics gate only when exact accrued HF is truly below 1.0.
- Fails closed on confirmation errors.
- No signing or mainnet broadcast endpoint added. Live execution remains disabled.
