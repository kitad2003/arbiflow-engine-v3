ARBIFLOW PHASE 7.2 — FULL INTEGRATED UPDATE

1. Extract ZIP.
2. Upload server.js and phase7-cex.js to GitHub repository ROOT, replacing the existing versions.
3. Leave all other files untouched.
4. Deploy Render. Do not change environment variables.
5. Check /api/phase7/status: stage must read PHASE7_2_MANUAL_PUBLIC_CEX_MARKET_DATA and build 7.2.0.
6. Test /api/phase7/quote?venue=gemini and ?venue=bitstamp.
7. Test /api/phase7/compare. It now includes depthSizedCandidates for $100/$500/$1000.

If UNKNOWN_VENUE still appears with an older build, Render is serving an old deployment or another service/instance. Confirm the deployed commit and restart.

No automated scans, orders, broadcasts or real money execution. Gross spreads are NOT profit.
Exchange fees, inventory, settlement and transfer costs are not verified.
