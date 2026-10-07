ArbiFlow Engine 4.56.1 — Route Coverage Diagnostics

Maintenance/diagnostic release based on validated 4.56.0.
Adds explicit failed-route accounting for the four-venue Base graph:
- failure classes: NO_POOL, NO_QUOTE, RPC_ERROR
- per-venue quote success totals/rates
- per-asset quote success totals/rates
- complete failed route list with asset, size, direction, and error
No mainnet execution is enabled. Existing funding, liquidation, depth and minimum-net gates are preserved.
