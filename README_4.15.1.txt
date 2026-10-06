ArbiFlow Engine 4.15.1 — Base Fork Hardfork-History Fix

Purpose
- Fix the 4.15.0 Hardhat HH/EDR historical-block execution failure on Base chain 8453.
- Explicitly supplies Hardhat 2 with a Base chain hardfork history for the current post-Cancun fork block.
- Keeps the 4.15 protocol fork gate: Morpho market read, Aave flash premium read, 0x AllowanceHolder code check, executor deployment and disabled-live-entry safety test.
- No Base-mainnet transaction broadcast. No funds moved.

Safety
- Startup remains fail-closed. The web service starts only after the fork verification passes.
- Live liquidation execution remains disabled.
