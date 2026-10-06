ArbiFlow Engine 4.33.0 — KyberSwap Read-Only Route Gate

Preserves the verified 4.32.0 startup/fork architecture and 4.31.1 controlled atomic mechanics.

Adds GET /api/kyberswap/base/route-readiness.
It requests only a Base WETH->USDC route preview from KyberSwap.
It does not request encoded transaction data or calldata and does not connect a wallet, approve, sign, submit, broadcast, or move funds.

Optional environment variables:
ARBIFLOW_KYBER_CLIENT_ID (defaults to ArbiFlow)
ARBIFLOW_KYBER_READINESS_AMOUNT_IN (defaults to 0.0001 WETH raw amount)

Existing 0x diagnostics remain available. Live execution remains disabled.
