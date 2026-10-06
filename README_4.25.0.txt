ArbiFlow Engine 4.25.0 — Post-Eligibility Firm 0x Quote Gate

Purpose
Preserve the validated 4.24 Morpho pipeline and add a separate execution-quote stage that can run only after exact fork-accrued liquidation eligibility and exact protocol-valid repay/seize sizing both pass.

Validated foundation preserved
1. Direct Morpho discovery selects the closest positions independently of route-provider success.
2. One disposable Base fork is created and advanced one local block.
3. Each unique Morpho market is accrued once.
4. Borrower state is reread and exact fork health is computed.
5. Morpho liquidation incentive and collateral-capped repay/seize bounds use protocol rounding.

4.25 firm quote gate
- Uses 0x Swap API v2 /swap/allowance-holder/quote with chainId 8453.
- Runs only when exactAccruedLiquidatable and exactProtocolValidRepaySeizeBound are true.
- Sells the exact seizedAssetsInputRaw collateral amount into the Morpho debt asset.
- Requires a valid ARBIFLOW_QUOTE_TAKER address; absence fails closed.
- Captures the API-returned allowance spender rather than inventing an approval target.
- Captures transaction.to, transaction.data, transaction.value, transaction.gas and transaction.gasPrice.
- Requires buyAmount and minBuyAmount to be positive and internally consistent.
- Reports firmExecutionQuoteBound and minOutputBoundToFirmQuote separately from atomic-transaction readiness.
- 12 second bounded quote timeout; failures are explicit.

Safety
Mainnet execution remains hard-disabled. No private key is required. No token approval, signature, flash loan, liquidation, transaction broadcast, or funds movement occurs. A firm quote is read-only preparation, not proof that an atomic liquidation transaction is executable. Transaction-specific atomic gas estimation and full fork execution remain downstream gates.
