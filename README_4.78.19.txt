ArbiFlow 4.78.19 — Phase 1, historical liquidation/flash-loan evidence inspection.
Upload server.js, package.json, LiquidationInvestigator47819.js to existing GitHub repo root. Keep all other existing repo files unchanged. Do not upload ZIP or README.
Manual endpoints:
/api/investigator/status
/api/investigator/inspect?chain=base&hash=0x<64-hex-character-transaction-hash>
Also supports chain=arbitrum and chain=optimism.
The inspect endpoint reads an on-chain transaction receipt and decodes Aave-style event signatures only. It does NOT verify the emitting contract belongs to Aave, prove flash loan repayment, reconstruct collateral swaps, calculate profit, discover open liquidations, or execute a fork simulation. No trade or loan is made.
This is the first evidence-collection phase, not a finished liquidation engine. Use real independently sourced transaction hashes. Manual-only; at most one concurrent request. Existing 4.78.18 scanner and auto-discovery flags remain unchanged.
