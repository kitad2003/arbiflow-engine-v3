ArbiFlow Phase 7.3 additive integration

Upload server.js, phase7-cex.js, phase73-net.js to the ROOT of the existing GitHub repository. Replace the first two files; add the third. Keep ALL other files unchanged. Commit and wait for Render deployment.

Status: /api/phase73/status
Manual scenario: /api/phase73/net-compare?capitalUSD=500&buyFeeBps=20&sellFeeBps=20&transferUSD=0

Fee basis points are HYPOTHETICAL USER INPUTS (20 bps=0.20%). No exchange-specific actual fees are verified. Transfer defaults to 0 for pre-funded account scenario; not a claim that transfers are free. Never interpret positive scenario as executable profit.

Safety: read only; no automatic scanning; no trading; no mainnet broadcasting.
