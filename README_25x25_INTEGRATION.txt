ArbiFlow 4.78.19 read-only 25x25 registry integration

Upload server.js, registry.js, test.js to GitHub repository root. server.js replaces the existing server.js only after making a backup; the other two files can be updated. Do NOT replace package.json, Startup4300.js, smart contracts, or other modules.

The only server change is a GET /api/expansion-25x25/status route and require('./registry'). It does not enable trading or scanning. Render redeploys automatically if configured.

Verification: node test.js; node --check server.js; visit https://arbiflow-engine-v3.onrender.com/api/expansion-25x25/status. Expect chainCount=25, exchangeCount=25, integrationStage=REGISTRY_ONLY, liveAdaptersEnabled=0, liveConnectionsVerified=0. Existing /api/status and /api/investigator/status should still work.
