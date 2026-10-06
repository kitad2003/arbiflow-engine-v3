ArbiFlow 4.15.0 — Protocol Fork Integration + Real Liquidation Simulation Gate

This build preserves the fail-closed 4.14.4 startup test and adds fork verification of the live Base Morpho singleton, Aave V3 Pool, current Aave flash-loan premium read, the 0x AllowanceHolder contract, and a known Morpho market resolution.

Important: it does NOT fabricate or force a liquidation during startup. A true end-to-end liquidation simulation requires a freshly unhealthy live position. If none exists, the runtime reports WAITING_FOR_FRESH_LIVE_LIQUIDATABLE_CANDIDATE. Live execution remains hard-disabled. No Base-mainnet transaction is broadcast and no funds move.
