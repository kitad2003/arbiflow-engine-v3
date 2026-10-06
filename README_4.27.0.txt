ArbiFlow Engine 4.27.0 — Atomic Payload + Gas Blueprint Gate

Validated baseline preserved from 4.25.0:
- direct Morpho discovery
- disposable Base fork
- Morpho accrueInterest and exact post-accrual health
- exact Morpho repay/seize bound
- firm 0x AllowanceHolder quote only after exact eligibility
- live/mainnet execution hard-disabled

New in 4.27.0:
- binds an eligible candidate into a read-only atomic payload blueprint:
  Aave V3 flash debt asset -> Morpho liquidation -> exact collateral approval -> 0x collateral exit -> flash repayment
- carries exact raw flash amount, estimated Aave premium, Morpho seizedAssets input,
  expected derived repaid shares/assets, 0x spender/target/calldata/value, buyAmount and minBuyAmount
- checks whether the firm quote minimum output covers flash principal + premium
- records 0x transaction gas/gasPrice only as a SWAP-LEG provider estimate
- explicitly refuses to call swap-leg gas an atomic transaction gas estimate
- full transaction-specific gas remains blocked until a callable atomic executor exists
- no signing, private key, approval, broadcast, or mainnet funds movement

Optional environment variable retained:
ARBIFLOW_QUOTE_TAKER
Must be the actual future atomic executor/taker address. Do not invent one.

Validation sequence:
1. Deploy to Render.
2. Startup must report PROTOCOL FORK STARTUP VERIFICATION PASS.
3. Run /api/bots/base/scan.
4. Healthy candidates should show atomicPayloadBlueprint.status = NOT_BUILT_UNTIL_EXACT_BOUND_AND_FIRM_QUOTE.
5. If an exact liquidatable candidate appears and a firm quote binds, inspect the blueprint and coverage fields before any later executor work.
