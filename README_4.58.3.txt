ArbiFlow 4.58.3 — Nonblocking Readiness Gate Repair
Fixes 4.58.2 startup conflict: server.js previously required ARBIFLOW_FORK_VERIFIED=1 while Startup4300 launched it with 0, so it exited before binding Render's port.
4.58.3 allows only the Startup4300 wrapper to launch the web process while fork verification is pending. Direct server.js launch remains blocked. Live execution remains disabled/fail-closed.
Existing asynchronous opportunity routes are preserved.
