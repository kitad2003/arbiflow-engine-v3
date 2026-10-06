ArbiFlow Engine 4.30.3 - Browser Route Identity Patch

Preserves 4.30.2 fork/atomic logic. Adds browser-verifiable identity and stable aliases.
GET /api/version
GET /api/zero-x/base/access
GET /api/test/zerox/access
GET /api/test/zero-x/access
GET/POST /api/test/base/controlled-atomic

0x access checks remain read-only and never expose ZEROX_API_KEY.
Controlled atomic testing remains disposable-fork-only. No mainnet deployment, signing, broadcast, or funds movement is enabled.
