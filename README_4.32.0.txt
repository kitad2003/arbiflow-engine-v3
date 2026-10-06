ArbiFlow Engine 4.32.0 — Production Quote Readiness Gate

Preserves the passing 4.31.1 controlled disposable-fork atomic simulation.

Adds GET /api/zero-x/base/production-readiness.
- Read-only only.
- First checks a small Base WETH->USDC indicative 0x AllowanceHolder price without a taker.
- Firm quote is attempted only when ARBIFLOW_PRODUCTION_EXECUTOR_ADDRESS is a valid address AND already has bytecode on Base.
- Does not deploy an executor, approve tokens, sign transactions, expose calldata, submit transactions, broadcast, or move funds.
- A local/fork-only executor is not accepted as production validation.
- productionZeroXQuoteValidated remains false unless 0x returns a valid firm quote shape for the configured deployed Base executor address.

Live execution remains disabled.
