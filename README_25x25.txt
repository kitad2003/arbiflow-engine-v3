ArbiFlow 25x25 REGISTRY ONLY add-on

Files: registry.js, test.js, README_25x25.txt.

1. Upload registry.js and test.js to the GitHub repository root alongside server.js.
2. Do NOT replace server.js, package.json, Startup4300.js, or existing README.md.
3. Run: node test.js
4. Expected: PASS: 25 chains, 25 CEXs, unique IDs, disabled integrations, read-only safety

IMPORTANT: This add-on defines inventory metadata ONLY. It does not attach endpoints, APIs, quote engines, exchange credentials, market feeds, RPC connections, DEX discovery, or trading execution. No automatic scans or mainnet broadcasts are enabled. Integrating the registry into the existing engine requires a separately reviewed change to the current server.js source, preserving all existing routes and safety gates.
