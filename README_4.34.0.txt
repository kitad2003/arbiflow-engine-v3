ArbiFlow Engine 4.34.0 — KyberSwap Transaction Build Gate
Preserves 4.33.0 route readiness and prior fork/atomic mechanics.
Adds GET /api/kyberswap/base/build-readiness.
Fetches a fresh route, sends the exact routeSummary to KyberSwap route/build, and validates returned router, amounts and calldata presence.
Calldata is never exposed. Gas estimation is disabled. No wallet connection, approval, signing, submission, broadcast or fund movement occurs.
Default placeholder sender is used only for build-shape validation unless ARBIFLOW_KYBER_BUILD_SENDER is configured.
Live execution remains disabled.
