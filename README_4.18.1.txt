ArbiFlow Engine 4.18.1 — Morpho Unit Normalization + Quote Diagnostics

Targeted changes from 4.18.0:
- Normalizes Morpho raw borrow/collateral base units using token decimals before deriving USD prices.
- Preserves raw amounts and human token amounts separately.
- Adds fallback USD/token price derivation from normalized asset amount.
- Moves liquidation route conversion validation inside fail-closed error handling.
- Adds sellAmountBaseUnits, token decimals, price source and detailed route failure diagnostics.
- Adds an implied-price sanity guard before accepting a 0x liquidation exit quote.
- Preserves the verified 4.18.0 ephemeral Base fork startup harness and keeps live execution hard-disabled.

No wallet/private key is required. No transaction is broadcast. No funds move.
